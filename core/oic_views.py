from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import (
    Q, Count, Avg, Sum, Case, When, Value, F, FloatField, CharField,
    Max, Min,
)
from django.db import transaction
from django.utils import timezone

from .models import (
    User, School, Department, Course, Class, Subject,
    Enrollment, StudentIndex,
    Exam, ExamResult, ExamReport, ExamReportRemark,
    Attendance, AttendanceSession, SessionAttendance,
    Certificate, Notice, SchoolMembership,
    PersonalNotification, OICAssignment, OICRemark,
)
from .serializers import (
    UserListSerializer, CourseSerializer, SubjectSerializer,
    EnrollmentSerializer, ExamSerializer, ExamResultSerializer,
    AttendanceSessionListSerializer, NoticeSerializer,
    ExamReportRemarkSerializer, AddRemarkSerializer,
    DashboardClassSerializer, DashboardExamReportSerializer,
    OICAssignmentSerializer, OICAssignmentListSerializer,
    OICRemarkSerializer, OICRemarkCreateSerializer,
    OICDashboardClassSerializer,
)
from .permissions import (
    IsOIC, IsOICOrAdmin, IsOICOrAdminOrCommandant, ReadOnlyForOIC,
    IsAdminOrCommandant,
)
from .managers import get_current_school
from django.db.models import ExpressionWrapper
from collections import defaultdict


def _get_school(user):
    school = get_current_school()
    if school:
        return school
    return user.school


def _get_oic_class_ids(request=None, user=None):

    if request is not None:
        cached = getattr(request, '_oic_class_ids', None)
        if cached is not None:
            return cached
        resolved_user = request.user
    elif user is not None:
        resolved_user = user
    else:
        return []

    school = _get_school(resolved_user)

    qs = OICAssignment.all_objects.filter(
        oic=resolved_user,
        is_active=True,
    )

    if school:
        qs = qs.filter(school=school)

    result = list(qs.values_list('class_obj_id', flat=True))

    if request is not None:
        request._oic_class_ids = result

    return result


