from django.utils import timezone
from django.db.models import Q, Exists, OuterRef, Subquery
from .models import (
    Subject, Enrollment, Exam, ExamResult, Class, Certificate,
    CertificateTemplate, CertificateDownloadLog, SchoolMembership,
    AttendanceSession, SessionAttendance,
)
from django.conf import settings
import io
import os
import base64
import logging
from decimal import Decimal
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

def get_subject_completion_status(subject, student):
    
    final_exam = Exam.all_objects.filter(
        subject=subject,
        exam_type='final',
        is_active=True
    ).first()

    if not final_exam:
        return {
            'subject_id': subject.id,
            'subject_name': subject.name,
            'is_complete':False,
            'reason': 'no_final_exam',
            'final_exam': None,
            'result': None
        }


    result = ExamResult.all_objects.filter(
        exam=final_exam,
        student=student,
        is_submitted=True,
        marks_obtained__isnull = False,
    ).first()

    return {
        'subject_id': subject.id,
        'subject_name': subject.name,
        'is_complete': result is not None,
        'reason': 'graded' if result else 'not_graded',
        'final_exam_id': final_exam.id,
        'final_exam_title': final_exam.title,
        'result': {
            'marks': float(result.marks_obtained),
            'total': final_exam.total_marks,
            'percentage':result.percentage,
            'grade': result.grade,
            'graded_at':result.graded_at,
        } if result else None

    }

def get_class_completion_status(class_obj, student):

    subjects = Subject.all_objects.filter(
        class_obj= class_obj,
        is_active=True
    )

    if not subjects.exists():
        return {
            'class_id': class_obj.id,
            'class_name': class_obj.name,
            'is_academically_complete': False,
            'is_closed':class_obj.is_closed,
            'reason': 'no_subjects',
            'subjects':[],
            'total_subjects': 0,
            'completed_subjects': 0
        }

    subject_statuses = []
    for subject in subjects:
        status = get_subject_completion_status(subject, student)
        subject_statuses.append(status)

    completed_count = sum(1 for s in subject_statuses if s ['is_complete'])
    total_count = len(subject_statuses)
    all_complete = completed_count == total_count

    return {
        'class_id': class_obj.id,
        'class_name': class_obj.name,
        'is_academically_complete': all_complete,
        'is_closed': class_obj.is_closed,
        'total_subjects': total_count,
        'completed_subjects':completed_count,
        'subjects': subject_statuses,
    }

def check_class_completion_for_all_students(class_obj):

    enrollments = Enrollment.all_objects.filter(
        class_obj=class_obj,
        is_active=True
    ).select_related('student')

    results = []

    for enrollment in enrollments:
        status = get_class_completion_status(class_obj, enrollment.student)
        status['student_id'] = enrollment.student.id
        status['student_name'] = enrollment.student.get_full_name()
        status['svc_number'] = enrollment.student.svc_number
        status['enrollment_id'] = enrollment.id
        results.append(status)


    return results

def calculate_student_grade(class_obj, student) -> Dict[str, Any]:

    results = ExamResult.all_objects.filter(
        student=student,
        exam__subject__class_obj=class_obj,
        is_submitted=True,
        marks_obtained__isnull=False,
    ).select_related('exam')

    if not results.exists():
        return {'grade': '', 'percentage': None}

    total_marks = sum(float(r.marks_obtained) for r in results)
    total_possible = sum(r.exam.total_marks for r in results)

    if total_possible == 0:
        return {'grade': '', 'percentage': None}

    pct = (total_marks / total_possible) * 100

    if pct >= 80:
        grade = 'A'
    elif pct >= 70:
        grade = 'B'
    elif pct >= 60:
        grade = 'C'
    elif pct >= 50:
        grade = 'D'
    else:
        grade = 'F'

    return {
        'grade': grade,
        'percentage': Decimal(str(round(pct, 2))),
    }

