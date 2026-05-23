
import io
import logging
import os
from decimal import Decimal

from django.core.files.base import ContentFile
from django.db.models import Sum
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)

# PAD subjects in the required order
PAD_SUBJECTS = [
    "LEADERSHIP AND COMMAND SKILLS",
    "INSTRUCTIONAL ABILITY",
    "ATTITUDE",
    "INITIATIVE",
    "CO-OPERATION",
    "INDUSTRY",
    "MOTIVATION",
    "POWER OF EXPRESSION",
    "ABILITY TO GRASP INSTRUCTIONS",
]


def _pdf_grade(score, hps):
    if hps == 0:
        return 'N/A'
    pct = (score / hps) * 100
    if pct >= 91: return 'A'
    if pct >= 86: return 'A-'
    if pct >= 81: return 'B+'
    if pct >= 76: return 'B'
    if pct >= 71: return 'B'   
    if pct >= 65: return 'C+'
    if pct >= 60: return 'C'
    if pct >= 50: return 'C'   
    return 'F'


def _grade_descriptor(grade):
    if grade in ('A', 'A-'):
        return 'Outstanding'
    if grade in ('B+', 'B'):
        return 'Above Average'
    if grade in ('C+', 'C'):
        return 'Average'
    return 'Fail'


def _build_academic_rows(student, class_obj):

    from .models import Subject, ExamResult

    subjects = (
        Subject.objects.filter(class_obj=class_obj, is_active=True)
        .prefetch_related('exams')
        .order_by('name')
    )

    rows = []
    for subject in subjects:
        exams = list(
            subject.exams.filter(is_active=True).order_by('-exam_type', '-total_marks')
        )
        if not exams:
            continue

        best_result = None
        best_exam = None
        for exam in exams:
            try:
                result = ExamResult.objects.get(
                    exam=exam, student=student, is_submitted=True
                )
                best_result = result
                best_exam = exam
                break
            except ExamResult.DoesNotExist:
                continue

        if best_result is None or best_exam is None:
            rows.append({
                'subject_name': subject.name.upper(),
                'hps': 100,
                'score': '—',
                'grade': '—',
                'remarks': '—',
            })
            continue

        hps = int(best_exam.total_marks)
        score = float(best_result.marks_obtained or 0)
        grade = _pdf_grade(score, hps)
        rows.append({
            'subject_name': subject.name.upper(),
            'hps': hps,
            'score': int(score) if score == int(score) else round(score, 2),
            'grade': grade,
            'remarks': _grade_descriptor(grade),
        })

    return rows


def _compute_totals(academic_rows):
    total_hps = sum(r['hps'] for r in academic_rows if isinstance(r['hps'], int))
    total_score = sum(
        r['score'] for r in academic_rows if isinstance(r['score'], (int, float))
    )
    mean_score = round(total_score / len(academic_rows), 1) if academic_rows else 0
    overall_grade = _pdf_grade(total_score, total_hps) if total_hps else '—'
    grade_descriptor = _grade_descriptor(overall_grade)
    return total_hps, round(total_score, 2), mean_score, overall_grade, grade_descriptor


def _compute_class_position(student, class_obj):

    from django.db.models import Sum
    from .models import ExamResult, Enrollment

    student_ids = (
        Enrollment.objects.filter(class_obj=class_obj, is_active=True)
        .values_list('student_id', flat=True)
    )

    totals = (
        ExamResult.objects.filter(
            student_id__in=student_ids,
            exam__subject__class_obj=class_obj,
            is_submitted=True,
        )
        .values('student_id')
        .annotate(total=Sum('marks_obtained'))
        .order_by('-total')
    )

    for rank, entry in enumerate(totals, start=1):
        if entry['student_id'] == student.id:
            return str(rank)
    return '—'


def generate_course_report_pdf(report):

    import weasyprint

    student = report.enrollment.student
    class_obj = report.class_obj
    school = report.school

    def _get_remark(stage):
        return report.stage_remarks.filter(stage=stage).first()

    instructor_remark = _get_remark('instructor')
    oic_remark = _get_remark('oic')
    ci_remark = _get_remark('chief_instructor')
    commandant_remark = _get_remark('commandant')

    academic_rows = _build_academic_rows(student, class_obj)
    total_hps, total_score, mean_score, overall_grade, grade_descriptor = _compute_totals(academic_rows)
    class_position = _compute_class_position(student, class_obj)
    class_size = class_obj.enrollments.filter(is_active=True).count()

    pad_rows = [{'subject': s, 'score': ''} for s in PAD_SUBJECTS]

    course_code = class_obj.class_code or class_obj.course.code

    context = {
        'school_name': school.name,
        'svc_number': student.svc_number or '',
        'rank': student.get_rank_display() if student.rank else '',
        'full_name': student.get_full_name().upper(),
        'corp': student.unit or '',          
        'unit': school.short_name or school.code,  
        'course_title': class_obj.course.name.upper(),
        'course_code': course_code,
        'start_date': class_obj.start_date.strftime('%d %b %y').upper(),
        'end_date': class_obj.end_date.strftime('%d %b %y').upper(),
        'class_size': class_size,
        'class_position': class_position,
        'overall_grade': overall_grade,
        'character_and_personality': (
            instructor_remark.character_and_personality if instructor_remark else ''
        ),
        'knowledge_and_ability': (
            instructor_remark.knowledge_and_ability if instructor_remark else ''
        ),
        'command_and_leadership': (
            instructor_remark.command_and_leadership if instructor_remark else ''
        ),
        'strengths': instructor_remark.strengths if instructor_remark else '',
        'weaknesses': instructor_remark.weaknesses if instructor_remark else '',
        'deployment_recommendation': (
            instructor_remark.deployment_recommendation if instructor_remark else ''
        ),
        # Senior remarks
        'oic_content': oic_remark.content if oic_remark else '',
        'ci_content': ci_remark.content if ci_remark else '',
        'commandant_content': commandant_remark.content if commandant_remark else '',
        # Academics
        'academic_rows': academic_rows,
        'total_hps': total_hps,
        'total_score': total_score,
        'mean_score': mean_score,
        'grade_descriptor': grade_descriptor,
        # PAD
        'pad_rows': pad_rows,
    }

    html_string = render_to_string('course_reports/course_report.html', context)
    pdf_bytes = weasyprint.HTML(string=html_string).write_pdf()

    filename = (
        f"course_report_{student.svc_number or student.username}_"
        f"{class_obj.class_code or class_obj.id}.pdf"
    )

    report.report_file.save(filename, ContentFile(pdf_bytes), save=True)
    logger.info("Generated PDF for report %s → %s", report.pk, filename)
    return filename
