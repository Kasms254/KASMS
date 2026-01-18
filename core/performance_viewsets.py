
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Avg, Count, Q, F, Sum, Max, Min
from django.utils import timezone
from datetime import timedelta

from .models import (
    Exam, ExamResult, Subject, Class, Enrollment, User, Attendance,
    AttendanceSession, SessionAttendance
)
from .serializers import (
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
            overall_exam_average = (total_marks / total_possible * 100) if total_possible > 0 else 0

            highest_exam_score = max(r.percentage for r in all_results)
            lowest_exam_score = min(r.percentage for r in all_results)
        else:
            overall_exam_average = 0
            highest_exam_score = 0
            lowest_exam_score = 0

        passing_results = sum(1 for r in all_results if r.percentage >= 50)
        total_result_count = all_results.count()
        exam_pass_rate = (passing_results / total_result_count * 100) if total_result_count > 0 else 0

        attendance_sessions = AttendanceSession.objects.filter(
            subject=subject,
            status__in=['active', 'completed']
        )
        total_sessions = attendance_sessions.count()

        all_session_attendances = SessionAttendance.objects.filter(
            session__subject=subject
        ).select_related('student', 'session')

        expected_attendances = total_students * total_sessions
        actual_attendances = all_session_attendances.count()
        overall_attendance_rate = (actual_attendances / expected_attendances * 100) if expected_attendances > 0 else 0

        student_performance = []
        
        for enrollment in enrolled_students:
            student = enrollment.student
            
            student_results = all_results.filter(student=student)
            if student_results.exists():
                student_total = sum(r.marks_obtained for r in student_results)
                student_possible = sum(r.exam.total_marks for r in student_results)
                exam_percentage = (student_total / student_possible * 100) if student_possible > 0 else 0
            else:
                exam_percentage = 0
                student_total = 0
                student_possible = 0

            student_attendances = all_session_attendances.filter(student=student)
            attended_count = student_attendances.count()
            present_count = student_attendances.filter(status='present').count()
            late_count = student_attendances.filter(status='late').count()
            
            attendance_rate = (attended_count / total_sessions * 100) if total_sessions > 0 else 0
            punctuality_rate = (present_count / attended_count * 100) if attended_count > 0 else 0

            combined_score = (exam_percentage * 0.7) + (attendance_rate * 0.3)

            student_performance.append({
                'student_id': student.id,
                'student_name': student.get_full_name(),
                'svc_number': getattr(student, 'svc_number', None),
                
                'exams_taken': student_results.count() if student_results.exists() else 0,
                'exam_percentage': round(exam_percentage, 2),
                'total_marks_obtained': float(student_total),
                'total_possible_marks': student_possible,
                
                'total_sessions': total_sessions,
                'sessions_attended': attended_count,
                'present_count': present_count,
                'late_count': late_count,
                'absent_count': total_sessions - attended_count,
                'attendance_rate': round(attendance_rate, 2),
                'punctuality_rate': round(punctuality_rate, 2),
                
                'combined_score': round(combined_score, 2),
                'performance_grade': _calculate_grade(combined_score)
            })

        student_performance.sort(key=lambda x: x['combined_score'], reverse=True)
        
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

      
        session_breakdown = []
        for session in attendance_sessions:
            session_attendances = all_session_attendances.filter(session=session)
            
            session_breakdown.append({
                'session_id': session.id,
                'session_title': session.title,
                'session_date': session.scheduled_start,
                'total_students': total_students,
                'marked_count': session_attendances.count(),
                'present': session_attendances.filter(status='present').count(),
                'late': session_attendances.filter(status='late').count(),
                'attendance_rate': round((session_attendances.count() / total_students * 100), 2) if total_students > 0 else 0
            })

        return Response({
            'subject': {
                'id': subject.id,
                'name': subject.name,
                'code': getattr(subject, 'subject_code', subject.name),
                'instructor': subject.instructor.get_full_name() if subject.instructor else None,
                'class': class_obj.name,
            },
            'overall_statistics': {
                'total_students_enrolled': total_students,
                
                'total_exams': exams.count(),
                'total_results_submitted': total_result_count,
                'exam_average_percentage': round(overall_exam_average, 2),
                'exam_pass_rate': round(exam_pass_rate, 2),
                'highest_exam_score': round(highest_exam_score, 2),
                'lowest_exam_score': round(lowest_exam_score, 2),
                
                'total_sessions': total_sessions,
                'expected_attendances': expected_attendances,
                'actual_attendances': actual_attendances,
                'attendance_rate': round(overall_attendance_rate, 2),
                
                'combined_performance': round((float(overall_exam_average) * 0.7) + (overall_attendance_rate * 0.3), 2)
            },
            'top_performers': top_performers,
            'all_students': student_performance,
            'exam_breakdown': exam_breakdown,
            'session_breakdown': session_breakdown,
        })

    @action(detail=False, methods=['get'])
    def attendance_correlation(self, request):
        """Analyze correlation between attendance and exam performance"""
        subject_id = request.query_params.get('subject_id')

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

        enrolled_students = Enrollment.objects.filter(
            class_obj=subject.class_obj,
            is_active=True
        ).select_related('student')

        all_results = ExamResult.objects.filter(
            exam__subject=subject,
            is_submitted=True,
            marks_obtained__isnull=False
        )

        sessions = AttendanceSession.objects.filter(subject=subject)
        total_sessions = sessions.count()

        if total_sessions == 0:
            return Response({
                'message': 'No attendance sessions found for this subject'
            })

        correlation_data = []
        
        for enrollment in enrolled_students:
            student = enrollment.student
            
            student_results = all_results.filter(student=student)
            if student_results.exists():
                total_marks = sum(r.marks_obtained for r in student_results)
                possible_marks = sum(r.exam.total_marks for r in student_results)
                exam_percentage = (total_marks / possible_marks * 100) if possible_marks > 0 else 0
            else:
                exam_percentage = 0

            
            attendances = SessionAttendance.objects.filter(
                session__subject=subject,
                student=student
            )
            attendance_rate = (attendances.count() / total_sessions * 100) if total_sessions > 0 else 0

            correlation_data.append({
                'student_name': student.get_full_name(),
                'attendance_rate': round(attendance_rate, 2),
                'exam_percentage': round(exam_percentage, 2)
            })

       
        correlation_data.sort(key=lambda x: x['attendance_rate'], reverse=True)

       
        if len(correlation_data) >= 2:
            import statistics
            attendance_rates = [d['attendance_rate'] for d in correlation_data]
            exam_percentages = [d['exam_percentage'] for d in correlation_data]
            
   
            n = len(correlation_data)
            sum_attendance = sum(attendance_rates)
            sum_exam = sum(exam_percentages)
            sum_attendance_exam = sum(a * e for a, e in zip(attendance_rates, exam_percentages))
            sum_attendance_sq = sum(a ** 2 for a in attendance_rates)
            sum_exam_sq = sum(e ** 2 for e in exam_percentages)
            
            numerator = (n * sum_attendance_exam) - (sum_attendance * sum_exam)
            denominator_part1 = (n * sum_attendance_sq) - (sum_attendance ** 2)
            denominator_part2 = (n * sum_exam_sq) - (sum_exam ** 2)
            denominator = (denominator_part1 * denominator_part2) ** 0.5
            
            correlation = numerator / denominator if denominator != 0 else 0
        else:
            correlation = 0

        return Response({
            'subject': {
                'id': subject.id,
                'name': subject.name
            },
            'correlation_coefficient': round(correlation, 4),
            'interpretation': _interpret_correlation(correlation),
            'data_points': len(correlation_data),
            'correlation_data': correlation_data
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
            ).get(id=class_id, is_active=True)
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

        all_results = ExamResult.objects.filter(
            exam__subject__class_obj=class_obj,
            is_submitted=True,
            marks_obtained__isnull=False
        ).select_related('exam', 'exam__subject', 'student')

        if all_results.exists():
            total_marks = sum(r.marks_obtained for r in all_results)
            total_possible = sum(r.exam.total_marks for r in all_results)
            class_exam_average = (total_marks / total_possible * 100) if total_possible > 0 else 0

            passing_results = sum(1 for r in all_results if r.percentage >= 50)
            exam_pass_rate = (passing_results / all_results.count() * 100) if all_results.count() > 0 else 0
        else:
            class_exam_average = 0
            exam_pass_rate = 0

        attendance_sessions = AttendanceSession.objects.filter(
            class_obj=class_obj
        )
        total_sessions = attendance_sessions.count()

        all_session_attendances = SessionAttendance.objects.filter(
            session__class_obj=class_obj
        ).select_related('student', 'session')

        expected_attendances = total_students * total_sessions
        actual_attendances = all_session_attendances.count()
        class_attendance_rate = (actual_attendances / expected_attendances * 100) if expected_attendances > 0 else 0

        student_rankings = []

        for enrollment in enrollments:
            student = enrollment.student
            
            student_results = all_results.filter(student=student)
            if student_results.exists():
                student_total = sum(r.marks_obtained for r in student_results)
                student_possible = sum(r.exam.total_marks for r in student_results)
                exam_percentage = (student_total / student_possible * 100) if student_possible > 0 else 0
            else:
                exam_percentage = 0

            student_attendances = all_session_attendances.filter(student=student)
            attended_count = student_attendances.count()
            present_count = student_attendances.filter(status='present').count()
            late_count = student_attendances.filter(status='late').count()
            
            attendance_rate = (attended_count / total_sessions * 100) if total_sessions > 0 else 0

            exam_percentage = float(exam_percentage or 0)
            attendance_rate = float(attendance_rate or 0)
            combined_score = (exam_percentage * 0.7) + (attendance_rate * 0.3)

            subject_scores = []
            for subject in subjects:
                subject_results = student_results.filter(exam__subject=subject)
                if subject_results.exists():
                    subj_total = sum(r.marks_obtained for r in subject_results)
                    subj_possible = sum(r.exam.total_marks for r in subject_results)
                    subj_pct = (subj_total / subj_possible * 100) if subj_possible > 0 else 0

                    subject_attendances = student_attendances.filter(session__subject=subject)
                    subject_sessions = attendance_sessions.filter(subject=subject).count()
                    subj_attendance_rate = (subject_attendances.count() / subject_sessions * 100) if subject_sessions > 0 else 0

                    subject_scores.append({
                        'subject_name': subject.name,
                        'subject_code': getattr(subject, 'subject_code', subject.name),
                        'exam_percentage': round(subj_pct, 2),
                        'attendance_rate': round(subj_attendance_rate, 2),
                        'combined_score': round((float(subj_pct or 0) * 0.7) + (float(subj_attendance_rate or 0) * 0.3), 2)
                        })

            student_rankings.append({
                'student_id': student.id,
                'student_name': student.get_full_name(),
                'svc_number': getattr(student, 'svc_number', None),
                
                'total_exams_taken': student_results.count() if student_results.exists() else 0,
                'exam_percentage': round(exam_percentage, 2),
                
                'total_sessions': total_sessions,
                'sessions_attended': attended_count,
                'attendance_rate': round(attendance_rate, 2),
                
                'combined_score': round(combined_score, 2),
                'overall_grade': _calculate_grade(combined_score),
                'subject_breakdown': subject_scores,
            })

        student_rankings.sort(key=lambda x: x['combined_score'], reverse=True)
        for idx, student in enumerate(student_rankings, 1):
            student['rank'] = idx

        top_performers = student_rankings[:3]

        subject_performance = []
        for subject in subjects:
            subject_results = all_results.filter(exam__subject=subject)
            subject_sessions = attendance_sessions.filter(subject=subject)

            if subject_results.exists():
                subj_total = sum(r.marks_obtained for r in subject_results)
                subj_possible = sum(r.exam.total_marks for r in subject_results)
                subj_exam_avg = (subj_total / subj_possible * 100) if subj_possible > 0 else 0

                subj_passing = sum(1 for r in subject_results if r.percentage >= 50)
                subj_pass_rate = (subj_passing / subject_results.count() * 100) if subject_results.count() > 0 else 0
            else:
                subj_exam_avg = 0
                subj_pass_rate = 0

            subj_attendances = all_session_attendances.filter(session__subject=subject)
            subj_sessions_count = subject_sessions.count()
            subj_expected_att = total_students * subj_sessions_count
            subj_actual_att = subj_attendances.count()
            subj_att_rate = (subj_actual_att / subj_expected_att * 100) if subj_expected_att > 0 else 0

            subject_performance.append({
                'subject_id': subject.id,
                'subject_name': subject.name,
                'subject_code': getattr(subject, 'subject_code', subject.name),
                'instructor': subject.instructor.get_full_name() if subject.instructor else None,
                
                'total_exams': Exam.objects.filter(subject=subject, is_active=True).count(),
                'results_count': subject_results.count() if subject_results.exists() else 0,
                'exam_average': round(subj_exam_avg, 2),
                'pass_rate': round(subj_pass_rate, 2),
                
                'total_sessions': subj_sessions_count,
                'attendance_rate': round(subj_att_rate, 2),
                
                'combined_performance': round((float(subj_exam_avg or 0)* 0.7) + (float(subj_att_rate or 0) * 0.3), 2)
            })

        subject_performance.sort(key=lambda x: x['combined_performance'], reverse=True)

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
                
                'total_exams': Exam.objects.filter(subject__class_obj=class_obj, is_active=True).count(),
                'total_results_submitted': all_results.count(),
                'class_exam_average': round(class_exam_average, 2),
                'exam_pass_rate': round(exam_pass_rate, 2),
                
                'total_sessions': total_sessions,
                'expected_attendances': expected_attendances,
                'actual_attendances': actual_attendances,
                'class_attendance_rate': round(class_attendance_rate, 2),
                
                'overall_performance': round((float(class_exam_average or 0)* 0.7) + (float(class_attendance_rate or 0) * 0.3), 2)
            },
            'top_performers': top_performers,
            'all_students': student_rankings,
            'subject_performance': subject_performance,
        })


def _calculate_grade(percentage):
    if percentage >= 90:
        return 'A'
    elif percentage >= 80:
        return 'B'
    elif percentage >= 70:
        return 'C'
    elif percentage >= 60:
        return 'D'
    else:
        return 'F'


def _interpret_correlation(correlation):
    abs_corr = abs(correlation)
    direction = "positive" if correlation > 0 else "negative"
    
    if abs_corr >= 0.7:
        strength = "strong"
    elif abs_corr >= 0.4:
        strength = "moderate"
    elif abs_corr >= 0.2:
        strength = "weak"
    else:
        strength = "very weak or no"
    
    return f"There is a {strength} {direction} correlation between attendance and exam performance"