def calculate_attendance_percentage(class_obj, student) -> Optional[Decimal]:

    total_sessions = AttendanceSession.all_objects.filter(
        class_obj=class_obj, status='completed',
    ).count()

    if total_sessions == 0:
        return None

    attended = SessionAttendance.all_objects.filter(
        student=student,
        session__class_obj=class_obj,
        status__in=['present', 'late'],
    ).count()

    return Decimal(str(round((attended / total_sessions) * 100, 2)))

def issue_certificate(enrollment, issued_by, *, template: CertificateTemplate = None, generate_pdf: bool = True, ):
    # 1. Guard
    if hasattr(enrollment, 'certificate'):
        return None, 'Certificate already issued for this enrollment.'

    class_obj = enrollment.class_obj

    # 2. Validate academic completion
    status = get_class_completion_status(class_obj, enrollment.student)
    if not status['is_academically_complete']:
        incomplete = [
            s['subject_name'] for s in status['subjects'] if not s['is_complete']
        ]
        return None, f"Student has incomplete subjects: {', '.join(incomplete)}"

    # 3. Resolve template
    if not template:
        template = _resolve_default_template(enrollment.school)

    # 4. Calculate grade + attendance
    grade_data = calculate_student_grade(class_obj, enrollment.student)
    attendance_pct = calculate_attendance_percentage(class_obj, enrollment.student)

    # 5. Create Certificate
    certificate = Certificate.objects.create(
        student=enrollment.student,
        enrollment=enrollment,
        class_obj=class_obj,
        school=enrollment.school,
        template=template,
        issued_by=issued_by,
        completion_date=timezone.now().date(),
        final_grade=grade_data.get('grade', ''),
        final_percentage=grade_data.get('percentage'),
        attendance_percentage=attendance_pct,
    )

    # 6. Mark enrollment complete
    enrollment.completion_date = timezone.now().date()
    enrollment.is_active = False
    enrollment.completed_via = 'certificate'
    enrollment.save(update_fields=[
        'completion_date', 'is_active', 'completed_via',
    ])

    # 7. Membership lifecycle
    _try_complete_membership(enrollment)

    # 8. PDF generation (non-blocking — failure is logged, not raised)
    if generate_pdf:
        try:
            generator = CertificateGenerator(certificate)
            generator.save_to_model()
        except Exception as e:
            logger.error(
                f"PDF generation failed for {certificate.certificate_number}: {e}",
                exc_info=True,
            )

    return certificate, None

def _resolve_default_template(school) -> Optional[CertificateTemplate]:
    if not school:
        return None
    qs = CertificateTemplate.objects.filter(school=school, is_active=True)
    return qs.filter(is_default=True).first() or qs.first()

def close_class(class_obj, closed_by):

    if class_obj.is_closed:
        return False, 'Class is already closed.'

    active_without_cert = Enrollment.all_objects.filter(
        class_obj=class_obj, is_active=True,
    ).exclude(
        certificate__isnull=False,
    ).count()

    if active_without_cert > 0:
        return False, (
            f'{active_without_cert} student(s) still have active enrollments '
            'without certificates. Issue certificates to all eligible students '
            'before closing the class.'
        )

    class_obj.is_closed = True
    class_obj.closed_at = timezone.now()
    class_obj.closed_by = closed_by
    class_obj.save(update_fields=['is_closed', 'closed_at', 'closed_by'])

    return True, None

def bulk_issue_certificates(class_obj, issued_by, *, template=None, generate_pdf=True):

    enrollments = Enrollment.all_objects.filter(
        class_obj=class_obj, is_active=True,
    ).select_related('student')

    issued = []
    skipped = []
    failed = []

    for enrollment in enrollments:
        if hasattr(enrollment, 'certificate'):
            skipped.append({
                'student': enrollment.student.svc_number,
                'reason': 'already_issued',
            })
            continue

        certificate, error = issue_certificate(
            enrollment, issued_by,
            template=template,
            generate_pdf=generate_pdf,
        )

        if certificate:
            issued.append({
                'student': enrollment.student.svc_number,
                'certificate_number': certificate.certificate_number,
            })
        else:
            failed.append({
                'student': enrollment.student.svc_number,
                'reason': error,
            })

    return {
        'issued_count': len(issued),
        'skipped_count': len(skipped),
        'failed_count': len(failed),
        'issued': issued,
        'skipped': skipped,
        'failed': failed,
    }

