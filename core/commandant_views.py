from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import (
    Q, Count, Avg, Sum, Case, When, IntegerField, Value, F,
)
from django.utils import timezone

from .models import (
    User, School, Department, DepartmentMembership,
    Course, Class, Subject, Enrollment, StudentIndex,
    Exam, ExamResult, ExamReport, ExamReportRemark,
    Attendance, AttendanceSession, SessionAttendance,
    Certificate, CertificateTemplate,
    Notice, SchoolMembership,
)
from .serializers import (
    UserListSerializer, CourseSerializer, SubjectSerializer,
    EnrollmentSerializer, NoticeSerializer,
    ExamSerializer, ExamResultSerializer,
    AttendanceSessionListSerializer,
    CertificateSerializer, CertificateListSerializer,
    CertificateTemplateSerializer, SchoolMembershipSerializer,
    DepartmentSerializer, DepartmentMembershipSerializer,
)

from .serializers import (
    ExamReportRemarkSerializer,
    DashboardClassSerializer,
    DashboardDepartmentSerializer,
    DashboardCertificateSerializer,
    DashboardExamReportSerializer,
)

from .permissions import IsCommandantOrChiefInstructor
from .managers import get_current_school

def _get_school(user):
    school = get_current_school()
    if school:
        return school
    return user.school

