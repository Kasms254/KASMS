
import logging
from django.db import transaction
from django.db.models import Prefetch, Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import (
    CourseReport, CourseReportStageRemark, CourseReportAuditLog,
    Class, Enrollment, OICAssignment,
)
from .serializers import (
    CourseReportListSerializer, CourseReportDetailSerializer,
    CourseReportBulkCreateSerializer, CourseReportRemarkWriteSerializer,
    InstructorRemarkWriteSerializer, CourseReportStageRemarkSerializer,
    CourseReportAuditLogSerializer,
)
from .permissions import IsCourseReportParticipant, CanWriteCourseReportRemark

logger = logging.getLogger(__name__)


class CourseReportViewSet(viewsets.ModelViewSet):

    permission_classes = [IsAuthenticated, IsCourseReportParticipant]
    http_method_names = ['get', 'post', 'head', 'options']

    def _get_role(self):
        user = self.request.user
        return getattr(user, 'active_role', None) or getattr(user, 'role', None)

    def _get_school(self):
        return self.request.user.school

    def _check_school(self, obj):
        if obj.school_id != self._get_school().id:
            from django.http import Http404
            raise Http404

    def _get_instructor_class_ids(self):
        return Class.objects.filter(
            school=self._get_school(),
            instructor=self.request.user,
            is_active=True,
        ).values_list('id', flat=True)

    def _get_oic_class_ids(self):
        return OICAssignment.objects.filter(
            school=self._get_school(),
            oic=self.request.user,
            is_active=True,
        ).values_list('class_obj_id', flat=True)

    def get_queryset(self):
        school = self._get_school()
        role = self._get_role()

        qs = CourseReport.objects.filter(
            school=school,
            is_active=True,
        ).select_related(
            'enrollment__student',
            'class_obj__course',
            'created_by',
        )


        if role == 'instructor':
            qs = qs.filter(class_obj_id__in=self._get_instructor_class_ids())
        elif role == 'oic':
            qs = qs.filter(class_obj_id__in=self._get_oic_class_ids())

        return qs

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return CourseReportDetailSerializer
        if self.action == 'bulk_create':
            return CourseReportBulkCreateSerializer
        return CourseReportListSerializer

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()

        class_id = request.query_params.get('class_id')
        if class_id:
            qs = qs.filter(class_obj_id=class_id)

        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        report = self.get_object()
        self._check_school(report)
        role = self._get_role()

        visible_stages = report.get_visible_stages_for_role(role)
        visible_remarks = report.stage_remarks.filter(
            stage__in=visible_stages
        ).select_related('author')

        can_edit = report.status in CourseReport.ROLE_WRITE_STATUSES.get(role, ())
        can_submit = can_edit and report.stage_remarks.filter(
            stage=CourseReport.SUBMIT_REQUIRES_STAGE.get(report.status, ''),
            is_submitted=False,
        ).exists()
        can_advance = report.status in CourseReport.ADVANCE_ROLE_STATUS.values() and \
            CourseReport.ADVANCE_ROLE_STATUS.get(role) == report.status
        can_download = (
            report.status == 'approved' and
            report.report_file and
            role == 'instructor' and
            report.class_obj.instructor_id == request.user.id
        )

        serializer = self.get_serializer(report)
        data = serializer.data
        data['visible_remarks'] = CourseReportStageRemarkSerializer(
            visible_remarks, many=True
        ).data
        data['can_edit'] = can_edit
        data['can_submit'] = can_submit
        data['can_advance'] = can_advance
        data['can_download'] = bool(can_download)

        return Response(data)

    @action(detail=False, methods=['post'], url_path='bulk-create')
    def bulk_create(self, request):

        role = self._get_role()
        if role != 'instructor':
            return Response(
                {'detail': 'Only instructors can initiate course reports.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = CourseReportBulkCreateSerializer(
            data=request.data, context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        cls = serializer.validated_data['class_obj']

        enrollments = Enrollment.objects.filter(
            class_obj=cls,
            school=self._get_school(),
            is_active=True,
        ).exclude(
            course_reports__is_active=True,
        ).select_related('student')

        if not enrollments.exists():
            return Response(
                {'detail': 'No eligible students — all already have active reports or no active enrollments.'},
                status=status.HTTP_409_CONFLICT,
            )

        created_reports = []
        with transaction.atomic():
            for enrollment in enrollments:
                report = CourseReport(
                    school=self._get_school(),
                    enrollment=enrollment,
                    class_obj=cls,
                    status='instructor_draft',
                    created_by=request.user,
                )
                report.save()
                created_reports.append(report)

            if created_reports:
                self._log_audit(
                    report=created_reports[0],
                    action='bulk_created',
                    user=request.user,
                    metadata={
                        'class_id': str(cls.id),
                        'class_name': str(cls),
                        'count': len(created_reports),
                        'student_ids': [str(r.enrollment.student_id) for r in created_reports],
                    },
                )

        result = CourseReportListSerializer(created_reports, many=True).data
        return Response(
            {
                'detail': f'Created {len(created_reports)} course reports.',
                'reports': result,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True, methods=['post'], url_path='save-remark',
        permission_classes=[IsAuthenticated, IsCourseReportParticipant, CanWriteCourseReportRemark],
    )
    def save_remark(self, request, pk=None):

        report = self.get_object()
        self._check_school(report)
        role = self._get_role()

        stage = self._role_to_stage(role)
        if not stage:
            return Response(
                {'detail': 'Your role cannot write remarks.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        prerequisite = CourseReportStageRemark.PREREQUISITE_STAGE.get(stage)
        if prerequisite:
            prereq_exists = report.stage_remarks.filter(
                stage=prerequisite, is_submitted=True
            ).exists()
            if not prereq_exists:
                return Response(
                    {'detail': f'The {prerequisite} remark must be submitted first.'},
                    status=status.HTTP_409_CONFLICT,
                )

        if stage == 'instructor':
            serializer = InstructorRemarkWriteSerializer(data=request.data)
        else:
            serializer = CourseReportRemarkWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if stage == 'instructor':
            instructor_fields = {
                k: serializer.validated_data[k]
                for k in (
                    'character_and_personality', 'knowledge_and_ability',
                    'command_and_leadership', 'strengths', 'weaknesses',
                    'deployment_recommendation',
                )
            }
            defaults = {'author': request.user, **instructor_fields}
        else:
            defaults = {'author': request.user, 'content': serializer.validated_data['content']}

        remark, created = CourseReportStageRemark.objects.get_or_create(
            report=report,
            stage=stage,
            defaults=defaults,
        )

        if not created:
            if remark.is_submitted:
                return Response(
                    {'detail': 'This remark has already been submitted and cannot be edited.'},
                    status=status.HTTP_409_CONFLICT,
                )
            if stage == 'instructor':
                for field, value in instructor_fields.items():
                    setattr(remark, field, value)
            else:
                remark.content = serializer.validated_data['content']
            remark.save()

        self._log_audit(
            report=report,
            action='remark_saved',
            user=request.user,
            metadata={'stage': stage, 'created': created},
        )

        return Response(
            CourseReportStageRemarkSerializer(remark).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(
        detail=True, methods=['post'], url_path='submit',
        permission_classes=[IsAuthenticated, IsCourseReportParticipant, CanWriteCourseReportRemark],
    )
    def submit(self, request, pk=None):

        report = self.get_object()
        self._check_school(report)
        role = self._get_role()
        stage = self._role_to_stage(role)

        if not stage:
            return Response(
                {'detail': 'Your role cannot submit at this stage.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            remark = report.stage_remarks.get(stage=stage)
        except CourseReportStageRemark.DoesNotExist:
            return Response(
                {'detail': f'No {stage} remark found. Save a remark before submitting.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if remark.is_submitted:
            return Response(
                {'detail': 'This remark has already been submitted.'},
                status=status.HTTP_409_CONFLICT,
            )

        next_status = CourseReport.VALID_TRANSITIONS.get(report.status)
        if not next_status:
            return Response(
                {'detail': f'Cannot advance from status "{report.status}".'},
                status=status.HTTP_409_CONFLICT,
            )

        old_status = report.status
        with transaction.atomic():
          
            remark.is_submitted = True
            CourseReportStageRemark.objects.filter(pk=remark.pk).update(is_submitted=True)

            report.status = next_status
            report.save(update_fields=['status', 'updated_at'])

            self._log_audit(
                report=report,
                action='remark_submitted',
                user=request.user,
                metadata={'stage': stage},
            )
            self._log_audit(
                report=report,
                action='approved' if next_status == 'approved' else 'status_changed',
                user=request.user,
                metadata={'old_status': old_status, 'new_status': next_status},
            )

        if next_status == 'approved':
            try:
                from .course_report_pdf import generate_course_report_pdf
                generate_course_report_pdf(report)
                self._log_audit(
                    report=report,
                    action='pdf_generated',
                    user=request.user,
                    metadata={},
                )
            except Exception:
                logger.exception("PDF generation failed for report %s", report.pk)

        return Response({
            'detail': 'Report approved.' if next_status == 'approved'
                      else f'Remark submitted. Status advanced to {next_status}.',
            'status': next_status,
        })


    @action(detail=False, methods=['post'], url_path='bulk-submit')
    def bulk_submit(self, request):

        role = self._get_role()
        stage = self._role_to_stage(role)
        if not stage:
            return Response(
                {'detail': 'Your role cannot submit remarks.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        class_id = request.data.get('class_id')
        if not class_id:
            return Response(
                {'detail': 'class_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reports = self.get_queryset().filter(
            class_obj_id=class_id,
            status=CourseReport.SUBMIT_ROLE_STATUS.get(role),
        ).prefetch_related('stage_remarks')

        if not reports.exists():
            return Response(
                {'detail': 'No reports at your stage found for this class.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        submitted_count = 0
        skipped_count = 0
        errors = []

        with transaction.atomic():
            for report in reports:
                try:
                    remark = report.stage_remarks.get(stage=stage)
                except CourseReportStageRemark.DoesNotExist:
                    skipped_count += 1
                    continue

                if remark.is_submitted:
                    skipped_count += 1
                    continue

                next_status = CourseReport.VALID_TRANSITIONS.get(report.status)
                if not next_status:
                    skipped_count += 1
                    continue

                old_status = report.status

                CourseReportStageRemark.objects.filter(pk=remark.pk).update(is_submitted=True)

                report.status = next_status
                report.save(update_fields=['status', 'updated_at'])

                self._log_audit(
                    report=report,
                    action='bulk_submitted',
                    user=request.user,
                    metadata={
                        'stage': stage,
                        'old_status': old_status,
                        'new_status': next_status,
                    },
                )
                submitted_count += 1

        return Response({
            'detail': f'Submitted {submitted_count} reports. Skipped {skipped_count} (no remark or already submitted).',
            'submitted': submitted_count,
            'skipped': skipped_count,
        })


    @action(detail=True, methods=['post'], url_path='advance')
    def advance(self, request, pk=None):

        report = self.get_object()
        self._check_school(report)
        role = self._get_role()

        expected_status = CourseReport.ADVANCE_ROLE_STATUS.get(role)
        if not expected_status or report.status != expected_status:
            return Response(
                {'detail': f'Your role cannot advance a report in status "{report.status}".'},
                status=status.HTTP_403_FORBIDDEN,
            )

        next_status = CourseReport.VALID_TRANSITIONS.get(report.status)
        if not next_status:
            return Response(
                {'detail': 'No valid transition from current status.'},
                status=status.HTTP_409_CONFLICT,
            )

        old_status = report.status
        report.status = next_status
        report.save(update_fields=['status', 'updated_at'])

        self._log_audit(
            report=report,
            action='status_changed',
            user=request.user,
            metadata={'old_status': old_status, 'new_status': next_status},
        )

        return Response({
            'detail': f'Report advanced to {next_status}.',
            'status': next_status,
        })


    @action(detail=False, methods=['post'], url_path='bulk-advance')
    def bulk_advance(self, request):

        role = self._get_role()
        expected_status = CourseReport.ADVANCE_ROLE_STATUS.get(role)
        if not expected_status:
            return Response(
                {'detail': 'Your role cannot advance reports.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        class_id = request.data.get('class_id')
        if not class_id:
            return Response(
                {'detail': 'class_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        next_status = CourseReport.VALID_TRANSITIONS.get(expected_status)
        if not next_status:
            return Response(
                {'detail': 'No valid transition.'},
                status=status.HTTP_409_CONFLICT,
            )

        reports = self.get_queryset().filter(
            class_obj_id=class_id,
            status=expected_status,
        )

        count = reports.count()
        if not count:
            return Response(
                {'detail': 'No reports to advance for this class.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        with transaction.atomic():
            reports.update(status=next_status)

            first_report = self.get_queryset().filter(
                class_obj_id=class_id, status=next_status
            ).first()
            if first_report:
                self._log_audit(
                    report=first_report,
                    action='status_changed',
                    user=request.user,
                    metadata={
                        'bulk_advance': True,
                        'class_id': str(class_id),
                        'old_status': expected_status,
                        'new_status': next_status,
                        'count': count,
                    },
                )

        return Response({
            'detail': f'Advanced {count} reports to {next_status}.',
            'advanced': count,
            'new_status': next_status,
        })


    @action(detail=True, methods=['get'], url_path='audit-log')
    def audit_log(self, request, pk=None):
        role = self._get_role()
        if role not in ('admin', 'superadmin', 'commandant', 'chief_instructor'):
            return Response(
                {'detail': 'You do not have permission to view audit logs.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        report = self.get_object()
        self._check_school(report)

        logs = report.audit_logs.select_related('performed_by').all()
        serializer = CourseReportAuditLogSerializer(logs, many=True)
        return Response(serializer.data)


    @action(detail=True, methods=['get'], url_path='download')
    def download(self, request, pk=None):
        report = self.get_object()
        self._check_school(report)

        role = self._get_role()

        # Only the instructor of that specific class may download.
        if role != 'instructor' or report.class_obj.instructor_id != request.user.id:
            return Response(
                {'detail': 'Only the class instructor may download course reports.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if report.status != 'approved':
            return Response(
                {'detail': 'Report is not yet approved.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not report.report_file:
            return Response(
                {'detail': 'PDF has not been generated yet.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        self._log_audit(
            report=report,
            action='pdf_downloaded',
            user=request.user,
            metadata={},
        )

        from django.http import FileResponse
        return FileResponse(
            report.report_file.open('rb'),
            content_type='application/pdf',
            as_attachment=True,
            filename=f"course_report_{report.enrollment.student.svc_number or report.enrollment.student.username}.pdf",
        )

    def create(self, request, *args, **kwargs):
        return Response(
            {'detail': 'Use /bulk-create/ to initiate course reports.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def update(self, request, *args, **kwargs):
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def partial_update(self, request, *args, **kwargs):
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def destroy(self, request, *args, **kwargs):
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

    @staticmethod
    def _role_to_stage(role):
        mapping = {
            'instructor': 'instructor',
            'oic': 'oic',
            'chief_instructor': 'chief_instructor',
            'commandant': 'commandant',
        }
        return mapping.get(role)

    @staticmethod
    def _log_audit(report, action, user, metadata=None):
        try:
            CourseReportAuditLog.objects.create(
                report=report,
                action=action,
                performed_by=user,
                metadata=metadata or {},
            )
        except Exception:
            logger.exception(f"Failed to write audit log: {action} on {report.id}")