def _try_complete_membership(enrollment):

    membership = enrollment.membership
    if membership and membership.status == 'active':
        has_active = Enrollment.all_objects.filter(
            membership=membership, is_active=True,
        ).exists()
        if not has_active:
            membership.complete()

    elif not membership and enrollment.school:
        has_other_active = Enrollment.all_objects.filter(
            student=enrollment.student,
            school=enrollment.school,
            is_active=True,
        ).exclude(pk=enrollment.pk).exists()

        if not has_other_active:
            active_membership = SchoolMembership.all_objects.filter(
                user=enrollment.student,
                school=enrollment.school,
                status='active',
            ).first()
            if active_membership:
                active_membership.complete()


CERTIFICATE_HTML_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {{ size: A4 landscape; margin: 0; }}
  body {{ margin: 0; padding: 0; font-family: 'Georgia', 'Times New Roman', serif; }}
  .certificate {{ width: 297mm; height: 210mm; position: relative; background: #fff;
    overflow: hidden; box-sizing: border-box; padding: 15mm 20mm; }}
  .border-outer {{ position: absolute; top: 8mm; left: 8mm; right: 8mm; bottom: 8mm;
    border: 3px solid {primary_color}; }}
  .border-inner {{ position: absolute; top: 11mm; left: 11mm; right: 11mm; bottom: 11mm;
    border: 1px solid {primary_color}; }}
  .content {{ position: relative; z-index: 1; text-align: center; height: 100%;
    display: flex; flex-direction: column; align-items: center; justify-content: center; }}
  .logo {{ max-height: 60px; max-width: 200px; margin-bottom: 10px; }}
  .school-name {{ font-size: 14px; color: {secondary_color}; text-transform: uppercase;
    letter-spacing: 2px; margin-bottom: 5px; }}
  .header {{ font-size: 32px; color: {primary_color}; margin: 10px 0; font-weight: bold; }}
  .certify-text {{ font-size: 14px; color: #555; margin: 8px 0; }}
  .student-name {{ font-size: 28px; color: #222; font-weight: bold; margin: 5px 0;
    border-bottom: 2px solid {accent_color}; display: inline-block; padding-bottom: 3px; }}
  .rank-svc {{ font-size: 12px; color: #777; margin: 5px 0; }}
  .course-name {{ font-size: 20px; color: {primary_color}; font-weight: bold; margin: 5px 0; }}
  .class-name {{ font-size: 13px; color: #666; }}
  .grade-info {{ font-size: 12px; color: #555; margin: 8px 0; }}
  .footer-text {{ font-size: 10px; color: #888; margin-top: 8px; }}
  .signatures {{ display: flex; justify-content: space-around; width: 80%; margin-top: 15px; }}
  .signature-block {{ text-align: center; }}
  .signature-image {{ max-height: 40px; margin-bottom: 3px; }}
  .signature-line {{ width: 150px; border-top: 1px solid #333; margin: 0 auto 3px; }}
  .signature-name {{ font-size: 12px; font-weight: bold; color: #333; }}
  .signature-title {{ font-size: 10px; color: #666; }}
  .cert-number {{ position: absolute; bottom: 15mm; left: 0; right: 0; text-align: center;
    font-size: 8px; color: #aaa; }}
</style>
</head>
<body>
<div class="certificate">
  <div class="border-outer"></div>
  <div class="border-inner"></div>
  <div class="content">
    {logo_section}
    <div class="school-name">{school_name}</div>
    <div class="header">{header_text}</div>
    <div class="certify-text">This is to certify that</div>
    <div class="student-name">{student_name}</div>
    <div class="rank-svc">{rank_svc_display}</div>
    <div class="certify-text">has successfully completed the course</div>
    <div class="course-name">{course_name}</div>
    <div class="class-name">{class_name}</div>
    <div class="grade-info">{grade_display}</div>
    <div class="certify-text">Completed on {completion_date_formatted}</div>
    <div class="footer-text">{footer_text}</div>
    <div class="signatures">
      <div class="signature-block">
        {signature_section}
        <div class="signature-line"></div>
        <div class="signature-name">{signatory_name}</div>
        <div class="signature-title">{signatory_title}</div>
      </div>
      {secondary_signature_block}
    </div>
  </div>
  <div class="cert-number">Certificate No: {certificate_number} |
    Verification: {verification_code} |
    Issued: {issued_at_formatted}</div>
</div>
</body>
</html>"""


class CertificateImageResolver:

    def __init__(self, school=None):
        self.school = school
        self.media_root = Path(settings.MEDIA_ROOT)

    def get_as_base64(self, image_field) -> Optional[str]:
        if not image_field or not image_field.name:
            return None
        try:
            file_path = self._resolve_path(image_field)
            if not file_path or not os.path.exists(file_path):
                logger.warning(f"Image file not found: {image_field.name}")
                return None
            with open(file_path, 'rb') as f:
                data = f.read()
            mime = self._mime_type(file_path)
            return f"data:{mime};base64,{base64.b64encode(data).decode()}"
        except Exception as e:
            logger.error(f"Error converting image to base64: {e}", exc_info=True)
            return None

    def get_school_branding(self) -> Dict[str, Any]:
        if not self.school:
            return {
                'school_name': 'Training Institution',
                'logo_base64': None,
                'has_logo': False,
                'primary_color': '#1976D2',
                'secondary_color': '#424242',
                'accent_color': '#FFC107',
            }
        return {
            'school_name': self.school.name,
            'logo_base64': self.get_as_base64(self.school.logo),
            'has_logo': bool(self.school.logo and self.school.logo.name),
            'primary_color': self.school.primary_color or '#1976D2',
            'secondary_color': self.school.secondary_color or '#424242',
            'accent_color': self.school.accent_color or '#FFC107',
        }

    def _resolve_path(self, field) -> Optional[str]:
        try:
            if hasattr(field, 'path'):
                return field.path
            full = self.media_root / field.name
            return str(full) if full.exists() else None
        except Exception:
            return None

    @staticmethod
    def _mime_type(path: str) -> str:
        ext = Path(path).suffix.lower()
        return {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.png': 'image/png', '.gif': 'image/gif',
            '.webp': 'image/webp', '.svg': 'image/svg+xml',
        }.get(ext, 'image/png')


class CertificateGenerator:

    BACKEND_WEASYPRINT = 'weasyprint'
    BACKEND_XHTML2PDF = 'xhtml2pdf'
    BACKEND_REPORTLAB = 'reportlab'

    def __init__(self, certificate: Certificate, pdf_backend: str = None):
        self.certificate = certificate
        self.school = certificate.school
        self.template = certificate.template
        self.pdf_backend = pdf_backend or self._detect_backend()
        self.image_resolver = CertificateImageResolver(self.school)

    def generate(self, fmt: str = 'pdf') -> Tuple[bytes, str]:
        context = self._build_context()
        html = CERTIFICATE_HTML_TEMPLATE.format(**context)

        if fmt == 'html':
            return html.encode('utf-8'), 'text/html'

        return self._html_to_pdf(html), 'application/pdf'

    def save_to_model(self) -> None:
        pdf_bytes, _ = self.generate(fmt='pdf')
        filename = f"certificate_{self.certificate.certificate_number.replace('/', '_')}.pdf"

        from django.core.files.base import ContentFile
        self.certificate.certificate_file.save(
            filename, ContentFile(pdf_bytes), save=False,
        )
        self.certificate.file_generated_at = timezone.now()
        self.certificate.save(update_fields=['certificate_file', 'file_generated_at'])
        logger.info(f"Saved certificate PDF: {filename}")

    def _build_context(self) -> Dict[str, Any]:
        branding = self.image_resolver.get_school_branding()
        tpl = self._template_data()
        cert = self.certificate

        # Merge template colours over school branding when template overrides
        if self.template and not self.template.use_school_branding:
            colors = self.template.get_effective_colors()
            branding.update(colors)

        # Logo section
        logo_b64 = branding.get('logo_base64')
        logo_section = (
            f'<img src="{logo_b64}" class="logo" alt="Logo">' if logo_b64 else ''
        )

        # Rank / SVC line
        rank_parts = []
        if cert.student_rank:
            rank_parts.append(cert.student_rank)
        if cert.student_svc_number:
            rank_parts.append(f"Service No: {cert.student_svc_number}")
        rank_svc_display = ' | '.join(rank_parts)

        # Grade display
        grade_parts = []
        if cert.final_grade:
            grade_parts.append(f"Grade: {cert.final_grade}")
        if cert.final_percentage is not None:
            grade_parts.append(f"Score: {cert.final_percentage}%")
        if cert.attendance_percentage is not None:
            grade_parts.append(f"Attendance: {cert.attendance_percentage}%")
        grade_display = ' | '.join(grade_parts)

        # Signatures
        sig_section = ''
        if tpl.get('signature_base64'):
            sig_section = (
                f'<img src="{tpl["signature_base64"]}" '
                f'class="signature-image" alt="Signature">'
            )

        secondary_block = ''
        if tpl.get('secondary_signatory_name'):
            sec_img = ''
            if tpl.get('secondary_signature_base64'):
                sec_img = (
                    f'<img src="{tpl["secondary_signature_base64"]}" '
                    f'class="signature-image" alt="Signature">'
                )
            secondary_block = f'''
            <div class="signature-block">
                {sec_img}
                <div class="signature-line"></div>
                <div class="signature-name">{tpl["secondary_signatory_name"]}</div>
                <div class="signature-title">{tpl.get("secondary_signatory_title", "")}</div>
            </div>'''

        completion_date_formatted = ''
        if cert.completion_date:
            completion_date_formatted = cert.completion_date.strftime('%B %d, %Y')

        issued_at_formatted = ''
        if cert.issued_at:
            issued_at_formatted = cert.issued_at.strftime('%B %d, %Y')

        return {
            **branding,
            'header_text': tpl.get('header_text', 'Certificate of Completion'),
            'footer_text': tpl.get('footer_text', ''),
            'signatory_name': tpl.get('signatory_name', 'Director'),
            'signatory_title': tpl.get('signatory_title', 'Director of Training'),
            'logo_section': logo_section,
            'rank_svc_display': rank_svc_display,
            'grade_display': grade_display,
            'signature_section': sig_section,
            'secondary_signature_block': secondary_block,
            'certificate_number': cert.certificate_number,
            'verification_code': cert.verification_code,
            'student_name': cert.student_name,
            'course_name': cert.course_name,
            'class_name': cert.class_name,
            'completion_date_formatted': completion_date_formatted,
            'issued_at_formatted': issued_at_formatted,
        }

    def _template_data(self) -> Dict[str, Any]:
        if not self.template:
            return {
                'header_text': 'Certificate of Completion',
                'footer_text': '',
                'signatory_name': 'Director',
                'signatory_title': 'Director of Training',
                'signature_base64': None,
                'secondary_signatory_name': '',
                'secondary_signatory_title': '',
                'secondary_signature_base64': None,
            }

        sig_b64 = None
        sec_sig_b64 = None
        if self.template.signature_image:
            sig_b64 = self.image_resolver.get_as_base64(self.template.signature_image)
        if self.template.secondary_signature_image:
            sec_sig_b64 = self.image_resolver.get_as_base64(
                self.template.secondary_signature_image
            )

        return {
            'header_text': self.template.header_text,
            'footer_text': self.template.footer_text,
            'signatory_name': self.template.signatory_name,
            'signatory_title': self.template.signatory_title,
            'signature_base64': sig_b64,
            'secondary_signatory_name': self.template.secondary_signatory_name,
            'secondary_signatory_title': self.template.secondary_signatory_title,
            'secondary_signature_base64': sec_sig_b64,
        }

    def _detect_backend(self) -> str:
        for mod, backend in [
            ('weasyprint', self.BACKEND_WEASYPRINT),
            ('xhtml2pdf', self.BACKEND_XHTML2PDF),
            ('reportlab', self.BACKEND_REPORTLAB),
        ]:
            try:
                __import__(mod)
                return backend
            except ImportError:
                continue
        raise ImportError(
            "No PDF backend available. Install one of: weasyprint, xhtml2pdf, reportlab"
        )

    def _html_to_pdf(self, html: str) -> bytes:
        method = {
            self.BACKEND_WEASYPRINT: self._via_weasyprint,
            self.BACKEND_XHTML2PDF: self._via_xhtml2pdf,
            self.BACKEND_REPORTLAB: self._via_reportlab,
        }.get(self.pdf_backend)

        if not method:
            raise ValueError(f"Unknown PDF backend: {self.pdf_backend}")
        return method(html)

    def _via_weasyprint(self, html: str) -> bytes:
        from weasyprint import HTML as WeasyprintHTML
        from weasyprint.text.fonts import FontConfiguration
        font_config = FontConfiguration()
        doc = WeasyprintHTML(string=html, base_url=str(settings.MEDIA_ROOT))
        return doc.write_pdf(font_config=font_config)

    def _via_xhtml2pdf(self, html: str) -> bytes:
        from xhtml2pdf import pisa

        buf = io.BytesIO()

        def link_callback(uri, rel):
            if uri.startswith('data:'):
                return uri
            if os.path.isabs(uri):
                return uri
            media_path = os.path.join(settings.MEDIA_ROOT, uri)
            if os.path.exists(media_path):
                return media_path
            return uri

        status = pisa.CreatePDF(
            html, dest=buf, link_callback=link_callback, encoding='UTF-8',
        )
        if status.err:
            raise RuntimeError(f"xhtml2pdf error: {status.err}")
        return buf.getvalue()

    def _via_reportlab(self, html: str) -> bytes:
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.pdfgen import canvas as rl_canvas
        from reportlab.lib.utils import ImageReader

        buf = io.BytesIO()
        c = rl_canvas.Canvas(buf, pagesize=landscape(A4))
        w, h = landscape(A4)
        ctx = self._build_context()

        # Border
        c.setStrokeColor(ctx.get('primary_color', '#1976D2'))
        c.setLineWidth(3)
        c.rect(20, 20, w - 40, h - 40)
        c.setLineWidth(1)
        c.rect(30, 30, w - 60, h - 60)

        # Logo
        if ctx.get('logo_base64'):
            try:
                raw = base64.b64decode(ctx['logo_base64'].split(',')[1])
                img = ImageReader(io.BytesIO(raw))
                lx = (w - 80) / 2
                c.drawImage(img, lx, h - 120, width=80, height=80,
                            preserveAspectRatio=True, mask='auto')
            except Exception as e:
                logger.warning(f"ReportLab logo error: {e}")

        y = h - 180
        c.setFont("Helvetica-Bold", 28)
        c.drawCentredString(w / 2, y, ctx.get('header_text', 'Certificate of Completion'))
        y -= 60
        c.setFont("Helvetica", 14)
        c.drawCentredString(w / 2, y, "This is to certify that")
        y -= 40
        c.setFont("Helvetica-Bold", 24)
        c.drawCentredString(w / 2, y, ctx.get('student_name', ''))
        y -= 40
        c.setFont("Helvetica", 14)
        c.drawCentredString(w / 2, y, "has successfully completed the course")
        y -= 35
        c.setFont("Helvetica-Bold", 18)
        c.drawCentredString(w / 2, y, ctx.get('course_name', ''))
        y -= 30
        c.setFont("Helvetica", 12)
        c.drawCentredString(w / 2, y, f"Class: {ctx.get('class_name', '')}")
        y -= 40
        if ctx.get('grade_display'):
            c.drawCentredString(w / 2, y, ctx['grade_display'])

        c.setFont("Helvetica", 8)
        c.drawCentredString(
            w / 2, 50,
            f"Certificate No: {ctx.get('certificate_number', '')} | "
            f"Verification: {ctx.get('verification_code', '')}",
        )
        c.save()
        return buf.getvalue()