class CommandantDashboardViewSet(viewsets.ViewSet):


    permission_classes = [IsAuthenticated, IsCommandantOrChiefInstructor]

    def list(self, request):
        return self._build_overview(request)

    @action(detail=False, methods=['get'])
    def overview(self, request):
        return self._build_overview(request)

    def _build_overview(self, request):
        user = request.user
        school = _get_school(user)

        if not school:
            return Response(
                {'error': 'No school context found.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        memberships = SchoolMembership.all_objects.filter(
            school=school, status='active'
        )
        total_students = memberships.filter(role='student').count()
        total_instructors = memberships.filter(role='instructor').count()
        total_admins = memberships.filter(role='admin').count()

        departments = Department.all_objects.filter(
            school=school, is_active=True
        )
        courses = Course.all_objects.filter(school=school, is_active=True)
        classes = Class.all_objects.filter(school=school, is_active=True)
        active_classes = classes.filter(is_closed=False)

        total_enrollments = Enrollment.all_objects.filter(
            school=school, is_active=True
        ).count()

        exams = Exam.all_objects.filter(school=school, is_active=True)
        exam_reports = ExamReport.all_objects.filter(school=school)

        certificates_issued = Certificate.all_objects.filter(
            school=school, status='issued'
        ).count()

        thirty_days_ago = timezone.now() - timezone.timedelta(days=30)
        recent_sessions = AttendanceSession.all_objects.filter(
            school=school,
            scheduled_start__gte=thirty_days_ago,
        )
        total_sessions = recent_sessions.count()
        completed_sessions = recent_sessions.filter(status='completed').count()

        session_attendance_qs = SessionAttendance.all_objects.filter(
            session__school=school,
            session__scheduled_start__gte=thirty_days_ago,
        )
        present_count = session_attendance_qs.filter(
            status__in=['present', 'late']
        ).count()
        total_attendance_records = session_attendance_qs.count()
        overall_attendance_rate = (
            round(present_count / total_attendance_records * 100, 2)
            if total_attendance_records > 0 else 0
        )

        submitted_results = ExamResult.all_objects.filter(
            school=school, is_submitted=True, marks_obtained__isnull=False,
        )
        result_count = submitted_results.count()
        if result_count > 0:
            total_marks = sum(r.marks_obtained for r in submitted_results.select_related('exam'))
            total_possible = sum(r.exam.total_marks for r in submitted_results.select_related('exam'))
            avg_performance = round(total_marks / total_possible * 100, 2) if total_possible > 0 else 0
            pass_count = sum(1 for r in submitted_results if r.percentage >= 50)
            pass_rate = round(pass_count / result_count * 100, 2)
        else:
            avg_performance = 0
            pass_rate = 0

        reports_without_remark = exam_reports.exclude(
            remarks__author_role=user.role,
        ).count()

        return Response({
            'school': {
                'id': str(school.id),
                'name': school.name,
                'code': school.code,
            },
            'user_role': user.role,
            'counts': {
                'total_students': total_students,
                'total_instructors': total_instructors,
                'total_admins': total_admins,
                'departments': departments.count(),
                'courses': courses.count(),
                'classes': classes.count(),
                'active_classes': active_classes.count(),
                'total_enrollments': total_enrollments,
                'total_exams': exams.count(),
                'exam_reports': exam_reports.count(),
                'certificates_issued': certificates_issued,
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
                'reports_awaiting_your_remarks': reports_without_remark,
            },
        })

class CommandantDepartmentViewSet(viewsets.ReadOnlyModelViewSet):

    serializer_class = DashboardDepartmentSerializer
    permission_classes = [IsAuthenticated, IsCommandantOrChiefInstructor]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = ['name', 'code']

    def get_queryset(self):
        user = self.request.user
        school = _get_school(user)
        if not school:
            return Department.objects.none()
        return Department.all_objects.filter(school=school)

    @action(detail=True, methods=['get'])
    def details(self, request, pk=None):

        department = self.get_object()

        courses = Course.all_objects.filter(
            department=department, is_active=True
        )
        classes = Class.all_objects.filter(
            department=department, is_active=True
        )
        members = DepartmentMembership.all_objects.filter(
            department=department, is_active=True
        ).select_related('user')

        return Response({
            'department': DashboardDepartmentSerializer(department).data,
            'courses': CourseSerializer(courses, many=True).data,
            'classes': DashboardClassSerializer(classes, many=True).data,
            'members': DepartmentMembershipSerializer(members, many=True).data,
        })

class CommandantClassViewSet(viewsets.ReadOnlyModelViewSet):

    serializer_class = DashboardClassSerializer
    permission_classes = [IsAuthenticated, IsCommandantOrChiefInstructor]
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
        return Class.all_objects.filter(
            school=school
        ).select_related('course', 'instructor', 'department')

    @action(detail=True, methods=['get'])
    def students(self, request, pk=None):
        class_obj = self.get_object()
        enrollments = Enrollment.all_objects.filter(
            class_obj=class_obj, is_active=True
        ).select_related('student')

        data = []
        for enrollment in enrollments:
            student = enrollment.student
            index = StudentIndex.all_objects.filter(
                enrollment=enrollment
            ).first()
            data.append({
                'enrollment_id': str(enrollment.id),
                'student_id': student.id,
                'student_name': student.get_full_name(),
                'svc_number': student.svc_number,
                'rank': student.get_rank_display() if student.rank else None,
                'index_number': index.index_number if index else None,
                'enrollment_date': enrollment.enrollment_date,
            })

        return Response({
            'class': DashboardClassSerializer(class_obj).data,
            'students': data,
            'total_students': len(data),
        })

    @action(detail=True, methods=['get'])
    def subjects(self, request, pk=None):
        class_obj = self.get_object()
        subjects = Subject.all_objects.filter(
            class_obj=class_obj, is_active=True
        ).select_related('instructor')
        return Response({
            'class': DashboardClassSerializer(class_obj).data,
            'subjects': SubjectSerializer(subjects, many=True).data,
        })

class CommandantCourseViewSet(viewsets.ReadOnlyModelViewSet):

    serializer_class = CourseSerializer
    permission_classes = [IsAuthenticated, IsCommandantOrChiefInstructor]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['department', 'is_active']
    search_fields = ['name', 'code']

    def get_queryset(self):
        user = self.request.user
        school = _get_school(user)
        if not school:
            return Course.objects.none()
        return Course.all_objects.filter(school=school)

class CommandantUserViewSet(viewsets.ReadOnlyModelViewSet):

    serializer_class = UserListSerializer
    permission_classes = [IsAuthenticated, IsCommandantOrChiefInstructor]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['role', 'is_active', 'rank']
    search_fields = ['first_name', 'last_name', 'svc_number', 'email']
    ordering_fields = ['last_name', 'created_at', 'rank']
    ordering = ['last_name']

    def get_queryset(self):
        user = self.request.user
        school = _get_school(user)
        if not school:
            return User.objects.none()

        membership_user_ids = SchoolMembership.all_objects.filter(
            school=school, status='active'
        ).values_list('user_id', flat=True)

        return User.all_objects.filter(id__in=membership_user_ids, is_active=True)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Role-based count summary."""
        qs = self.get_queryset()
        role_counts = qs.values('role').annotate(count=Count('id')).order_by('role')
        return Response({
            'total': qs.count(),
            'by_role': {item['role']: item['count'] for item in role_counts},
        })

class CommandantAttendanceViewSet(viewsets.ReadOnlyModelViewSet):

    serializer_class = AttendanceSessionListSerializer
    permission_classes = [IsAuthenticated, IsCommandantOrChiefInstructor]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['class_obj', 'session_type', 'status']
    search_fields = ['title', 'class_obj__name']
    ordering_fields = ['scheduled_start']
    ordering = ['-scheduled_start']

    def get_queryset(self):
        user = self.request.user
        school = _get_school(user)
        if not school:
            return AttendanceSession.objects.none()
        return AttendanceSession.all_objects.filter(
            school=school
        ).select_related('class_obj', 'subject', 'created_by')

    @action(detail=True, methods=['get'])
    def session_details(self, request, pk=None):
        session = self.get_object()
        attendances = SessionAttendance.all_objects.filter(
            session=session
        ).select_related('student', 'marked_by')

        student_data = []
        for att in attendances:
            student_data.append({
                'student_id': att.student_id,
                'student_name': att.student.get_full_name(),
                'svc_number': att.student.svc_number,
                'rank': att.student.get_rank_display() if att.student.rank else None,
                'status': att.status,
                'marking_method': att.marking_method,
                'marked_at': att.marked_at,
                'remarks': att.remarks,
            })

        total_enrolled = Enrollment.all_objects.filter(
            class_obj=session.class_obj, is_active=True
        ).count()

        status_counts = {}
        for att in attendances:
            status_counts[att.status] = status_counts.get(att.status, 0) + 1

        return Response({
            'session': AttendanceSessionListSerializer(session).data,
            'total_enrolled': total_enrolled,
            'total_marked': len(student_data),
            'status_counts': status_counts,
            'attendance_rate': round(
                len(student_data) / total_enrolled * 100, 2
            ) if total_enrolled > 0 else 0,
            'students': student_data,
        })

    @action(detail=False, methods=['get'])
    def class_summary(self, request):
        user = request.user
        school = _get_school(user)
        if not school:
            return Response({'error': 'No school context.'}, status=400)

        class_id = request.query_params.get('class_id')
        if not class_id:
            return Response(
                {'error': 'class_id query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            class_obj = Class.all_objects.get(id=class_id, school=school)
        except Class.DoesNotExist:
            return Response({'error': 'Class not found.'}, status=404)

        sessions = AttendanceSession.all_objects.filter(
            class_obj=class_obj
        ).order_by('-scheduled_start')

        total_enrolled = Enrollment.all_objects.filter(
            class_obj=class_obj, is_active=True
        ).count()

        session_data = []
        for session in sessions:
            marked = session.session_attendances.count()
            present = session.session_attendances.filter(
                status__in=['present', 'late']
            ).count()
            session_data.append({
                'session_id': str(session.id),
                'title': session.title,
                'session_type': session.session_type,
                'scheduled_start': session.scheduled_start,
                'status': session.status,
                'total_marked': marked,
                'present_count': present,
                'attendance_rate': round(
                    present / total_enrolled * 100, 2
                ) if total_enrolled > 0 else 0,
            })

        return Response({
            'class': DashboardClassSerializer(class_obj).data,
            'total_enrolled': total_enrolled,
            'total_sessions': len(session_data),
            'sessions': session_data,
        })

class CommandantCertificateViewSet(viewsets.ReadOnlyModelViewSet):

    serializer_class = DashboardCertificateSerializer
    permission_classes = [IsAuthenticated, IsCommandantOrChiefInstructor]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'class_obj']
    search_fields = ['certificate_number', 'student_name', 'student_svc_number', 'course_name']
    ordering_fields = ['issued_at', 'completion_date']
    ordering = ['-issued_at']

    def get_queryset(self):
        user = self.request.user
        school = _get_school(user)
        if not school:
            return Certificate.objects.none()
        return Certificate.all_objects.filter(school=school)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        qs = self.get_queryset()
        total = qs.count()
        issued = qs.filter(status='issued').count()
        revoked = qs.filter(status='revoked').count()

        by_class = (
            qs.filter(status='issued')
            .values('class_name')
            .annotate(count=Count('id'))
            .order_by('-count')
        )

        return Response({
            'total': total,
            'issued': issued,
            'revoked': revoked,
            'by_class': list(by_class),
        })

class CommandantExamReportViewSet(viewsets.ReadOnlyModelViewSet):

    serializer_class = DashboardExamReportSerializer
    permission_classes = [IsAuthenticated, IsCommandantOrChiefInstructor]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['subject', 'class_obj']
    search_fields = ['title', 'description', 'subject__name', 'class_obj__name']
    ordering_fields = ['report_date', 'created_at']
    ordering = ['-report_date']

    def get_queryset(self):
        user = self.request.user
        school = _get_school(user)
        if not school:
            return ExamReport.objects.none()
        return ExamReport.all_objects.filter(
            school=school
        ).select_related(
            'subject', 'class_obj', 'class_obj__course', 'created_by'
        ).prefetch_related('exams', 'remarks')

    @action(detail=True, methods=['get'])
    def detailed_report(self, request, pk=None):
        report = self.get_object()
        exam_ids = report.exams.values_list('id', flat=True)

        enrollments = Enrollment.all_objects.filter(
            class_obj=report.class_obj, is_active=True
        ).select_related('student')

        student_data = []
        for enrollment in enrollments:
            results = ExamResult.all_objects.filter(
                exam_id__in=exam_ids,
                student=enrollment.student,
                is_submitted=True,
            )
            total_marks = sum(
                r.marks_obtained for r in results if r.marks_obtained
            )
            total_possible = sum(r.exam.total_marks for r in results)
            percentage = (
                round(total_marks / total_possible * 100, 2)
                if total_possible > 0 else 0
            )

            student_data.append({
                'student_id': enrollment.student.id,
                'student_name': enrollment.student.get_full_name(),
                'svc_number': enrollment.student.svc_number,
                'rank': (
                    enrollment.student.get_rank_display()
                    if enrollment.student.rank else None
                ),
                'total_marks': float(total_marks),
                'total_possible': total_possible,
                'percentage': percentage,
                'results': ExamResultSerializer(results, many=True).data,
            })

        student_data.sort(key=lambda x: x['percentage'], reverse=True)

        for i, s in enumerate(student_data, 1):
            s['position'] = i

        report_data = self.get_serializer(report).data

        return Response({
            'report': report_data,
            'students': student_data,
            'summary': {
                'total_students': len(student_data),
                'average_percentage': round(
                    sum(s['percentage'] for s in student_data) / len(student_data), 2
                ) if student_data else 0,
                'highest_percentage': student_data[0]['percentage'] if student_data else 0,
                'lowest_percentage': student_data[-1]['percentage'] if student_data else 0,
                'pass_count': sum(1 for s in student_data if s['percentage'] >= 50),
                'fail_count': sum(1 for s in student_data if s['percentage'] < 50),
            },
        })

    @action(detail=True, methods=['post', 'put'])
    def add_remark(self, request, pk=None):

        report = self.get_object()
        user = request.user
        remark_text = request.data.get('remark', '').strip()

        if not remark_text:
            return Response(
                {'error': 'Remark text is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if user.role not in ('commandant', 'chief_instructor'):
            return Response(
                {'error': 'Only Commandant or Chief Instructor can add remarks.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        school = _get_school(user)

        remark_obj, created = ExamReportRemark.all_objects.update_or_create(
            exam_report=report,
            author_role=user.role,
            defaults={
                'author': user,
                'remark': remark_text,
                'school': school,
            },
        )

        serializer = ExamReportRemarkSerializer(remark_obj)
        return Response(
            {
                'message': 'Remark added successfully.' if created else 'Remark updated successfully.',
                'remark': serializer.data,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=['get'])
    def remarks(self, request, pk=None):
        """List all remarks on this exam report."""
        report = self.get_object()
        remarks = report.remarks.all().select_related('author')
        return Response({
            'report_id': str(report.id),
            'report_title': report.title,
            'remarks': ExamReportRemarkSerializer(remarks, many=True).data,
        })

    @action(detail=False, methods=['get'])
    def pending_remarks(self, request):

        user = request.user
        qs = self.get_queryset()

        reports_without_my_remark = qs.exclude(
            remarks__author_role=user.role,
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

class CommandantExamResultViewSet(viewsets.ReadOnlyModelViewSet):

    serializer_class = ExamResultSerializer
    permission_classes = [IsAuthenticated, IsCommandantOrChiefInstructor]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['exam', 'student', 'is_submitted']
    ordering = ['-submitted_at']

    def get_queryset(self):
        user = self.request.user
        school = _get_school(user)
        if not school:
            return ExamResult.objects.none()

        qs = ExamResult.all_objects.filter(
            school=school
        ).select_related('exam', 'student', 'graded_by')

        class_id = self.request.query_params.get('class_id')
        if class_id:
            qs = qs.filter(exam__subject__class_obj_id=class_id)

        subject_id = self.request.query_params.get('subject_id')
        if subject_id:
            qs = qs.filter(exam__subject_id=subject_id)

        return qs


class CommandantEnrollmentViewSet(viewsets.ReadOnlyModelViewSet):

    serializer_class = EnrollmentSerializer
    permission_classes = [IsAuthenticated, IsCommandantOrChiefInstructor]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['class_obj', 'is_active']
    search_fields = ['student__first_name', 'student__last_name', 'student__svc_number']

    def get_queryset(self):
        user = self.request.user
        school = _get_school(user)
        if not school:
            return Enrollment.objects.none()
        return Enrollment.all_objects.filter(
            school=school
        ).select_related('student', 'class_obj')

class CommandantNoticeViewSet(viewsets.ReadOnlyModelViewSet):

    serializer_class = NoticeSerializer
    permission_classes = [IsAuthenticated, IsCommandantOrChiefInstructor]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['priority', 'is_active']
    search_fields = ['title', 'content']
    ordering = ['-created_at']

    def get_queryset(self):
        user = self.request.user
        school = _get_school(user)
        if not school:
            return Notice.objects.none()
        return Notice.all_objects.filter(school=school)






