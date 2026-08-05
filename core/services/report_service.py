
from django.db.models import (
    Count, Avg, F, FloatField, ExpressionWrapper, Q
)
from django.db.models.functions import Cast
from django.utils import timezone

from ..models import (
    SchoolMembership, Course, Class, Enrollment,
    ExamResult, CommandantSchoolReport,
)


class CommandantReportService:

    @staticmethod
    def compute_statistics(school, period_start, period_end):

        today = timezone.localdate()

        all_student_memberships = SchoolMembership.all_objects.filter(
            school=school, role='student'
        )
        total_students = all_student_memberships.count()
        active_students = all_student_memberships.filter(status='active').count()

        students_per_course = CommandantReportService._students_per_course(
            school, period_start, period_end
        )

        all_classes = Class.all_objects.filter(school=school)

        running_classes = all_classes.filter(
            start_date__lte=period_end,
            end_date__gte=period_start,
            is_active=True,
            is_closed=False,
        ).count()

        completed_classes = all_classes.filter(
            Q(is_closed=True) | Q(end_date__lt=period_start)
        ).count()

        upcoming_classes = all_classes.filter(
            start_date__gt=period_end
        ).count()

        total_courses = Course.all_objects.filter(school=school).count()

        all_instructor_memberships = SchoolMembership.all_objects.filter(
            school=school, role='instructor'
        )
        total_instructors = all_instructor_memberships.count()
        active_instructors = all_instructor_memberships.filter(status='active').count()

        ratio = CommandantReportService._compute_ratio(
            active_students, active_instructors
        )

        avg_performance = CommandantReportService._compute_avg_performance(
            school, period_start, period_end
        )

        return {
            'students': {
                'total': total_students,
                'active': active_students,
                'per_course': students_per_course,
            },
            'courses': {
                'total': total_courses,
                'running': running_classes,
                'completed': completed_classes,
                'upcoming': upcoming_classes,
            },
            'instructors': {
                'total': total_instructors,
                'active': active_instructors,
                'ratio': ratio,
            },
            'performance': {
                'school_average_percentage': avg_performance,
            },
            'computed_at': timezone.now().isoformat(),
            'period_start': str(period_start),
            'period_end': str(period_end),
        }

    @staticmethod
    def _students_per_course(school, period_start, period_end):

        qs = (
            Enrollment.all_objects
            .filter(
                school=school,
                is_active=True,
                class_obj__start_date__lte=period_end,
                class_obj__end_date__gte=period_start,
            )
            .values(
                course_name=F('class_obj__course__name'),
                course_code=F('class_obj__course__code'),
            )
            .annotate(student_count=Count('id'))
            .order_by('-student_count')
        )
        return list(qs)

    @staticmethod
    def _compute_ratio(active_students, active_instructors):

        if active_instructors == 0:
            return {
                'ratio_text': 'N/A (no active instructors)',
                'students_per_instructor': None,
            }
        if active_students == 0:
            return {
                'ratio_text': '0 students',
                'students_per_instructor': 0,
            }
        per_instructor = round(active_students / active_instructors, 1)
        return {
            'ratio_text': f'1 Instructor : {per_instructor} Students',
            'students_per_instructor': per_instructor,
        }

    @staticmethod
    def _compute_avg_performance(school, period_start, period_end):

        base_qs = ExamResult.all_objects.filter(
            school=school,
            is_submitted=True,
            marks_obtained__isnull=False,
            exam__total_marks__gt=0,
        )

        period_qs = base_qs.filter(
            exam__exam_date__gte=period_start,
            exam__exam_date__lte=period_end,
        )

        result = CommandantReportService._avg_percentage(period_qs)

        if result is None:
            # Fallback: compute across all time for this school
            result = CommandantReportService._avg_percentage(base_qs)

        return round(result, 2) if result is not None else 0.0

    @staticmethod
    def _avg_percentage(qs):

        annotated = qs.annotate(
            pct=ExpressionWrapper(
                Cast(F('marks_obtained'), FloatField())
                * 100.0
                / Cast(F('exam__total_marks'), FloatField()),
                output_field=FloatField(),
            )
        )
        agg = annotated.aggregate(avg_pct=Avg('pct'))
        return agg['avg_pct']
