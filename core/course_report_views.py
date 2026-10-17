
import logging
import os
from django.db import IntegrityError, transaction
from django.db.models import Prefetch, Q
from rest_framework import filters, viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser

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
from .course_report_academics import (
    build_snapshot, live_summaries, ranking_key, report_summaries, report_summary,
)
from .views import PageSizeAwarePagination

logger = logging.getLogger(__name__)

_ALLOWED_PHOTO_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}
_ALLOWED_PHOTO_MIME_TYPES = {'image/jpeg', 'image/png', 'image/webp'}
_MAX_PHOTO_SIZE = 2 * 1024 * 1024  # 2 MB

# ?ordering= values accepted by the list endpoint, mapped to "descending?".
# Complete reports sort first, then provisional, then those with no average;
# equal averages fall back to student name, then svc number.
_MEAN_SCORE_ORDERINGS = {'-mean_score': True, 'mean_score': False}


def _student_sort_key(report):
    student = report.enrollment.student
    return (
        (student.last_name or '').lower(),
        (student.first_name or '').lower(),
        student.svc_number or '',
        str(report.id),
    )


class CourseReportViewSet(viewsets.ModelViewSet):

    permission_classes = [IsAuthenticated, IsCourseReportParticipant]
    http_method_names = ['get', 'post', 'head', 'options']
    pagination_class = PageSizeAwarePagination
    search_fields = [
        'enrollment__student__first_name',
        'enrollment__student__last_name',
        'enrollment__student__svc_number',
    ]

    def _get_role(self):
        user = self.request.user
        role = getattr(user, 'active_role', None) or getattr(user, 'role', None)
        return role.replace(' ', '_') if role else role

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
            'school',
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

        # ?search= from the list page. Only SearchFilter is applied: the global
        # OrderingFilter would accept arbitrary ?ordering= fields.
        qs = filters.SearchFilter().filter_queryset(request, qs, self)

        descending = _MEAN_SCORE_ORDERINGS.get(request.query_params.get('ordering'))
        if descending is None:
            reports = qs
            summaries = None
        else:
            # The ranking metric is computed in Python (POLICY subjects use the
            # component-grading service), so the whole filtered set is ranked
            # before pagination.
            reports = sorted(qs, key=_student_sort_key)
            summaries = report_summaries(reports)
            reports.sort(key=lambda r: ranking_key(summaries[r.id], descending))

        page = self.paginate_queryset(reports)
        items = page if page is not None else list(reports)
        if summaries is None:
            summaries = report_summaries(items)
        serializer = self.get_serializer(
            items, many=True, context={**self.get_serializer_context(), 'academic_summaries': summaries},
        )
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        report = self.get_object()
        self._check_school(report)
        role = self._get_role()

        visible_stages = report.get_visible_stages_for_role(role)
        visible_remarks = list(report.stage_remarks.filter(
            stage__in=visible_stages
        ).select_related('author'))

        is_own_turn = report.status in CourseReport.ROLE_WRITE_STATUS.get(role, ())
        can_edit = is_own_turn
        if not can_edit and role in CourseReport.CORRECTABLE_ROLES and report.status != 'approved':
            can_edit = any(r.stage == role and r.is_submitted for r in visible_remarks)
        can_submit = is_own_turn and report.stage_remarks.filter(
            stage=CourseReport.SUBMIT_REQUIRES_STAGE.get(report.status, ''),
            is_submitted=False,
        ).exists()
        can_advance = report.status in CourseReport.ADVANCE_ROLE_STATUS.values() and \
            CourseReport.ADVANCE_ROLE_STATUS.get(role) == report.status
        can_download = (
            report.status == 'approved' and
            role == 'instructor' and
            report.class_obj.instructor_id == request.user.id
        )
        can_edit_photo = (
            report.status != 'approved' and
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
        data['can_edit_photo'] = bool(can_edit_photo)

        class_obj = report.class_obj
        data['academic_data'] = report_summary(report)
        data['school_short_name'] = report.school.short_name or report.school.code
        data['class_code'] = class_obj.class_code or class_obj.course.code
        data['start_date'] = class_obj.start_date.strftime('%d %b %Y') if class_obj.start_date else None
        data['end_date'] = class_obj.end_date.strftime('%d %b %Y') if class_obj.end_date else None

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
        enrollments = list(enrollments)

        if not enrollments:
            return Response(
                {'detail': 'No eligible students — all already have active reports or no active enrollments.'},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            created_reports = self._create_reports(request, cls, enrollments)
        except IntegrityError:
            # A concurrent request initiated reports for some of these students
            # after the eligibility check above. unique_active_report_per_enrollment
            # blocked the duplicate and this whole batch rolled back. Any other
            # integrity failure is re-raised rather than reported as a conflict.
            if not CourseReport.all_objects.filter(
                enrollment__in=enrollments, is_active=True,
            ).exists():
                raise
            return Response(
                {'detail': 'Reports for this class were initiated by another request. Refresh and try again.'},
                status=status.HTTP_409_CONFLICT,
            )

        result = CourseReportListSerializer(created_reports, many=True).data
        return Response(
            {
                'detail': f'Created {len(created_reports)} course reports.',
                'reports': result,
            },
            status=status.HTTP_201_CREATED,
        )

    def _create_reports(self, request, cls, enrollments):
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
        return created_reports

    def _check_can_manage_photo(self, request, report):

        role = self._get_role()
        if role != 'instructor' or report.class_obj.instructor_id != request.user.id:
            return Response(
                {'detail': 'Only the class instructor may manage this report photo.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if report.status == 'approved':
            return Response(
                {'detail': 'Cannot change the photo after the report has been approved.'},
                status=status.HTTP_409_CONFLICT,
            )
        return None

    @action(
        detail=True, methods=['post'], url_path='photo',
        permission_classes=[IsAuthenticated, IsCourseReportParticipant],
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_photo(self, request, pk=None):
        report = self.get_object()
        self._check_school(report)

        denied = self._check_can_manage_photo(request, report)
        if denied:
            return denied

        photo = request.FILES.get('photo')
        if not photo:
            return Response({'detail': 'No photo file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        ext = os.path.splitext(photo.name)[1].lower()
        if ext not in _ALLOWED_PHOTO_EXTENSIONS or photo.content_type not in _ALLOWED_PHOTO_MIME_TYPES:
            return Response(
                {'detail': 'Invalid file type. Only JPG, PNG, and WEBP images are allowed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if photo.size > _MAX_PHOTO_SIZE:
            return Response(
                {'detail': 'File too large. Maximum photo size is 2 MB.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from PIL import Image, UnidentifiedImageError
        try:
            with Image.open(photo) as img:
                img.verify()
        except (UnidentifiedImageError, OSError, ValueError):
            return Response(
                {'detail': 'Invalid or corrupt image file.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        photo.seek(0)

        if report.photo:
            report.photo.delete(save=False)
        report.photo = photo
        report.save(update_fields=['photo'])

        self._log_audit(report=report, action='photo_uploaded', user=request.user, metadata={})

        return Response(CourseReportDetailSerializer(report, context={'request': request}).data)

    @action(
        detail=True, methods=['post'], url_path='remove-photo',
        permission_classes=[IsAuthenticated, IsCourseReportParticipant],
    )
    def remove_photo(self, request, pk=None):
        report = self.get_object()
        self._check_school(report)

        denied = self._check_can_manage_photo(request, report)
        if denied:
            return denied

        if not report.photo:
            return Response({'detail': 'This report has no photo to remove.'}, status=status.HTTP_400_BAD_REQUEST)

        report.photo.delete(save=False)
        report.photo = None
        report.save(update_fields=['photo'])

        self._log_audit(report=report, action='photo_removed', user=request.user, metadata={})

        return Response(CourseReportDetailSerializer(report, context={'request': request}).data)

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
                    'deployment_recommendation', 'pad_scores',
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

        is_correction = False
        if not created:
            if remark.is_submitted:
                locked = (
                    stage not in CourseReport.CORRECTABLE_ROLES
                    or report.status == 'approved'
                )
                if locked:
                    return Response(
                        {'detail': 'This remark has already been submitted and cannot be edited.'},
                        status=status.HTTP_409_CONFLICT,
                    )
                is_correction = True
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
            metadata={'stage': stage, 'created': created, 'is_correction': is_correction},
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

        update_fields = ['status', 'updated_at']
        if next_status == 'approved':
            academics = report_summary(report)
            if academics['is_provisional']:
                return Response(
                    {'detail': self._provisional_message(academics)},
                    status=status.HTTP_409_CONFLICT,
                )
            report.academic_snapshot = build_snapshot(academics)
            update_fields.append('academic_snapshot')

        old_status = report.status
        with transaction.atomic():
          
            remark.is_submitted = True
            CourseReportStageRemark.objects.filter(pk=remark.pk).update(is_submitted=True)

            report.status = next_status
            report.save(update_fields=update_fields)

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
        provisional_count = 0
        errors = []

        approving = CourseReport.VALID_TRANSITIONS.get(CourseReport.SUBMIT_ROLE_STATUS.get(role)) == 'approved'
        academics = {}
        if approving:
            live = live_summaries({(r.class_obj_id, r.enrollment.student_id) for r in reports})
            academics = {r.id: live[(r.class_obj_id, r.enrollment.student_id)] for r in reports}

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

                update_fields = ['status', 'updated_at']
                if next_status == 'approved':
                    if academics[report.id]['is_provisional']:
                        provisional_count += 1
                        continue
                    report.academic_snapshot = build_snapshot(academics[report.id])
                    update_fields.append('academic_snapshot')

                old_status = report.status

                CourseReportStageRemark.objects.filter(pk=remark.pk).update(is_submitted=True)

                report.status = next_status
                report.save(update_fields=update_fields)

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

        detail = f'Submitted {submitted_count} reports. Skipped {skipped_count} (no remark or already submitted).'
        if provisional_count:
            detail += f' Not approved: {provisional_count} with incomplete results.'
        return Response({
            'detail': detail,
            'submitted': submitted_count,
            'skipped': skipped_count,
            'provisional': provisional_count,
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
        if role not in ('commandant', 'chief_instructor'):
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
            try:
                from .course_report_pdf import generate_course_report_pdf
                generate_course_report_pdf(report)
                report.refresh_from_db(fields=['report_file'])
            except Exception:
                logger.exception("On-demand PDF generation failed for report %s", report.pk)
                return Response(
                    {'detail': 'PDF generation failed. Please contact an administrator.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
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
    def _provisional_message(academics):
        return (
            'Cannot approve: results are complete for only '
            f"{academics['complete_subject_count']} of {academics['subject_count']} subjects."
        )

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