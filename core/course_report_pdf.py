
import base64
import io
import logging
import os
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)


def _image_field_to_data_uri(image_field):

    if not image_field:
        return ''
    try:
        path = os.path.join(settings.MEDIA_ROOT, str(image_field))
        if not os.path.exists(path):
            return ''
        with open(path, 'rb') as f:
            data = base64.b64encode(f.read()).decode()
        ext = os.path.splitext(path)[1].lstrip('.').lower()
        mime = 'image/png' if ext == 'png' else 'image/webp' if ext == 'webp' else 'image/jpeg'
        return f'data:{mime};base64,{data}'
    except Exception:
        logger.warning("Could not embed image %r for PDF", str(image_field), exc_info=True)
        return ''


PAD_PDF_ORDER = [
    'leadership_and_command_skills',
    'instructional_ability',
    'attitude',
    'initiative',
    'co_operation',
    'industry',
    'motivation',
    'power_of_expression',
    'ability_to_grasp_instructions',
]


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

    # Approved reports render from their approval snapshot, so the PDF shows
    # the same figures whenever it is generated.
    from .course_report_academics import report_summary
    academics = report_summary(report)
    academic_rows = academics['rows']
    total_hps = academics['total_hps']
    total_score = academics['total_score']
    mean_score = academics['mean_score'] if academics['mean_score'] is not None else '—'
    overall_grade = academics['overall_grade']
    grade_descriptor = academics['grade_descriptor']
    class_position = academics['class_position']
    class_size = academics['class_size']

    from .models import PAD_SUBJECT_LABELS

    pad_scores = instructor_remark.pad_scores if instructor_remark else {}
    pad_rows = [
        {'subject': PAD_SUBJECT_LABELS[key].upper(), 'score': pad_scores.get(key, '')}
        for key in PAD_PDF_ORDER
    ]

    course_code = class_obj.class_code or class_obj.course.code

    context = {
        'school_name': school.name,
        'photo_data_uri': _image_field_to_data_uri(report.photo),
        'logo_data_uri': _image_field_to_data_uri(school.logo),
        'fonts_base_url': (Path(settings.BASE_DIR) / 'fonts').as_uri(),
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