class OICAssignmentViewSet(viewsets.ModelViewSet):

    permission_classes = [IsAuthenticated, IsOICOrAdminOrCommandant]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['oic', 'class_obj', 'is_active']
    search_fields = [
        'oic__first_name', 'oic__last_name', 'oic__svc_number',
        'class_obj__name', 'class_obj__course__name',
    ]

    def get_serializer_class(self):
        if self.action == 'list':
            return OICAssignmentListSerializer
        return OICAssignmentSerializer

    def get_queryset(self):
        user = self.request.user
        school = _get_school(user)
        if not school:
            return OICAssignment.objects.none()

        qs = OICAssignment.all_objects.filter(
            school=school,
        ).select_related(
            'oic', 'class_obj', 'class_obj__course',
            'class_obj__department', 'assigned_by',
        )

        if user.role == 'oic':
            qs = qs.filter(oic=user)

        return qs

    def perform_create(self, serializer):
        if self.request.user.role == 'oic':
            raise PermissionDenied("OIC users cannot create assignments.")

        user = self.request.user
        school = _get_school(user)
        serializer.save(school=school, assigned_by=user)

    def perform_update(self, serializer):
        if self.request.user.role == 'oic':
            raise PermissionDenied("OIC users cannot modify assignments.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        if self.request.user.role == 'oic':
            raise PermissionDenied("OIC users cannot delete assignments.")

        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        return Response(
            {'message': 'OIC assignment deactivated successfully.'},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['get'])
    def my_assignments(self, request):
        if request.user.role != 'oic':
            return Response(
                {'error': 'This endpoint is only for OIC users.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        qs = self.get_queryset().filter(oic=request.user, is_active=True)
        serializer = OICAssignmentListSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def bulk_assign(self, request):
        if request.user.role not in ('admin', 'superadmin', 'commandant'):
            return Response(
                {'error': 'Only admins or commandants can bulk-assign OICs.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        school = _get_school(request.user)

        oic_id = request.data.get('oic')
        class_ids = request.data.get('class_ids', [])

        if not oic_id or not class_ids:
            return Response(
                {'error': 'Both oic and class_ids are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            oic_user = User.all_objects.get(
                id=oic_id,
                role='oic',
                school=school
            )
        except User.DoesNotExist:
            return Response(
                {'error': 'OIC user not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        classes = Class.all_objects.filter(
            id__in=class_ids,
            school=school,
            is_active=True,
        )

        created, skipped = [], []

        with transaction.atomic():
            existing = set(
                OICAssignment.all_objects.filter(
                    oic=oic_user,
                    class_obj_id__in=class_ids,
                    is_active=True
                ).values_list('class_obj_id', flat=True)
            )

            for cls in classes:
                if cls.id in existing:
                    skipped.append(str(cls.id))
                    continue

                OICAssignment.all_objects.create(
                    oic=oic_user,
                    class_obj=cls,
                    is_active=True,
                    school=school,
                    assigned_by=request.user,
                )
                created.append(str(cls.id))

        return Response({
            'message': f'{len(created)} created, {len(skipped)} skipped',
            'created_class_ids': created,
            'skipped_class_ids': skipped,
        }, status=status.HTTP_201_CREATED)


class OICDashboardViewSet(viewsets.ViewSet):

    permission_classes = [IsAuthenticated, IsOIC]

    def list(self, request):
        return self._build_overview(request)

    @action(detail=False, methods=['get'])
    def overview(self, request):
        return self._build_overview(request)

    def _build_overview(self, request):
        try:
            user = request.user
            school = _get_school(user)

            if not school:
                return Response(
                    {'error': 'No school context found.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            assigned_class_ids = _get_oic_class_ids(request=request)

            my_remarks_count = OICRemark.all_objects.filter(
                oic=user, school=school,
            ).count()

            if not assigned_class_ids:
                return Response({
                    'school': {
                        'id': str(school.id),
                        'name': school.name,
                        'code': school.code,
                    },
                    'user_role': 'oic',
                    'counts': {
                        'assigned_classes': 0,
                        'active_classes': 0,
                        'total_enrollments': 0,
                        'total_subjects': 0,
                        'my_remarks': my_remarks_count,
                        'pending_remarks': 0,
                    },
                    'attendance_summary': {
                        'period': 'last_30_days',
                        'total_sessions': 0,
                        'completed_sessions': 0,
                        'overall_attendance_rate': 0,
                    },
                    'exam_performance': {
                        'total_results': 0,
                        'average_performance': 0,
                        'pass_rate': 0,
                    },
                    'pending_actions': {
                        'reports_awaiting_your_remarks': 0,
                    },
                    'message': 'You have no classes assigned yet.',
                })

            classes_qs = Class.all_objects.filter(id__in=assigned_class_ids)
            assigned_classes_count = classes_qs.count()

            active_classes_count = classes_qs.filter(
                is_active=True, is_closed=False,
            ).count()

            total_enrollments = Enrollment.all_objects.filter(
                class_obj_id__in=assigned_class_ids,
                is_active=True,
            ).count()

            total_subjects = Subject.all_objects.filter(
                class_obj_id__in=assigned_class_ids,
                is_active=True,
            ).count()

            results_qs = ExamResult.all_objects.filter(
                exam__subject__class_obj_id__in=assigned_class_ids,
                is_submitted=True,
                marks_obtained__isnull=False,
                exam__total_marks__gt=0,
            )

            result_agg = results_qs.aggregate(
                result_count=Count('id'),
                total_marks=Sum('marks_obtained'),
                total_possible=Sum('exam__total_marks'),
                pass_count=Count(
                    'id',
                    filter=Q(marks_obtained__gte=F('exam__total_marks') * 0.5)
                )
            )

            result_count = result_agg.get('result_count') or 0
            total_marks = float(result_agg.get('total_marks') or 0)
            total_possible = float(result_agg.get('total_possible') or 0)
            pass_count = result_agg.get('pass_count') or 0

            avg_performance = (
                round((total_marks / total_possible) * 100, 2)
                if total_possible > 0 else 0
            )
            pass_rate = (
                round((pass_count / result_count) * 100, 2)
                if result_count > 0 else 0
            )

        
            thirty_days_ago = timezone.now() - timezone.timedelta(days=30)

            recent_sessions_qs = AttendanceSession.all_objects.filter(
                school=school,
                class_obj_id__in=assigned_class_ids,
                scheduled_start__gte=thirty_days_ago,
            )

            total_sessions = recent_sessions_qs.count()
            completed_sessions = recent_sessions_qs.filter(
                status='completed',
            ).count()

            att_agg = SessionAttendance.all_objects.filter(
                session__school=school,
                session__class_obj_id__in=assigned_class_ids,
                session__scheduled_start__gte=thirty_days_ago,
            ).aggregate(
                total_records=Count('id'),
                present_count=Count(
                    'id',
                    filter=Q(status__in=['present', 'late'])
                ),
            )

            total_att_records = att_agg.get('total_records') or 0
            present_count = att_agg.get('present_count') or 0

            overall_attendance_rate = (
                round((present_count / total_att_records) * 100, 2)
                if total_att_records > 0 else 0
            )

            pending_remarks_count = ExamReport.all_objects.filter(
                school=school,
                class_obj_id__in=assigned_class_ids,
            ).exclude(
                remarks__author_role='oic',
                remarks__author=user,
            ).count()

            return Response({
                'school': {
                    'id': str(school.id),
                    'name': school.name,
                    'code': school.code,
                },
                'user_role': 'oic',
                'counts': {
                    'assigned_classes': assigned_classes_count,
                    'active_classes': active_classes_count,
                    'total_enrollments': total_enrollments,
                    'total_subjects': total_subjects,
                    'my_remarks': my_remarks_count,
                    'pending_remarks': pending_remarks_count,
                },
                'attendance_summary': {
                    'period': 'last_30_days',
                    'total_sessions': total_sessions,
                    'completed_sessions': completed_sessions,
                    'overall_attendance_rate': overall_attendance_rate,
                },
                'exam_performance': {
                    'total_results': result_count,
                    'average_performance': avg_performance,
                    'pass_rate': pass_rate,
                },
                'pending_actions': {
                    'reports_awaiting_your_remarks': pending_remarks_count,
                },
            })

        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.exception('OIC Dashboard overview failed')
            return Response(
                {'error': 'Failed to load dashboard', 'details': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class OICClassViewSet(viewsets.ReadOnlyModelViewSet):

    serializer_class = OICDashboardClassSerializer
    permission_classes = [IsAuthenticated, IsOIC]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['course', 'department', 'is_active', 'is_closed']
    search_fields = ['name', 'class_code', 'course__name']
    ordering_fields = ['start_date', 'end_date', 'name']
    ordering = ['-start_date']

    def get_queryset(self):
        user = self.request.user
        school = _get_school(user)
        if not school:
            return Class.objects.none()

        assigned_class_ids = _get_oic_class_ids(self.request)
        return Class.all_objects.filter(
            id__in=assigned_class_ids,
        ).select_related('course', 'instructor', 'department')

    @action(detail=True, methods=['get'])
    def students(self, request, pk=None):
        class_obj = self.get_object()

        if class_obj.id not in _get_oic_class_ids(request):
            raise PermissionDenied("Not allowed")

        enrollments = Enrollment.all_objects.filter(
            class_obj=class_obj, is_active=True,
        ).select_related('student')

        students = [{
            'id': str(e.student.id),
            'name': e.student.get_full_name(),
            'svc_number': e.student.svc_number,
            'rank': e.student.get_rank_display() if e.student.rank else None,
            'enrollment_date': e.enrollment_date,
        } for e in enrollments]

        return Response({
            'class_id': str(class_obj.id),
            'class_name': class_obj.name,
            'total_students': len(students),
            'students': students,
        })

    @action(detail=True, methods=['get'])
    def subjects(self, request, pk=None):
        class_obj = self.get_object()
        subjects = Subject.all_objects.filter(
            class_obj=class_obj, is_active=True,
        ).select_related('instructor')

        data = []
        for subject in subjects:
            instructor = subject.instructor
            data.append({
                'id': str(subject.id),
                'name': subject.name,
                'subject_code': subject.subject_code,
                'instructor_name': instructor.get_full_name() if instructor else None,
                'instructor_rank': instructor.get_rank_display() if instructor and instructor.rank else None,
                'instructor_svc_number': instructor.svc_number if instructor else None,
            })

        return Response({
            'class_id': str(class_obj.id),
            'class_name': class_obj.name,
            'subjects': data,
        })

    @action(detail=True, methods=['get'])
    def results_summary(self, request, pk=None):
        class_obj = self.get_object()

        if class_obj.id not in _get_oic_class_ids(request):
            raise PermissionDenied("Not allowed")

        subjects = Subject.all_objects.filter(
            class_obj=class_obj,
            is_active=True,
        ).select_related('instructor')

        base_results_qs = ExamResult.all_objects.filter(
            exam__subject__class_obj=class_obj,
            exam__subject__is_active=True,
            is_submitted=True,
            marks_obtained__isnull=False,
            exam__total_marks__gt=0,
        ).annotate(
            percentage=ExpressionWrapper(
                (F('marks_obtained') * 100.0) / F('exam__total_marks'),
                output_field=FloatField()
            )
        )

        subject_agg = (
            base_results_qs
            .values('exam__subject_id')
            .annotate(
                total_marks=Sum('marks_obtained'),
                total_possible=Sum('exam__total_marks'),
                result_count=Count('id'),
                pass_count=Count(
                    'id',
                    filter=Q(marks_obtained__gte=F('exam__total_marks') * 0.5)
                )
            )
        )
        agg_map = {row['exam__subject_id']: row for row in subject_agg}

        exam_counts = (
            Exam.objects.filter(
                subject__class_obj=class_obj,
                subject__is_active=True,
                is_active=True,
            )
            .values('subject_id')
            .annotate(exam_count=Count('id'))
        )
        exam_count_map = {row['subject_id']: row['exam_count'] for row in exam_counts}

        minmax_agg = (
            base_results_qs
            .values('exam__subject_id')
            .annotate(
                max_pct=Max('percentage'),
                min_pct=Min('percentage')
            )
        )
        minmax_map = {row['exam__subject_id']: row for row in minmax_agg}

        subject_performance = []

        for subject in subjects:
            agg = agg_map.get(subject.id)
            mm = minmax_map.get(subject.id)

            if not agg or agg['result_count'] == 0:
                subject_performance.append({
                    'subject_id': str(subject.id),
                    'subject_name': subject.name,
                    'instructor': subject.instructor.get_full_name() if subject.instructor else None,
                    'total_exams': exam_count_map.get(subject.id, 0),
                    'total_results': 0,
                    'average_percentage': 0,
                    'pass_rate': 0,
                    'highest_score': 0,
                    'lowest_score': 0,
                })
                continue

            total_m = float(agg['total_marks'] or 0)
            total_p = float(agg['total_possible'] or 0)

            avg_pct = round((total_m / total_p) * 100, 2) if total_p > 0 else 0
            pass_rate = round((agg['pass_count'] / agg['result_count']) * 100, 2)

            subject_performance.append({
                'subject_id': str(subject.id),
                'subject_name': subject.name,
                'instructor': subject.instructor.get_full_name() if subject.instructor else None,
                'total_exams': exam_count_map.get(subject.id, 0),
                'total_results': agg['result_count'],
                'average_percentage': avg_pct,
                'pass_rate': pass_rate,
                'highest_score': round(mm['max_pct'], 2) if mm and mm['max_pct'] else 0,
                'lowest_score': round(mm['min_pct'], 2) if mm and mm['min_pct'] else 0,
            })

        overall_agg = base_results_qs.aggregate(
            total_marks=Sum('marks_obtained'),
            total_possible=Sum('exam__total_marks'),
            result_count=Count('id'),
            pass_count=Count(
                'id',
                filter=Q(marks_obtained__gte=F('exam__total_marks') * 0.5)
            )
        )

        overall_count = overall_agg.get('result_count') or 0

        if overall_count > 0:
            total_m = float(overall_agg.get('total_marks') or 0)
            total_p = float(overall_agg.get('total_possible') or 0)

            overall_avg = round((total_m / total_p) * 100, 2) if total_p > 0 else 0
            overall_pass_rate = round(
                (overall_agg.get('pass_count') or 0) / overall_count * 100, 2
            )
        else:
            overall_avg = 0
            overall_pass_rate = 0

        return Response({
            'class': {
                'id': str(class_obj.id),
                'name': class_obj.name,
                'course': class_obj.course.name,
            },
            'overall_statistics': {
                'average_percentage': overall_avg,
                'pass_rate': overall_pass_rate,
                'total_results': overall_count,
            },
            'subject_performance': subject_performance,
        })

    @action(detail=True, methods=['get'])
    def attendance_summary(self, request, pk=None):
        class_obj = self.get_object()

        sessions = AttendanceSession.all_objects.filter(class_obj=class_obj)
        total_sessions = sessions.count()
        completed = sessions.filter(status='completed').count()

        enrollments = Enrollment.all_objects.filter(
            class_obj=class_obj, is_active=True,
        ).select_related('student')

        student_ids = list(enrollments.values_list('student_id', flat=True))
        att_stats = (
            SessionAttendance.all_objects.filter(
                session__class_obj=class_obj,
                student_id__in=student_ids,
            )
            .values('student_id')
            .annotate(
                total=Count('id'),
                present=Count('id', filter=Q(status='present')),
                late=Count('id', filter=Q(status='late')),
                absent=Count('id', filter=Q(status='absent')),
            )
        )
        att_map = {row['student_id']: row for row in att_stats}

        student_attendance = []
        for enrollment in enrollments:
            sid = enrollment.student_id
            att = att_map.get(sid, {'total': 0, 'present': 0, 'late': 0, 'absent': 0})
            present = att['present']
            late = att['late']
            absent = att['absent']
            rate = round((present + late) / total_sessions * 100, 2) if total_sessions > 0 else 0

            student_attendance.append({
                'student_id': str(enrollment.student.id),
                'student_name': enrollment.student.get_full_name(),
                'svc_number': enrollment.student.svc_number,
                'rank': enrollment.student.rank,
                'sessions_attended': present + late,
                'present': present,
                'late': late,
                'absent': absent,
                'attendance_rate': rate,
            })

        student_attendance.sort(key=lambda x: x['attendance_rate'], reverse=True)

        overall_rate = 0
        if student_attendance:
            overall_rate = round(
                sum(s['attendance_rate'] for s in student_attendance) / len(student_attendance), 2
            )

        return Response({
            'class': {
                'id': str(class_obj.id),
                'name': class_obj.name,
            },
            'summary': {
                'total_sessions': total_sessions,
                'completed_sessions': completed,
                'overall_attendance_rate': overall_rate,
                'total_students': len(student_attendance),
            },
            'student_attendance': student_attendance,
        })


class OICComparisonViewSet(viewsets.ViewSet):

    permission_classes = [IsAuthenticated, IsOIC]

    @action(detail=False, methods=['get'])
    def performance(self, request):
        assigned_class_ids = _get_oic_class_ids(request=request)

        if not assigned_class_ids:
            return Response({'message': 'No classes assigned.', 'classes': []})

        classes = Class.all_objects.filter(
            id__in=assigned_class_ids,
        ).select_related('course', 'instructor')

        results_by_class = (
            ExamResult.all_objects.filter(
                exam__subject__class_obj_id__in=assigned_class_ids,
                is_submitted=True,
                marks_obtained__isnull=False,
                exam__total_marks__gt=0,
            )
            .annotate(
                percentage=ExpressionWrapper(
                    (F('marks_obtained') * 100.0) / F('exam__total_marks'),
                    output_field=FloatField()
                )
            )
            .values('exam__subject__class_obj_id')
            .annotate(
                total_marks=Sum('marks_obtained'),
                total_possible=Sum('exam__total_marks'),
                result_count=Count('id'),
                pass_count=Count(
                    'id',
                    filter=Q(marks_obtained__gte=F('exam__total_marks') * 0.5)
                )
            )
        )
        result_map = {row['exam__subject__class_obj_id']: row for row in results_by_class}

        enrollment_by_class = (
            Enrollment.all_objects.filter(
                class_obj_id__in=assigned_class_ids,
                is_active=True,
            )
            .values('class_obj_id')
            .annotate(enrolled=Count('id'))
        )
        enrollment_map = {row['class_obj_id']: row['enrolled'] for row in enrollment_by_class}

        comparison = []
        for cls in classes:
            rdata = result_map.get(cls.id)
            enrolled = enrollment_map.get(cls.id, 0)

            if rdata and rdata['result_count'] > 0:
                total_m = float(rdata['total_marks'] or 0)
                total_p = float(rdata['total_possible'] or 0)
                avg_pct = round(total_m / total_p * 100, 2) if total_p > 0 else 0
                pass_rate = round(rdata['pass_count'] / rdata['result_count'] * 100, 2)
                total_results = rdata['result_count']
            else:
                avg_pct = 0
                pass_rate = 0
                total_results = 0

            comparison.append({
                'class_id': str(cls.id),
                'class_name': cls.name,
                'course_name': cls.course.name,
                'instructor_name': cls.instructor.get_full_name() if cls.instructor else None,
                'instructor_rank': cls.instructor.get_rank_display() if cls.instructor and cls.instructor.rank else None,
                'instructor_svc_number': cls.instructor.svc_number if cls.instructor else None,
                'enrolled_students': enrolled,
                'total_results': total_results,
                'average_percentage': avg_pct,
                'pass_rate': pass_rate,
            })

        comparison.sort(key=lambda x: x['average_percentage'], reverse=True)
        return Response({'total_classes': len(comparison), 'classes': comparison})

    @action(detail=False, methods=['get'])
    def attendance(self, request):
        assigned_class_ids = _get_oic_class_ids(request=request)

        if not assigned_class_ids:
            return Response({'message': 'No classes assigned.', 'classes': []})

        classes = Class.all_objects.filter(
            id__in=assigned_class_ids,
        ).select_related('course')

        sessions_by_class = (
            AttendanceSession.all_objects.filter(class_obj_id__in=assigned_class_ids)
            .values('class_obj_id')
            .annotate(session_count=Count('id'))
        )
        session_map = {row['class_obj_id']: row['session_count'] for row in sessions_by_class}

        enrollment_by_class = (
            Enrollment.all_objects.filter(class_obj_id__in=assigned_class_ids, is_active=True)
            .values('class_obj_id')
            .annotate(enrolled=Count('id'))
        )
        enrollment_map = {row['class_obj_id']: row['enrolled'] for row in enrollment_by_class}

        att_by_class = (
            SessionAttendance.all_objects.filter(session__class_obj_id__in=assigned_class_ids)
            .values('session__class_obj_id')
            .annotate(
                total_records=Count('id'),
                present_count=Count('id', filter=Q(status__in=['present', 'late'])),
            )
        )
        att_map = {row['session__class_obj_id']: row for row in att_by_class}

        comparison = []
        for cls in classes:
            total_sessions = session_map.get(cls.id, 0)
            enrolled = enrollment_map.get(cls.id, 0)
            att = att_map.get(cls.id, {'total_records': 0, 'present_count': 0})
            total_records = att['total_records']
            present = att['present_count']
            rate = round(present / total_records * 100, 2) if total_records > 0 else 0

            comparison.append({
                'class_id': str(cls.id),
                'class_name': cls.name,
                'course_name': cls.course.name,
                'enrolled_students': enrolled,
                'total_sessions': total_sessions,
                'attendance_rate': rate,
            })

        comparison.sort(key=lambda x: x['attendance_rate'], reverse=True)
        return Response({'total_classes': len(comparison), 'classes': comparison})


class OICExamReportViewSet(viewsets.ReadOnlyModelViewSet):

    serializer_class = DashboardExamReportSerializer
    permission_classes = [IsAuthenticated, IsOIC]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = ['title', 'subject__name', 'class_obj__name']

    def get_queryset(self):
        user = self.request.user
        school = _get_school(user)
        assigned_class_ids = _get_oic_class_ids(self.request)

        if not school or not assigned_class_ids:
            return ExamReport.objects.none()

        return ExamReport.all_objects.filter(
            school=school,
            class_obj_id__in=assigned_class_ids,
        ).select_related(
            'subject', 'class_obj', 'class_obj__course', 'created_by',
        ).prefetch_related('remarks', 'exams')

    @action(detail=True, methods=['get'])
    def detailed(self, request, pk=None):
        report = self.get_object()
        school = _get_school(request.user)

        enrollments = Enrollment.all_objects.filter(
            class_obj=report.class_obj, is_active=True,
        ).select_related('student')

        exam_ids = list(report.exams.values_list('id', flat=True))

        all_results = ExamResult.all_objects.filter(
            exam_id__in=exam_ids,
            is_submitted=True,
            school=school,
        ).select_related('exam', 'student')

        results_map = defaultdict(list)

        for r in all_results:
            results_map[r.student_id].append(r)

        student_data = []

        for enrollment in enrollments:
            results = results_map.get(enrollment.student_id, [])

            total_marks = sum(float(r.marks_obtained or 0) for r in results)
            total_possible = sum(r.exam.total_marks for r in results)

            percentage = round(total_marks / total_possible * 100, 2) if total_possible else 0

            student_data.append({
                'student_id': str(enrollment.student.id),
                'name': enrollment.student.get_full_name(),
                'svc_number': enrollment.student.svc_number,
                'rank': enrollment.student.get_rank_display() if enrollment.student.rank else None,
                'total_marks': float(total_marks),
                'total_possible': total_possible,
                'percentage': percentage,
                'results': ExamResultSerializer(results, many=True).data,
            })

        student_data.sort(key=lambda x: x['percentage'], reverse=True)

        for i, s in enumerate(student_data, 1):
            s['position'] = i

        report_data = self.get_serializer(report).data

        avg = round(
            sum(s['percentage'] for s in student_data) / len(student_data), 2
        ) if student_data else 0

        return Response({
            'report': report_data,
            'students': student_data,
            'summary': {
                'total_students': len(student_data),
                'average_percentage': avg,
                'highest_percentage': student_data[0]['percentage'] if student_data else 0,
                'lowest_percentage': student_data[-1]['percentage'] if student_data else 0,
                'pass_count': sum(1 for s in student_data if s['percentage'] >= 50),
                'fail_count': sum(1 for s in student_data if s['percentage'] < 50),
            },
        })

    @action(detail=True, methods=['post'])
    def add_remark(self, request, pk=None):
        report = self.get_object()
        user = request.user

        if user.role != 'oic':
            return Response(
                {'error': 'Only an OIC can add remarks via this endpoint.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = AddRemarkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        remark_text = serializer.validated_data['remark']
        school = _get_school(user)

        with transaction.atomic():
            remark_obj, created = ExamReportRemark.all_objects.update_or_create(
                exam_report=report,
                author_role='oic',
                author=user,
                defaults={'remark': remark_text, 'school': school},
            )
            self._notify_instructors(report, remark_obj, user, school)

        out_serializer = ExamReportRemarkSerializer(remark_obj)
        return Response(
            {
                'message': 'Remark added successfully.' if created else 'Remark updated successfully.',
                'remark': out_serializer.data,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @staticmethod
    def _notify_instructors(report, remark_obj, author, school):
        recipients = set()
        if report.subject and report.subject.instructor_id:
            recipients.add(report.subject.instructor_id)
        if report.class_obj and report.class_obj.instructor_id:
            recipients.add(report.class_obj.instructor_id)

        if not recipients:
            return

        author_display = (
            f"{author.get_rank_display() + ' ' if author.rank else ''}"
            f"{author.get_full_name()}"
        )
        title = f"OIC Remark on: {report.title}"
        content = (
            f"Officer in Charge {author_display} has added a remark on the "
            f"exam report \"{report.title}\" for {report.subject.name} "
            f"({report.class_obj.name}).\n\n"
            f"Remark:\n{remark_obj.remark}"
        )

        notifications = [
            PersonalNotification(
                school=school, user_id=uid,
                notification_type='exam_report_remark', priority='medium',
                title=title, content=content,
                created_by=author, is_active=True,
            )
            for uid in recipients
        ]
        PersonalNotification.objects.bulk_create(notifications)

    @action(detail=True, methods=['get'])
    def remarks(self, request, pk=None):
        report = self.get_object()
        remarks = report.remarks.all().select_related('author')
        return Response({
            'report_id': str(report.id),
            'report_title': report.title,
            'remarks': ExamReportRemarkSerializer(remarks, many=True).data,
        })

    @action(detail=False, methods=['get'])
    def pending_remarks(self, request):
        """
        Return exam reports the current OIC has NOT yet remarked on.
        Uses join-based exclude to avoid uuid=bigint type mismatch.
        """
        user = request.user
        qs = self.get_queryset()

        reports_without_my_remark = qs.exclude(
            remarks__author_role='oic',
            remarks__author=user,
        )

        page = self.paginate_queryset(reports_without_my_remark)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(reports_without_my_remark, many=True)
        return Response({
            'count': reports_without_my_remark.count(),
            'results': serializer.data,
        })


class OICExamResultViewSet(viewsets.ReadOnlyModelViewSet):

    serializer_class = ExamResultSerializer
    permission_classes = [IsAuthenticated, IsOIC]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['exam', 'student', 'is_submitted']
    ordering = ['-submitted_at']

    def get_queryset(self):
        user = self.request.user
        school = _get_school(user)
        assigned_class_ids = _get_oic_class_ids(self.request)

        if not school or not assigned_class_ids:
            return ExamResult.objects.none()

        qs = ExamResult.all_objects.filter(
            school=school,
            exam__subject__class_obj_id__in=assigned_class_ids,
        ).select_related('exam', 'student', 'graded_by')

        class_id = self.request.query_params.get('class_id')
        if class_id and class_id in [str(cid) for cid in assigned_class_ids]:
            qs = qs.filter(exam__subject__class_obj_id=class_id)

        subject_id = self.request.query_params.get('subject_id')
        if subject_id:
            qs = qs.filter(exam__subject_id=subject_id)

        return qs


class OICAttendanceViewSet(viewsets.ReadOnlyModelViewSet):

    serializer_class = AttendanceSessionListSerializer
    permission_classes = [IsAuthenticated, IsOIC]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['class_obj', 'status', 'session_type']
    ordering = ['-scheduled_start']

    def get_queryset(self):
        user = self.request.user
        school = _get_school(user)
        assigned_class_ids = _get_oic_class_ids(self.request)

        if not school or not assigned_class_ids:
            return AttendanceSession.objects.none()

        return AttendanceSession.all_objects.filter(
            school=school,
            class_obj_id__in=assigned_class_ids,
        ).select_related('class_obj', 'subject', 'created_by')

    @action(detail=True, methods=['get'])
    def records(self, request, pk=None):
        session = self.get_object()
        records = SessionAttendance.all_objects.filter(
            session=session,
        ).select_related('student', 'marked_by')

        data = []
        for record in records:
            data.append({
                'student_id': str(record.student.id),
                'student_name': record.student.get_full_name(),
                'svc_number': record.student.svc_number,
                'rank': record.student.get_rank_display() if record.student.rank else None,
                'status': record.status,
                'marking_method': record.marking_method,
                'marked_at': record.marked_at,
                'remarks': record.remarks,
            })

        return Response({
            'session_id': str(session.id),
            'session_title': session.title,
            'class_name': session.class_obj.name,
            'records': data,
            'summary': {
                'total': len(data),
                'present': sum(1 for d in data if d['status'] == 'present'),
                'late': sum(1 for d in data if d['status'] == 'late'),
                'absent': sum(1 for d in data if d['status'] == 'absent'),
                'excused': sum(1 for d in data if d['status'] == 'excused'),
            },
        })


class OICRemarkViewSet(viewsets.ModelViewSet):

    serializer_class = OICRemarkSerializer
    permission_classes = [IsAuthenticated, IsOIC]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['class_obj', 'subject', 'remark_type']
    ordering = ['-created_at']

    def get_queryset(self):
        user = self.request.user
        school = _get_school(user)
        if not school:
            return OICRemark.objects.none()

        return OICRemark.all_objects.filter(
            oic=user, school=school,
        ).select_related('class_obj', 'subject', 'oic')

    def perform_create(self, serializer):
        user = self.request.user
        school = _get_school(user)
        assigned_class_ids = _get_oic_class_ids(self.request)

        class_obj = serializer.validated_data.get('class_obj')
        if class_obj and class_obj.id not in assigned_class_ids:
            raise PermissionDenied('You are not assigned as OIC for this class.')

        serializer.save(oic=user, school=school)

    def perform_update(self, serializer):
        if serializer.instance.oic != self.request.user:
            raise PermissionDenied('You can only edit your own remarks.')

        class_obj = serializer.validated_data.get('class_obj')
        if class_obj:
            assigned_class_ids = _get_oic_class_ids(request=self.request)
            if class_obj.id not in assigned_class_ids:
                raise PermissionDenied(
                    'You are not assigned as OIC for this class.'
                )

        serializer.save()

    @action(detail=False, methods=['post'])
    def add_remark(self, request):
        user = request.user
        school = _get_school(user)
        assigned_class_ids = _get_oic_class_ids(request)

        serializer = OICRemarkCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        class_obj_id = serializer.validated_data['class_obj']
        subject_id = serializer.validated_data.get('subject')
        remark_text = serializer.validated_data['remark']

        if class_obj_id not in assigned_class_ids:
            return Response(
                {'error': 'You are not assigned as OIC for this class.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            class_obj = Class.all_objects.get(id=class_obj_id)
        except Class.DoesNotExist:
            return Response({'error': 'Class not found.'}, status=status.HTTP_404_NOT_FOUND)

        subject = None
        if subject_id:
            try:
                subject = Subject.all_objects.get(id=subject_id, class_obj=class_obj)
            except Subject.DoesNotExist:
                return Response(
                    {'error': 'Subject not found in this class.'},
                    status=status.HTTP_404_NOT_FOUND,
                )

        with transaction.atomic():
            remark_obj, created = OICRemark.all_objects.update_or_create(
                oic=user,
                class_obj=class_obj,
                subject=subject,
                defaults={'remark': remark_text, 'school': school},
            )

        out = OICRemarkSerializer(remark_obj)
        return Response(
            {
                'message': 'Remark added successfully.' if created else 'Remark updated successfully.',
                'remark': out.data,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )