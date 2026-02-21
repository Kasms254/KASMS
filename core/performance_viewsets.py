from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Avg, Count, Q, F, Sum, Max, Min
from django.utils import timezone
from datetime import timedelta

from .models import (
    Exam, ExamResult, Subject, Class, Enrollment, User, Attendance, AttendanceSession, SessionAttendance
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
                'error':'subject_id parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            subject = Subject.objects.select_related(
                'instructor', 'class_obj', 'class_obj__course'
            ).get(id=subject_id, is_active=True)

        except Subject.DoesNotExist:
            return Response({
                'error': ' Subject Not Found'
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
            exam__subject  =subject,
            is_submitted= True,
            marks_obtained__isnull = False
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

        passing_results = sum(1 for r in all_results if r.percentage >=50)
        total_results_count = all_results.count()
        exam_pass_rate = (passing_results / total_results_count * 100) if total_results_count > 0 else 0

        attendance_sessions = AttendanceSession.objects.filter(
            subject=subject,
            status__in = ['active', 'completed']
        )
        total_sessions = attendance_sessions.count()
        all_session_attendances = SessionAttendance.objects.filter(
            session__subject = subject
        ).select_related('student', 'session')

        expected_attendances = total_students * total_sessions
        actual_attendances = all_session_attendances.count()
        overall_attendance_rate  =(actual_attendances / expected_attendances *100) if expected_attendances > 0 else 0

        grade_distribution = {
            'A': sum(1 for r in all_results if r.grade =='A'),
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
            punctuality_rate = (present_count /attended_count * 100) if attended_count > 0 else 0

            combined_score = (float(exam_percentage) * 0.7) + (float(attendance_rate)* 0.3)

            student_performance.append({
                'student_id': student.id,
                'student_name':student.get_full_name(),
                'svc_number':getattr(student, 'svc_number', None),

                'exams_taken':student_results.count() if student_results.exists() else 0,
                'exam_percentage':round(exam_percentage, 2),
                'total_marks_obtained':float(student_total),
                'total_possible_marks':student_possible,
            
                'total_sessions': total_sessions,
                'sessions_attached': attended_count,
                'present_count': present_count,
                'late_count': late_count,
                'absent_count': total_sessions - attended_count,
                'attendance_rate':round(attendance_rate, 2),
                'punctuality_rate':round(punctuality_rate, 2),

                'combined_score':round(combined_score, 2),
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
                    'exam_title':exam.title,
                    'exam_type':exam.exam_type,
                    'exam_date':exam.exam_date,
                    'total_marks':exam.total_marks,
                    'student_attempted':exam_results.count(),
                    'average_percentage':round(exam_avg, 2),
                    'highest_score':round(max(r.percentage for r in exam_results), 2),
                    'lowest_score':round(min(r.percentage for r in exam_results), 2),
                })

        session_breakdown = []
        for session in attendance_sessions:
            session_attendances = all_session_attendances.filter(session=session)

            session_breakdown.append({
                'session_id':session.id,
                'session_title':session.title,
                'session_date':session.scheduled_start,
                'total_students':total_students,
                'marked_count':session_attendances.count(),
                'present':session_attendances.filter(status='present').count(),
                'late':session_attendances.filter(status='late').count(),
                'attendance_rate':round((session_attendances.count() /total_students * 100), 2) if total_students > 0 else 0

            })
        return Response({
            'subject':{
                'id':subject.id,
                'name':subject.name,
                'code':getattr(subject, 'subject_code', getattr(subject, 'code', subject.name)),
                'instructor': subject.instructor.get_full_name() if subject.instructor else None,
                'class': class_obj.name,
            },
            'overall_statistics':{
                'total_students_enrolled': total_students,
                'total_exams':exams.count(),
                'total_results_submitted':total_results_count,
                'exam_average_percentage':round(overall_exam_average, 2),
                'exam_pass_rate':round(exam_pass_rate, 2),
                'highest_exam_score':round(highest_exam_score, 2),
                'lowest_exam_score': round(lowest_exam_score, 2),

                'total_sessions':total_sessions,
                'expected_attendances':expected_attendances,
                'actual_attendances':actual_attendances,
                'attendance_rate':round(overall_attendance_rate, 2),

                'combined_performance': round((float(overall_exam_average) * 0.7) + (overall_attendance_rate * 0.3), 2)
            },
            'grade_distribution': grade_distribution,
            'top_performers':top_performers,
            'all_students':student_performance,
            'exam_breakdown':exam_breakdown,
            'session_breakdown':session_breakdown,   
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
                exam__subject = subject,
                is_submitted= True, 
                marks_obtained__isnull = False
            ).select_related('exam')

            if all_results.exists():
                total_marks = sum(r.marks_obtained for r in all_results)
                total_possible = sum(r.exam.total_marks for r in all_results)
                avg_percentage = (total_marks / total_possible * 100) if total_possible > 0 else 0

                passing_count = sum(1 for r in all_results if r.percentage >= 50)
                pass_rate = (passing_count / all_results.count() * 100) if all_results.count() > 0 else 0

                highest = round(max(r.percentage for r in all_results), 2)
                lowest = round(min(r.percentage for r in all_results), 2)

            else:
                avg_percentage =0
                pass_rate = 0
                highest = 0
                lowest = 0

            sessions  =AttendanceSession.objects.filter(subject=subject)
            attendances = SessionAttendance.objects.filter(session__subject=subject)

            enrolled = Enrollment.objects.filter(class_obj=class_obj, is_active=True).count()
            expected = enrolled * sessions.count()
            actual  =attendances.count()
            attendance_rate = (actual / expected * 100) if expected > 0 else 0
            subject_comparison.append({
                'subject_id': subject.id,
                'subject_name':subject.name,
                'subject_code':getattr(subject, 'subject_code', getattr(subject, 'code', subject.name)),
                'instructor':subject.instructor.get_full_name() if subject.instructor else None,
                'total_exams':Exam.objects.filter(subject=subject, is_active=True).count(),
                'results_count': all_results.count(),
                'average_percentage':round(avg_percentage, 2),
                'pass_rate':round(pass_rate, 2),
                'highest_score': highest,
                'lowest_score': lowest,
                'attendance_rate':round(attendance_rate, 2),
                'combined_performance':round((float(avg_percentage) * 0.7) + (float(attendance_rate) * 0.3), 2)
            })

        subject_comparison.sort(key=lambda x: x['combined_performance'], reverse=True)

        return Response({
            'class':{
                'id':class_obj.id,
                'name':class_obj.name,
                'course':class_obj.course.name if hasattr(class_obj, 'course') else None,
            },
            'total_subjects': len(subject_comparison),
            'subjects':subject_comparison,
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


        cutoff_date = timezone.now().date() -timedelta(days=days)

        exams = Exam.objects.filter(
            subject=subject,
            is_active=True,
            exam_date__gte = cutoff_date
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
                avg = (total /possible * 100) if possible > 0 else 0

                trend_data.append({
                    'date':exam.exam_date,
                    'type':'exam',
                    'exam_date':exam.exam_date,
                    'exam_title':exam.title,
                    'exam_type':exam.exam_type,
                    'average_percentage':round(avg, 2),
                    'students_attempted':results.count(),
                })

        
        sessions = AttendanceSession.objects.filter(
            subject=subject,
            scheduled_start__gte=cutoff_date
        ).order_by('scheduled_start')

        for session in sessions:
            attendances = SessionAttendance.objects.filter(
                session=session
                            )
            enrolled = Enrollment.objects.filter(
                class_obj=subject.class_obj,
                is_active=True
            ).count()

            att_rate = (attendances.count() / enrolled * 100) if enrolled > 0 else 0

            trend_data.append({
                'date':session.scheduled_start.date() if hasattr(session.scheduled_start, 'date') else session.scheduled_start,
                'type':'attendance',
                'session_title':session.title,
                'attendance_rate':round(att_rate, 2),
                'students_marked':attendances.count(),
            })
        trend_data.sort(key=lambda x: x['date'])

        return Response({
            'subject':{
                'id': subject.id,
                'name':subject.name,
                'code': getattr(subject, 'subject_code', getattr(subject, 'code', subject.name)),                
            },
            'period':{
                'start_date':cutoff_date,
                'end_date':timezone.now().date(),
                'days':days,
            },
            'trend': trend_data,
        })

    # @action(detail=False, methods=['get'])
    # def attendance_correlation(self, request):
        
    #     subject_id = request.query_params.get('subject_id')

    #     if not subject_id:
    #         return Response({
    #             'error': 'subject_id parameter is required'
    #         }, status=status.HTTP_400_BAD_REQUEST)

    #     try:
    #         subject = Subject.objects.get(
    #             id=subject_id, is_active=True
    #         )
    #     except Subject.DoesNotExist:
    #         return Response({
    #             'error': 'Subject Not Found'
    #         }, status=status.HTTP_404_NOT_FOUND)


    #     enrolled_students = Enrollment.objects.filter(
    #         class_obj=subject.class_obj,
    #         is_active=True
    #     ).select_related('student')

    #     all_results = ExamResult.objects.filter(
    #         exam__subject = subject,
    #         is_submitted=True,
    #         marks_obtained__isnull = False
    #     )

    #     sessions = AttendanceSession.objects.filter(
    #         subject=subject
    #     )
    #     total_sessions = sessions.count()

    #     if total_sessions == 0 :
    #         return Response({
    #             'message': 'No attendance sessions found for this subject'
    #         })

    #     correlation_data =[]

    #     for enrollment in enrolled_students:
    #         student = enrollment.student


    #         student_results = all_results.filter(student=student)
    #         if student_results.exists():
    #             total_marks = sum(r.marks_obtained for r in student_results)
    #             possible_marks = sum(r.exam.total_marks for r in student_results)
    #             exam_percentage = (total_marks / possible_marks * 100) if possible_marks > 0 else 0
    #         else:
    #             exam_percentage = 0


    #         attendances = SessionAttendance.objects.filter(
    #             session__subject = subject,
    #             student=student
    #         )

    #         attendance_rate = (attendances.count() / total_sessions * 100) if total_sessions > 0 else 0

    #         correlation_data.append({
    #             'student_name': student.get_full_name(),
    #             'attendance_rate':round(attendance_rate, 2),
    #             'exam_percentage':round(exam_percentage, 2)
    #         })
    #     correlation_data.sort(key=lambda x: x['attendance_rate'], reverse=True)

    #     if len (correlation_data) >= 2:
    #         attendance_rates = [d['attendance_rate'] for d in correlation_data]
    #         exam_percentages = [d['exam_percentage'] for d in correlation_data]

    #         n = len(correlation_data)
    #         sum_attendance = sum(attendance_rates)
    #         sum_exam = sum(exam_percentages)
    #         sum_attendance_exam  =sum(a * e for a, e in zip(attendance_rates, exam_percentages))
    #         sum_attendance_sq = sum(a ** 2 for a in attendance_rates)
    #         sum_exam_sq = sum(e ** 2 for e in exam_percentages)

    #         numerator = (n * sum_attendance_exam) - (sum_attendance * sum_exam)
    #         denominator_part1  =(n * sum_attendance_sq) - (sum_attendance ** 2)
    #         denominator_part2 = (n * sum_exam_sq) - (sum_exam ** 2)
    #         denominator = (denominator_part1 * denominator_part2) ** 0.5

    #         correlation = numerator / denominator if denominator != 0 else 0

    #     else:
    #         correlation = 0
        
    #     return Response({
    #         'subject':{
    #             'id': subject.id,
    #             'name':subject.name
    #         },
    #         'correlation_coefficient': round(correlation, 4),
    #         'interpretation': _interpret_correlation(correlation),
    #         'data_points': len(correlation_data),
    #         'correlation_data': correlation_data
    #     })

class ClassPerformanceViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def _has_class_access(self, request, class_obj):
        """
        Admins, superadmins and commandants can access all classes.
        Instructors can only access a class if they are assigned as its class instructor.
        """
        user = request.user
        if user.role in ['admin', 'superadmin', 'commandant']:
            return True
        if user.role == 'instructor' and class_obj.instructor_id == user.id:
            return True
        return False

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
                'error': 'Class Not found'
            }, status=status.HTTP_404_NOT_FOUND)

        if not self._has_class_access(request, class_obj):
            return Response({
                'error': 'You do not have permission to view this class.'
            }, status=status.HTTP_403_FORBIDDEN)

        enrollments = Enrollment.objects.filter(
            class_obj = class_obj,
            is_active= True
        ).select_related(
            'student'
        )
        total_students = enrollments.count()

        subjects = Subject.objects.filter(
            class_obj=class_obj,
            is_active=True
        ).select_related('instructor')


        all_results = ExamResult.objects.filter(
            exam__subject__class_obj = class_obj,
            is_submitted=True,
            marks_obtained__isnull = False
        ).select_related ('exam', 'exam__subject', 'student')

        if all_results.exists():
            total_marks = sum(r.marks_obtained for r in  all_results)
            total_possible = sum(r.exam.total_marks for r in all_results)
            class_exam_average = (total_marks / total_possible * 100) if total_possible > 0 else 0

            passing_results = sum(1 for r in all_results if r.percentage >= 50)
            exam_pass_rate = (passing_results / all_results.count() * 100) if all_results.count() > 0 else 0
        else:
            class_exam_average = 0
            exam_pass_rate = 0


        attendance_sessions = AttendanceSession.objects.filter(
            class_obj = class_obj
        )
        total_sessions = attendance_sessions.count()

        all_session_attendances = SessionAttendance.objects.filter(
            session__class_obj = class_obj
        ).select_related('student', 'session')

        expected_attendances = total_students * total_sessions
        actual_attendances = all_session_attendances.count()
        class_attendance_rate = (actual_attendances / expected_attendances * 100) if expected_attendances > 0 else 0

        grade_distribution ={
            'A': sum(1 for r in all_results if r.grade =='A'),
            'B': sum(1 for r in all_results if r.grade == 'B'),
            'C': sum(1 for r in all_results if r.grade == 'C'),
            'D': sum(1 for r in all_results if r.grade == 'D'),
            'F': sum(1 for r in all_results if r.grade == 'F'),

        }

        student_rankings = []

        for enrollment in enrollments:
            student = enrollment.student

            student_results = all_results.filter(student=student)
            if student_results.exists():
                student_total = sum(r.marks_obtained for r in student_results)
                student_possible = sum(r.exam.total_marks for r in student_results)
                exam_percentage = (student_total / student_possible * 100) if student_possible > 0 else 0
            else:
                student_total = 0
                student_possible = 0
                exam_percentage = 0

            student_attendances = all_session_attendances.filter(student=student)
            attended_count = student_attendances.count()
            present_count = student_attendances.filter(status='present').count()
            late_count = student_attendances.filter(status='late').count()

            attendance_rate = (attended_count /total_sessions * 100) if total_sessions > 0 else 0

            exam_percentage = float(exam_percentage or 0)
            attendance_rate = float(attendance_rate or 0)
            combined_score = (exam_percentage * 0.7) + (attendance_rate * 0.3)

            subject_scores = []
            for subject in subjects:
                subject_results = student_results.filter(exam__subject=subject) if student_results.exists() else ExamResult.objects.none()
                if subject_results.exists():
                    subj_total = sum(r.marks_obtained for r in subject_results)
                    subj_possible= sum(r.exam.total_marks for r in subject_results)
                    subj_pct = (subj_total / subj_possible * 100) if subj_possible > 0 else 0

                    subject_attendances = student_attendances.filter(session__subject=subject)
                    subject_sessions = attendance_sessions.filter(subject=subject).count()
                    subject_attendance_rate = (subject_attendances.count() / subject_sessions * 100) if subject_sessions > 0 else 0

                    subject_scores.append({
                        'subject_name': subject.name,
                        'subject_code': getattr(subject, 'subject_code', getattr(subject, 'code', subject.name)),
                        'marks_obtained': float(subj_total),
                        'total_possible': float(subj_possible),
                        'exam_percentage': round(subj_pct, 2),
                        'attendance_rate':round(subject_attendance_rate, 2),
                        'combined_score': round((float(subj_pct or 0) * 0.7) + (float(subject_attendance_rate or 0) * 0.3), 2)

                    })

            student_rankings.append({
                'student_id': student.id,
                'student_name': student.get_full_name(),
                'svc_number': getattr(student, 'svc_number', None),
                'total_exams_taken': student_results.count() if student_results.exists() else 0,
                'total_marks_obtained': float(student_total),
                'total_marks_possible': float(student_possible),
                'exam_percentage': round(exam_percentage, 2),
                'total_sessions': total_sessions,
                'sessions_attended': attended_count,
                'attendance_rate':round(attendance_rate, 2),
                'combined_score': round(combined_score, 2),
                'overall_grade': _calculate_grade(exam_percentage),
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
                subj_pass_rate = (subj_passing / subject_results.count() * 100) if subject_results.count()> 0 else 0
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
                'subject_code': getattr(subject, 'subject_code', getattr(subject, 'code', subject.name)),
                'instructor': subject.instructor.get_full_name() if subject.instructor else None,

                'total_exams': Exam.objects.filter(subject=subject, is_active=True).count(),
                'results_count': subject_results.count() if subject_results.exists() else 0,
                'exam_average': round(subj_exam_avg, 2),
                'pass_rate': round(subj_pass_rate, 2),

                'total_sessions': subj_sessions_count,
                'attendance_rate': round(subj_att_rate, 2),

                'combined_performance': round((float(subj_exam_avg or 0) * 0.7) + (float(subj_att_rate or 0) *0.3), 2)

            })

        subject_performance.sort(key=lambda x: x['combined_performance'], reverse=True)

        return Response({   
            'class':{
                'id': class_obj.id,
                'name': class_obj.name,
                'course':class_obj.course.name if hasattr(class_obj, 'course') else None,
                'instructor': class_obj.instructor.get_full_name() if hasattr(class_obj, 'instructor') and class_obj.instructor else None,  
                          },
            'overall_statistics':{
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
                
                'overall_performance': round((float(class_exam_average or 0) * 0.7) + (float(class_attendance_rate or 0)* 0.3), 2)      
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
            class_obj = Class.objects.select_related('instructor').get(id=class_id, is_active=True)
        except Class.DoesNotExist:
            return Response({
                'error': 'Class Not Found'
            }, status=status.HTTP_404_NOT_FOUND)

        if not self._has_class_access(request, class_obj):
            return Response({
                'error': 'You do not have permission to view this class.'
            }, status=status.HTTP_403_FORBIDDEN)

        enrollments = Enrollment.objects.filter(
            class_obj=class_obj,
            is_active=True
        ).select_related('student')

        all_results = ExamResult.objects.filter(
            exam__subject__class_obj = class_obj,
            is_submitted=True,
            marks_obtained__isnull =False
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

        student_data.sort(key=lambda x: x['overall_percentage'], reverse=True)
        top_students = student_data[:limit]

        for idx, student in enumerate(top_students, 1):
            student['rank'] =idx

        return Response({
            'class':{
                'id': class_obj.id,
                'name':class_obj.name,
            },
            'limit':limit,
            'top_performers': top_students,
        })

    @action(detail=False, methods=['get'])
    def compare_classes(self, request):

        if request.user.role not in ['admin', 'superadmin', 'commandant']:
            return Response({
                'error': 'You do not have permission to compare classes.'
            }, status=status.HTTP_403_FORBIDDEN)

        course_id = request.query_params.get('course_id')

        if course_id:
            classes = Class.objects.filter(
                course_id = course_id,
                is_active=True,
            ).select_related('course', 'instructor'
        )
        else:
            classes = Class.objects.filter(is_active=True).select_related('course', 'instructor')

        class_comparison = []

        for class_obj in classes:
            all_results = ExamResult.objects.filter(
                exam__subject__class_obj = class_obj,
                is_submitted=True,
                marks_obtained__isnull= False
            )   .select_related('exam')

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

        try:
            class_obj = Class.objects.select_related('instructor').get(id=class_id, is_active=True)
        except Class.DoesNotExist:
            return Response({'error': 'Class Not found'}, status=status.HTTP_404_NOT_FOUND)

        if not self._has_class_access(request, class_obj):
            return Response({
                'error': 'You do not have permission to view this class.'
            }, status=status.HTTP_403_FORBIDDEN)

        summary_response = self.summary(request)

        if report_format == 'detailed':

            return Response({
                **summary_response.data,
                'report_generated_at': timezone.now(),
                'report_type': 'detailed',
            })
        else:
            return Response({
                'class': summary_response.data['class'],
                'overall_statistics': summary_response.data['overall_statistics'],
                'grade_distribution': summary_response.data['grade_distribution'],
                'top_performers': summary_response.data['top_performers'],
                'subject_performance': summary_response.data['subject_performance'],
                'report_generated_at':timezone.now(),
                'report_type':'summary',
            })

    @action(detail=False, methods=['get'])
    def trend_analysis(self, request):
        class_id = request.query_params.get('class_id')  
        days = int(request.query_params.get('days', 90))

        if not class_id:
            return Response({
                'error': 'class_id parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            class_obj = Class.objects.select_related('course', 'instructor').get(
                id=class_id, is_active=True
            )
        except Class.DoesNotExist:
            return Response({
                'error': 'Class Not Found'
            }, status=status.HTTP_404_NOT_FOUND)

        if not self._has_class_access(request, class_obj):
            return Response({
                'error': 'You do not have permission to view this class.'
            }, status=status.HTTP_403_FORBIDDEN)

        cutoff_date = timezone.now().date() - timedelta(days=days)

        exams = Exam.objects.filter(
            subject__class_obj=class_obj,
            is_active=True,
            exam_date__gte=cutoff_date
        ).select_related('subject').order_by('exam_date')

        total_enrolled = Enrollment.objects.filter(
            class_obj=class_obj,
            is_active=True
        ).count()

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
                    'date': exam.exam_date,
                    'type': 'exam',
                    'exam_id': exam.id,
                    'exam_title': exam.title,
                    'exam_type': exam.exam_type,
                    'subject_name': exam.subject.name,
                    'subject_code': getattr(exam.subject, 'subject_code', exam.subject.name),
                    'average_percentage': round(avg, 2),
                    'students_attempted': results.count(),
                    'participation_rate': round((results.count() / total_enrolled * 100), 2) if total_enrolled > 0 else 0,
                })

        sessions = AttendanceSession.objects.filter(
            class_obj=class_obj,
            scheduled_start__gte=cutoff_date
        ).select_related('subject').order_by('scheduled_start')

        for session in sessions:
            attendances = SessionAttendance.objects.filter(session=session)
            present_count = attendances.filter(status='present').count()
            late_count = attendances.filter(status='late').count()

            att_rate = (attendances.count() / total_enrolled * 100) if total_enrolled > 0 else 0

            trend_data.append({
                'date': session.scheduled_start.date() if hasattr(session.scheduled_start, 'date') else session.scheduled_start,
                'type': 'attendance',
                'session_id': session.id,
                'session_title': session.title,
                'subject_name': session.subject.name if session.subject else 'General',
                'subject_code': getattr(session.subject, 'subject_code', session.subject.name) if session.subject else 'N/A',
                'attendance_rate': round(att_rate, 2),
                'students_marked': attendances.count(),
                'present_count': present_count,
                'late_count': late_count,
            })

        trend_data.sort(key=lambda x: x['date'])

        exam_data = [d for d in trend_data if d['type'] == 'exam']
        attendance_data = [d for d in trend_data if d['type'] == 'attendance']

        avg_exam_percentage = sum(d['average_percentage'] for d in exam_data) / len(exam_data) if len(exam_data) > 0 else 0
        avg_attendance_rate = sum(d['attendance_rate'] for d in attendance_data) / len(attendance_data) if len(attendance_data) > 0 else 0

        return Response({
            'class': {
                'id': class_obj.id,
                'name': class_obj.name,
                'course': class_obj.course.name if hasattr(class_obj, 'course') else None,
            },
            'period': {
                'start_date': cutoff_date,
                'end_date': timezone.now().date(),
                'days': days
            },
            'summary': {
                'total_data_points': len(trend_data),
                'total_exams': len(exam_data),
                'total_sessions': len(attendance_data),
                'average_exam_performance': round(avg_exam_percentage, 2), 
                'average_attendance_rate': round(avg_attendance_rate, 2),
                'total_enrolled_students': total_enrolled,
            },
            'trend': trend_data,
        })

    @action(detail=False, methods=['get'])
    def attendance_correlation(self, request):
        class_id = request.query_params.get('class_id')

        if not class_id:
            return Response({
                'error': 'class_id parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            class_obj = Class.objects.select_related('course', 'instructor').get(
                id=class_id, is_active=True
            )
        except Class.DoesNotExist:
            return Response({
                'error': 'Class Not Found'
            }, status=status.HTTP_404_NOT_FOUND)

        if not self._has_class_access(request, class_obj):
            return Response({
                'error': 'You do not have permission to view this class.'
            }, status=status.HTTP_403_FORBIDDEN)

        enrolled_students = Enrollment.objects.filter(
            class_obj=class_obj,
            is_active=True
        ).select_related('student')

        all_results = ExamResult.objects.filter(
            exam__subject__class_obj=class_obj,
            is_submitted=True,
            marks_obtained__isnull=False
        ).select_related('exam', 'student')

        sessions = AttendanceSession.objects.filter(class_obj=class_obj)
        total_sessions = sessions.count()

        if total_sessions == 0:
            return Response({
                'message': 'No attendance sessions found for this class'
            })

        correlation_data = []

        for enrollment in enrolled_students:
            student = enrollment.student

            student_results = all_results.filter(student=student)
            if student_results.exists():
                total_marks = sum(float(r.marks_obtained) for r in student_results)
                possible_marks = sum(r.exam.total_marks for r in student_results)
                exam_percentage = (total_marks / possible_marks * 100) if possible_marks > 0 else 0
            else:
                exam_percentage = 0

            attendances = SessionAttendance.objects.filter(
                session__class_obj=class_obj,
                student=student
            )
            attendance_rate = (attendances.count() / total_sessions * 100) if total_sessions > 0 else 0

            correlation_data.append({
                'student_id': student.id,
                'student_name': student.get_full_name(),
                'svc_number': getattr(student, 'svc_number', None),
                'attendance_rate': round(attendance_rate, 2),
                'exam_percentage': round(exam_percentage, 2)
            })

        correlation_data.sort(key=lambda x: x['attendance_rate'], reverse=True)

        if len(correlation_data) >= 2:
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
            'class': {
                'id': class_obj.id,
                'name': class_obj.name,
                'course': class_obj.course.name if hasattr(class_obj, 'course') else None
            },
            'correlation_coefficient': round(correlation, 4),
            'interpretation': _interpret_correlation(correlation),
            'data_points': len(correlation_data),
            'total_sessions': total_sessions,
            'correlation_data': correlation_data
        })
        
def _calculate_grade(percentage):

    if percentage >= 80:
        return 'A'
    elif percentage >= 70:
        return 'B'
    elif percentage >= 60:
        return 'C'
    elif percentage >= 50:
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


    return f"There is a {strength} {direction} correlation between attendance and exam performance."

        
