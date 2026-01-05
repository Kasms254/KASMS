from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Avg, Count, Q, F, Sum, Max, Min
from django.utils import timezone
from datetime import timedelta

from .models import(
    Exam, ExamResult, Subject, Class, Enrollment, User, Attendance
)

from .serializers import(
    ExamSerializer, ExamResultSerializer, SubjectSerializer, EnrollmentSerializer
)

from .permissions import IsAdminOrInstructor

class SubjectPerformanceViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsAdminOrInstructor]

    @action(detail=False, methods=['get'])
    def summary(self, request):

        subject_id = request.query_params.get('subject_id')

        if not subject_id:
            return Response({
                'error': 'subject_id parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            subject = Subject.objects.select_related(
                'instructor', 'class_obj', 'class_obj__course'
            ).get(id=subject_id, is_active=True)
        except Subject.DoesNotExist:
            return Response({
                'error': 'Subject not found'
            }, status=status.HTTP_400_BAD_REQUEST)


        class_obj = subject.class_obj


        exams = Exam.objects.filter(
            subject=subject,
            is_active=True,
        ).order_by('exam_date')


        enrolled_students = Enrollment.objects.filter(
            class_obj=class_obj,
            is_active=True,
            marks_obtained__is_null = False
        ).select_related('exam', 'student', 'graded_by')


        if all_results.exists():
            total_marks = sum(r.marks_obtained for r in all_results)
            total_possible = sum(r.exam.total_marks for r in all_results)

            overall_average = (total_marks / total_possible * 100) if total_possible > 0 else 0

            highest_score = max(r.percentage for r in all_results)
            lowest_score = min(r.percentage for r in all_results)

        else:

            overall_average = 0
            highest_score = 0
            lowest_score = 0

        passing_results = sum(1 for r in all_results if r.percentage >=50)
        total_result_count = all_results.count()
        pass_rate = (passing_results / total_result_count * 100) if total_result_count > 0 else 0
