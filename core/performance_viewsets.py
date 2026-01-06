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

from .permissions import IsAdminOrInstructor, IsAdminOrCommandant


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
            }, status=status.HTTP_404_NOT_FOUND)  

        class_obj = subject.class_obj

   
        exams = Exam.objects.filter(
            subject=subject,
            is_active=True,
        ).order_by('exam_date')

        enrolled_students = Enrollment.objects.filter(
            class_obj=class_obj,
            is_active=True
        ).select_related('student')

        total_students = enrolled_students.count()

        all_results = ExamResult.objects.filter(
            exam__subject=subject,
            is_submitted=True,
            marks_obtained__isnull=False
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

        passing_results = sum(1 for r in all_results if r.percentage >= 50)
        total_result_count = all_results.count()
        pass_rate = (passing_results / total_result_count * 100) if total_result_count > 0 else 0

        grade_distribution = {
            'A': sum(1 for r in all_results if r.grade == 'A'),
            'B': sum(1 for r in all_results if r.grade == 'B'),
            'C': sum(1 for r in all_results if r.grade == 'C'),
            'D': sum(1 for r in all_results if r.grade == 'D'),
            'F': sum(1 for r in all_results if r.grade == 'F'),
        }

        student_performance = []
        for enrollment in enrolled_students:
            student = enrollment.student
            student_results = all_results.filter(student=student)

            if student_results.exists():
                student_total = sum(r.marks_obtained for r in student_results)
                student_possible = sum(r.exam.total_marks for r in student_results)
                student_percentage = (student_total / student_possible * 100) if student_possible > 0 else 0

                subject_attendance = Attendance.objects.filter(
                    student=student,
                    subject=subject
                )
                total_attendance = subject_attendance.count()
                present_count = subject_attendance.filter(status='present').count()
                attendance_rate = (present_count / total_attendance * 100) if total_attendance > 0 else 0

                student_performance.append({
                    'student_id': student.id,
                    'student_name': student.get_full_name(),
                    'svc_number': getattr(student, 'svc_number', None),
                    'exams_taken': student_results.count(),
                    'total_marks_obtained': float(student_total),
                    'total_possible_marks': student_possible,  
                    'percentage': round(student_percentage, 2),
                    'attendance_rate': round(attendance_rate, 2),
                    'total_attendance_records': total_attendance,
                })
            else:
                student_performance.append({
                    'student_id': student.id,
                    'student_name': student.get_full_name(),
                    'svc_number': getattr(student, 'svc_number', None),
                    'exams_taken': 0,
                    'total_marks_obtained': 0,
                    'total_possible_marks': 0,
                    'percentage': 0,
                    'attendance_rate': 0,
                    'total_attendance_records': 0,
                })

        student_performance.sort(key=lambda x: x['percentage'], reverse=True)
        for idx, student in enumerate(student_performance, 1):
            student['rank'] = idx

        top_performers = student_performance[:10]

        exam_breakdown = []
        for exam in exams:
            exam_results = all_results.filter(exam=exam)
            if exam_results.exists():
                exam_total = sum(r.marks_obtained for r in exam_results)
                exam_possible = sum(r.exam.total_marks for r in exam_results)
                exam_avg = (exam_total / exam_possible * 100) if exam_possible > 0 else 0

                exam_breakdown.append({
                    'exam_id': exam.id,
                    'exam_title': exam.title,
                    'exam_type': exam.exam_type,
                    'exam_date': exam.exam_date,
                    'total_marks': exam.total_marks,
                    'students_attempted': exam_results.count(),
                    'average_percentage': round(exam_avg, 2),
                    'highest_score': round(max(r.percentage for r in exam_results), 2),
                    'lowest_score': round(min(r.percentage for r in exam_results), 2),
                })

        return Response({
            'subject': {
                'id': subject.id,
                'name': subject.name,
                'code': getattr(subject, 'code', subject.name),  
                'instructor': subject.instructor.get_full_name() if subject.instructor else None,
                'class': class_obj.name,
            },
            'overall_statistics': {
                'total_students_enrolled': total_students,
                'total_exams': exams.count(),
                'total_results_submitted': total_result_count,
                'overall_average_percentage': round(overall_average, 2),
                'highest_score': round(highest_score, 2),
                'lowest_score': round(lowest_score, 2),
                'pass_rate': round(pass_rate, 2),
            },
            'grade_distribution': grade_distribution,
            'top_performers': top_performers,
            'all_students': student_performance,
            'exam_breakdown': exam_breakdown,
        })

    @action(detail=False, methods=['get'])
    def compare_subjects(self, request):
        
        class_id = request.query_params.get('class_id')

        if not class_id:
            return Response({
                'error': 'class_id parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            class_obj = Class.objects.get(id=class_id, is_active=True)
        except Class.DoesNotExist:
            return Response({
                'error': 'Class not found'
            }, status=status.HTTP_404_NOT_FOUND)

        subjects = Subject.objects.filter(
            class_obj=class_obj,
            is_active=True
        ).select_related('instructor')

        subject_comparison = []

        for subject in subjects:
            all_results = ExamResult.objects.filter(
                exam__subject=subject,
                is_submitted=True,
                marks_obtained__isnull=False
            ).select_related('exam')

            if all_results.exists():
                total_marks = sum(r.marks_obtained for r in all_results)
                total_possible = sum(r.exam.total_marks for r in all_results)
                avg_percentage = (total_marks / total_possible * 100) if total_possible > 0 else 0 

                passing_count = sum(1 for r in all_results if r.percentage >= 50)
                pass_rate = (passing_count / all_results.count() * 100) if all_results.count() > 0 else 0

                subject_comparison.append({
                    'subject_id': subject.id,
                    'subject_name': subject.name,
                    'subject_code': getattr(subject, 'code', subject.name), 
                    'instructor': subject.instructor.get_full_name() if subject.instructor else None,
                    'total_exams': Exam.objects.filter(subject=subject, is_active=True).count(),
                    'results_count': all_results.count(),
                    'average_percentage': round(avg_percentage, 2),
                    'pass_rate': round(pass_rate, 2),
                    'highest_score': round(max(r.percentage for r in all_results), 2),
                    'lowest_score': round(min(r.percentage for r in all_results), 2),
                })

        subject_comparison.sort(key=lambda x: x['average_percentage'], reverse=True)

        return Response({
            'class': {
                'id': class_obj.id,
                'name': class_obj.name,
                'course': class_obj.course.name if hasattr(class_obj, 'course') else None,
            },
            'total_subjects': len(subject_comparison),
            'subjects': subject_comparison,
        })

    @action(detail=False, methods=['get'])
    def trend_analysis(self, request):
        subject_id = request.query_params.get('subject_id')
        days = int(request.query_params.get('days', 90))

        if not subject_id:
            return Response({
                'error': 'subject_id parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            subject = Subject.objects.get(id=subject_id, is_active=True)
        except Subject.DoesNotExist:
            return Response({
                'error': 'Subject not found'
            }, status=status.HTTP_404_NOT_FOUND)

        cutoff_date = timezone.now().date() - timedelta(days=days)

        exams = Exam.objects.filter(
            subject=subject,
            is_active=True,
            exam_date__gte=cutoff_date
        ).order_by('exam_date')

        trend_data = []

        for exam in exams:
            results = ExamResult.objects.filter(
                exam=exam,
                is_submitted=True,
                marks_obtained__isnull=False
            )

            if results.exists():
                total = sum(r.marks_obtained for r in results)
                possible = sum(r.exam.total_marks for r in results)
                avg = (total / possible * 100) if possible > 0 else 0

                trend_data.append({
                    'exam_date': exam.exam_date,
                    'exam_title': exam.title,
                    'exam_type': exam.exam_type,
                    'average_percentage': round(avg, 2),
                    'students_attempted': results.count(),
                })

        return Response({
            'subject': {
                'id': subject.id,
                'name': subject.name,
                'code': getattr(subject, 'code', subject.name), 
            },
            'period': {
                'start_date': cutoff_date,
                'end_date': timezone.now().date(),
                'days': days,
            },
            'trend': trend_data,
        })


class ClassPerformanceViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsAdminOrCommandant]

    @action(detail=False, methods=['get'])
    def summary(self, request):

        class_id = request.query_params.get('class_id')

        if not class_id:
            return Response({
                'error': 'class_id parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            class_obj = Class.objects.select_related(
                'course', 'instructor'
            ).get(
                id=class_id,
                is_active=True
            )
        except Class.DoesNotExist:
            return Response({
                'error': 'Class not found'
            }, status=status.HTTP_404_NOT_FOUND)

        enrollments = Enrollment.objects.filter(
            class_obj=class_obj,
            is_active=True
        ).select_related('student')

        total_students = enrollments.count()

        subjects = Subject.objects.filter(
            class_obj=class_obj,
            is_active=True
        ).select_related('instructor')

        # Get all exams for this class
        exams = Exam.objects.filter(
            subject__class_obj=class_obj,
            is_active=True
        )

        # Get all results for this class
        all_results = ExamResult.objects.filter(
            exam__subject__class_obj=class_obj,
            is_submitted=True,
            marks_obtained__isnull=False
        ).select_related('exam', 'exam__subject', 'student')

        # Calculate overall class statistics
        if all_results.exists():
            total_marks = sum(r.marks_obtained for r in all_results)
            total_possible = sum(r.exam.total_marks for r in all_results)
            class_average = (total_marks / total_possible * 100) if total_possible > 0 else 0

            passing_results = sum(1 for r in all_results if r.percentage >= 50)
            pass_rate = (passing_results / all_results.count() * 100) if all_results.count() > 0 else 0
        else:
            class_average = 0
            pass_rate = 0

        # Grade distribution
        grade_distribution = {
            'A': sum(1 for r in all_results if r.grade == 'A'),
            'B': sum(1 for r in all_results if r.grade == 'B'),
            'C': sum(1 for r in all_results if r.grade == 'C'),
            'D': sum(1 for r in all_results if r.grade == 'D'),
            'F': sum(1 for r in all_results if r.grade == 'F'),
        }

        # Student rankings
        student_rankings = []

        for enrollment in enrollments:
            student = enrollment.student
            student_results = all_results.filter(student=student)

            if student_results.exists():
                student_total = sum(r.marks_obtained for r in student_results)
                student_possible = sum(r.exam.total_marks for r in student_results)
                student_percentage = (student_total / student_possible * 100) if student_possible > 0 else 0

                # Get overall attendance
                student_attendance = Attendance.objects.filter(
                    student=student,
                    class_obj=class_obj
                )

                total_attendance = student_attendance.count()
                present_count = student_attendance.filter(status='present').count()
                attendance_rate = (present_count / total_attendance * 100) if total_attendance > 0 else 0

                # Subject-wise performance
                subject_scores = []
                for subject in subjects:
                    subject_results = student_results.filter(exam__subject=subject)
                    if subject_results.exists():
                        subj_total = sum(r.marks_obtained for r in subject_results)
                        subj_possible = sum(r.exam.total_marks for r in subject_results)
                        subj_pct = (subj_total / subj_possible * 100) if subj_possible > 0 else 0

                        subject_scores.append({
                            'subject_name': subject.name,
                            'subject_code': getattr(subject, 'code', subject.name),  # FIXED
                            'percentage': round(subj_pct, 2),
                        })

                student_rankings.append({
                    'student_id': student.id,
                    'student_name': student.get_full_name(),
                    'svc_number': getattr(student, 'svc_number', None),  # FIXED: typo
                    'total_exams_taken': student_results.count(),
                    'overall_percentage': round(student_percentage, 2),
                    'attendance_rate': round(attendance_rate, 2),
                    'subject_breakdown': subject_scores,
                })
            else:
                student_rankings.append({
                    'student_id': student.id,
                    'student_name': student.get_full_name(),
                    'svc_number': getattr(student, 'svc_number', None),
                    'total_exams_taken': 0,
                    'overall_percentage': 0,
                    'attendance_rate': 0,
                    'subject_breakdown': [],
                })

        # Sort and rank students
        student_rankings.sort(key=lambda x: x['overall_percentage'], reverse=True)
        for idx, student in enumerate(student_rankings, 1):
            student['rank'] = idx

        # Top 10 performers
        top_performers = student_rankings[:10]

        # Subject-wise class performance
        subject_performance = []
        for subject in subjects:
            subject_results = all_results.filter(exam__subject=subject)

            if subject_results.exists():
                subj_total = sum(r.marks_obtained for r in subject_results)
                subj_possible = sum(r.exam.total_marks for r in subject_results)
                subj_avg = (subj_total / subj_possible * 100) if subj_possible > 0 else 0

                subj_passing = sum(1 for r in subject_results if r.percentage >= 50)
                subj_pass_rate = (subj_passing / subject_results.count() * 100) if subject_results.count() > 0 else 0

                subject_performance.append({
                    'subject_id': subject.id,
                    'subject_name': subject.name,
                    'subject_code': getattr(subject, 'code', subject.name),  # FIXED
                    'instructor': subject.instructor.get_full_name() if subject.instructor else None,
                    'total_exams': Exam.objects.filter(subject=subject, is_active=True).count(),
                    'results_count': subject_results.count(),
                    'average_percentage': round(subj_avg, 2),
                    'pass_rate': round(subj_pass_rate, 2),
                    'highest_score': round(max(r.percentage for r in subject_results), 2),
                    'lowest_score': round(min(r.percentage for r in subject_results), 2),  # FIXED: typo
                })

        # Sort subjects by performance
        subject_performance.sort(key=lambda x: x['average_percentage'], reverse=True)

        # Attendance statistics
        class_attendance = Attendance.objects.filter(class_obj=class_obj)
        total_attendance_records = class_attendance.count()
        present_records = class_attendance.filter(status='present').count()
        class_attendance_rate = (present_records / total_attendance_records * 100) if total_attendance_records > 0 else 0

        return Response({
            'class': {
                'id': class_obj.id,
                'name': class_obj.name,
                'course': class_obj.course.name if hasattr(class_obj, 'course') else None,
                'instructor': class_obj.instructor.get_full_name() if hasattr(class_obj, 'instructor') and class_obj.instructor else None,
            },
            'overall_statistics': {
                'total_students': total_students,
                'total_subjects': subjects.count(),
                'total_exams': exams.count(),
                'total_results_submitted': all_results.count(),
                'class_average_percentage': round(class_average, 2),
                'class_pass_rate': round(pass_rate, 2),  # FIXED: typo
                'class_attendance_rate': round(class_attendance_rate, 2),
            },
            'grade_distribution': grade_distribution,
            'top_performers': top_performers,
            'all_students': student_rankings,
            'subject_performance': subject_performance,
        })

    @action(detail=False, methods=['get'])
    def top_performers(self, request):
        
        class_id = request.query_params.get('class_id')
        limit = int(request.query_params.get('limit', 10))

        if not class_id:
            return Response({
                'error': 'class_id parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            class_obj = Class.objects.get(id=class_id, is_active=True)
        except Class.DoesNotExist:
            return Response({
                'error': 'Class not found'
            }, status=status.HTTP_404_NOT_FOUND)

        enrollments = Enrollment.objects.filter(
            class_obj=class_obj,
            is_active=True
        ).select_related('student')

        all_results = ExamResult.objects.filter(
            exam__subject__class_obj=class_obj,
            is_submitted=True,
            marks_obtained__isnull=False
        ).select_related('exam', 'student')

        student_data = []
        for enrollment in enrollments:
            student = enrollment.student
            student_results = all_results.filter(student=student)

            if student_results.exists():
                total = sum(r.marks_obtained for r in student_results)
                possible = sum(r.exam.total_marks for r in student_results)
                percentage = (total / possible * 100) if possible > 0 else 0

                student_data.append({
                    'student_id': student.id,
                    'student_name': student.get_full_name(),
                    'svc_number': getattr(student, 'svc_number', None),
                    'total_exams': student_results.count(),
                    'overall_percentage': round(percentage, 2),
                })

        # Sort and limit
        student_data.sort(key=lambda x: x['overall_percentage'], reverse=True)
        top_students = student_data[:limit]

        for idx, student in enumerate(top_students, 1):
            student['rank'] = idx

        return Response({
            'class': {
                'id': class_obj.id,
                'name': class_obj.name,
            },
            'limit': limit,
            'top_performers': top_students,
        })

    @action(detail=False, methods=['get'])
    def compare_classes(self, request):

        course_id = request.query_params.get('course_id')

        if course_id:
            classes = Class.objects.filter(
                course_id=course_id,
                is_active=True,
            ).select_related('course', 'instructor')
        else:
            classes = Class.objects.filter(is_active=True).select_related('course', 'instructor')

        class_comparison = []

        for class_obj in classes:
            all_results = ExamResult.objects.filter(
                exam__subject__class_obj=class_obj,
                is_submitted=True,
                marks_obtained__isnull=False
            ).select_related('exam')

            enrollments = Enrollment.objects.filter(
                class_obj=class_obj,
                is_active=True
            )

            if all_results.exists():
                total = sum(r.marks_obtained for r in all_results)
                possible = sum(r.exam.total_marks for r in all_results)
                avg = (total / possible * 100) if possible > 0 else 0

                passing = sum(1 for r in all_results if r.percentage >= 50)
                pass_rate = (passing / all_results.count() * 100) if all_results.count() > 0 else 0

                class_comparison.append({
                    'class_id': class_obj.id,
                    'class_name': class_obj.name,
                    'course': class_obj.course.name if hasattr(class_obj, 'course') else None,
                    'instructor': class_obj.instructor.get_full_name() if hasattr(class_obj, 'instructor') and class_obj.instructor else None,
                    'total_students': enrollments.count(),
                    'total_results': all_results.count(),
                    'average_percentage': round(avg, 2),
                    'pass_rate': round(pass_rate, 2),
                })

        # Sort by average percentage
        class_comparison.sort(key=lambda x: x['average_percentage'], reverse=True)

        return Response({
            'total_classes': len(class_comparison),
            'classes': class_comparison,
        })

    @action(detail=False, methods=['get'])
    def export_report(self, request):

        class_id = request.query_params.get('class_id')
        report_format = request.query_params.get('format', 'summary')

        if not class_id:
            return Response({
                'error': 'class_id parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Get the full summary
        request.query_params._mutable = True
        request.query_params['class_id'] = class_id
        summary_response = self.summary(request)

        if report_format == 'detailed':
            # Include detailed exam results
            return Response({
                **summary_response.data,
                'report_generated_at': timezone.now(),
                'report_type': 'detailed',
            })
        else:
            # Return summary only
            return Response({
                'class': summary_response.data['class'],
                'overall_statistics': summary_response.data['overall_statistics'],
                'grade_distribution': summary_response.data['grade_distribution'],
                'top_performers': summary_response.data['top_performers'],
                'subject_performance': summary_response.data['subject_performance'],
                'report_generated_at': timezone.now(),
                'report_type': 'summary',
            })