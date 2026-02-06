import os
import io
import logging
from typing import Optional, Dict, Any, Tuple
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.template.loader import render_to_string
from django.core.files.base import ContentFile
from django.utils import timezone
from weasyprint import HTML, CSS
from weasyprint.text.fonts import FontConfiguration
from xhtml2pdf import pisa
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import inch, mm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

logger = logging.getLogger(__name__)

class CertificateImageResolver:

    def __init__(self, school=None):
        self.school = school
        self.media_root = Path(settings.MEDIA_ROOT)

    def get_logo_as_base64(self, logo_field) -> Optional[str]:

        if not logo_field or not logo_field.name:
            return None

        try:

            file_path = self._get_absolute_path(logo_field)

            if not file_path or not os.path.exists(file_path):
                logger.warning(f"Logofile not found: {logo_field.name}")
                return None
            
            with open(file_path, 'rb') as f:
                image_data = f.read()
            
            mime_type = self._get_mime_type(file_path)
            
            base64_data = base64.b64encode(image_data).decode('utf-8')
            return f"data:{mime_type};base64,{base64_data}"
            
        except Exception as e:
            logger.error(f"Error converting logo to base64: {e}", exc_info=True)
            return None
    
    def get_logo_absolute_path(self, logo_field) -> Optional[str]:

        if not logo_field or not logo_field.name:
            return None
        
        return self._get_absolute_path(logo_field)
    
    def _get_absolute_path(self, logo_field) -> Optional[str]:

        try:
            if hasattr(logo_field, 'path'):
                return logo_field.path
            
            relative_path = logo_field.name
            full_path = self.media_root / relative_path
            
            if full_path.exists():
                return str(full_path)
            
            parts = Path(relative_path).parts
            if len(parts) > 1:
                alt_path = self.media_root / '/'.join(parts)
                if alt_path.exists():
                    return str(alt_path)
            
            logger.warning(f"Could not resolve path for: {logo_field.name}")
            return None
            
        except Exception as e:
            logger.error(f"Error resolving logo path: {e}", exc_info=True)
            return None
    
    def _get_mime_type(self, file_path: str) -> str:
        ext = Path(file_path).suffix.lower()
        mime_types = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
        }
        return mime_types.get(ext, 'image/png')
    
    def get_school_branding(self) -> Dict[str, Any]:
    
        if not self.school:
            return self._get_default_branding()
        
        return {
            'school_name': self.school.name,
            'school_short_name': self.school.short_name or self.school.name,
            'school_code': self.school.code,
            'school_address': self.school.address,
            'school_city': self.school.city,
            'school_email': self.school.email,
            'school_phone': self.school.phone,
            'logo_base64': self.get_logo_as_base64(self.school.logo),
            'logo_path': self.get_logo_absolute_path(self.school.logo),
            'has_logo': bool(self.school.logo and self.school.logo.name),
            'primary_color': self.school.primary_color or '#1976D2',
            'secondary_color': self.school.secondary_color or '#424242',
            'accent_color': self.school.accent_color or '#FFC107',
        }
    
    def _get_default_branding(self) -> Dict[str, Any]:
        return {
            'school_name': 'Training Institution',
            'school_short_name': 'Institution',
            'school_code': 'GEN',
            'school_address': '',
            'school_city': '',
            'school_email': '',
            'school_phone': '',
            'logo_base64': None,
            'logo_path': None,
            'has_logo': False,
            'primary_color': '#1976D2',
            'secondary_color': '#424242',
            'accent_color': '#FFC107',
        }

class CertificateGenerator:
  
    PDF_BACKEND_WEASYPRINT = 'weasyprint'
    PDF_BACKEND_XHTML2PDF = 'xhtml2pdf'
    PDF_BACKEND_REPORTLAB = 'reportlab'
    
    def __init__(self, certificate, pdf_backend: str = None):
   
        self.certificate = certificate
        self.school = certificate.school
        self.template = certificate.template
        self.pdf_backend = pdf_backend or self._detect_pdf_backend()
        
        self.image_resolver = CertificateImageResolver(self.school)
    
    def _detect_pdf_backend(self) -> str:
        try:
            import weasyprint
            return self.PDF_BACKEND_WEASYPRINT
        except ImportError:
            pass
        
        try:
            import xhtml2pdf
            return self.PDF_BACKEND_XHTML2PDF
        except ImportError:
            pass
        
        try:
            import reportlab
            return self.PDF_BACKEND_REPORTLAB
        except ImportError:
            pass
        
        raise ImportError(
            "No PDF backend available. Install one of: "
            "weasyprint, xhtml2pdf, reportlab"
        )
    
    def generate(self, format: str = 'pdf') -> Tuple[bytes, str]:
 
        context = self._build_context()
        
        html_content = self._render_html(context)
        
        if format == 'html':
            return html_content.encode('utf-8'), 'text/html'
        
        pdf_content = self._convert_to_pdf(html_content)
        return pdf_content, 'application/pdf'
    
    def _build_context(self) -> Dict[str, Any]:
        
        branding = self.image_resolver.get_school_branding()
        
        template_data = self._get_template_data()
        
        certificate_data = {
            'certificate_number': self.certificate.certificate_number,
            'verification_code': self.certificate.verification_code,
            'student_name': self.certificate.student_name,
            'student_svc_number': self.certificate.student_svc_number,
            'student_rank': self.certificate.student_rank,
            'course_name': self.certificate.course_name,
            'class_name': self.certificate.class_name,
            'final_grade': self.certificate.final_grade,
            'final_percentage': self.certificate.final_percentage,
            'attendance_percentage': self.certificate.attendance_percentage,
            'issue_date': self.certificate.issue_date,
            'completion_date': self.certificate.completion_date,
            'issue_date_formatted': self._format_date(self.certificate.issue_date),
            'completion_date_formatted': self._format_date(self.certificate.completion_date),
        }
        
        return {
            **branding,
            **template_data,
            **certificate_data,
            'current_year': datetime.now().year,
        }
    
    def _get_template_data(self) -> Dict[str, Any]:
        if not self.template:
            return self._get_default_template_data()
        
        signature_base64 = None
        secondary_signature_base64 = None
        
        if self.template.signature_image:
            signature_base64 = self.image_resolver.get_logo_as_base64(
                self.template.signature_image
            )
        
        if self.template.secondary_signature_image:
            secondary_signature_base64 = self.image_resolver.get_logo_as_base64(
                self.template.secondary_signature_image
            )
        
        colors = {}
        if not self.template.use_school_branding:
            colors = self.template.get_effective_colors()
        
        return {
            'header_text': self.template.header_text,
            'body_template': self.template.body_template,
            'footer_text': self.template.footer_text,
            'signatory_name': self.template.signatory_name,
            'signatory_title': self.template.signatory_title,
            'signature_base64': signature_base64,
            'secondary_signatory_name': self.template.secondary_signatory_name,
            'secondary_signatory_title': self.template.secondary_signatory_title,
            'secondary_signature_base64': secondary_signature_base64,
            **colors,
        }
    
    def _get_default_template_data(self) -> Dict[str, Any]:
        return {
            'header_text': 'Certificate of Completion',
            'body_template': '',
            'footer_text': '',
            'signatory_name': 'Director',
            'signatory_title': 'Director of Training',
            'signature_base64': None,
            'secondary_signatory_name': '',
            'secondary_signatory_title': '',
            'secondary_signature_base64': None,
        }
    
    def _format_date(self, date) -> str:
        if not date:
            return ''
        if isinstance(date, str):
            return date
        return date.strftime('%B %d, %Y')
    
    def _render_html(self, context: Dict[str, Any]) -> str:
        """Render the certificate HTML template."""
        template_names = [
            f'certificates/{self.school.code.lower()}_certificate.html' if self.school else None,
            'certificates/certificate.html',
            'certificates/default_certificate.html',
        ]
        
        template_name = None
        for name in template_names:
            if name:
                try:
                    return render_to_string(name, context)
                except Exception:
                    continue
        
        # Fall back to inline template
        return self._get_inline_template().format(**context)
    
    def _get_inline_template(self) -> str:
        return CERTIFICATE_HTML_TEMPLATE
    
    def _convert_to_pdf(self, html_content: str) -> bytes:
        if self.pdf_backend == self.PDF_BACKEND_WEASYPRINT:
            return self._convert_weasyprint(html_content)
        elif self.pdf_backend == self.PDF_BACKEND_XHTML2PDF:
            return self._convert_xhtml2pdf(html_content)
        elif self.pdf_backend == self.PDF_BACKEND_REPORTLAB:
            return self._convert_reportlab(html_content)
        else:
            raise ValueError(f"Unknown PDF backend: {self.pdf_backend}")
    
    def _convert_weasyprint(self, html_content: str) -> bytes:
        try:
           
            
            font_config = FontConfiguration()
            
            # WeasyPrint handles base64 images natively
            html = HTML(string=html_content, base_url=str(settings.MEDIA_ROOT))
            
            # Generate PDF
            pdf_bytes = html.write_pdf(font_config=font_config)
            
            return pdf_bytes
            
        except Exception as e:
            logger.error(f"WeasyPrint conversion error: {e}", exc_info=True)
            raise
    
    def _convert_xhtml2pdf(self, html_content: str) -> bytes:
        try:
            
            
            result = io.BytesIO()
            
            def link_callback(uri, rel):
 
                if uri.startswith('data:'):
                    return uri
                
                if os.path.isabs(uri):
                    return uri
                
                if uri.startswith(settings.MEDIA_URL):
                    path = uri.replace(settings.MEDIA_URL, '')
                    return os.path.join(settings.MEDIA_ROOT, path)
                
                if uri.startswith(settings.STATIC_URL):
                    path = uri.replace(settings.STATIC_URL, '')
                    return os.path.join(settings.STATIC_ROOT, path)
                
                media_path = os.path.join(settings.MEDIA_ROOT, uri)
                if os.path.exists(media_path):
                    return media_path
                
                return uri
            
            pisa_status = pisa.CreatePDF(
                html_content,
                dest=result,
                link_callback=link_callback,
                encoding='UTF-8'
            )
            
            if pisa_status.err:
                raise Exception(f"xhtml2pdf error: {pisa_status.err}")
            
            return result.getvalue()
            
        except Exception as e:
            logger.error(f"xhtml2pdf conversion error: {e}", exc_info=True)
            raise
    
    def _convert_reportlab(self, html_content: str) -> bytes:

        try:

            
            buffer = io.BytesIO()
            
            c = canvas.Canvas(buffer, pagesize=landscape(A4))
            width, height = landscape(A4)
            
            context = self._build_context()
            
            c.setStrokeColor(context.get('primary_color', '#1976D2'))
            c.setLineWidth(3)
            c.rect(20, 20, width - 40, height - 40)
            
            c.setLineWidth(1)
            c.rect(30, 30, width - 60, height - 60)
            
            if context.get('logo_base64'):
                try:
                    logo_data = context['logo_base64'].split(',')[1]
                    logo_bytes = base64.b64decode(logo_data)
                    logo_image = ImageReader(io.BytesIO(logo_bytes))
                    
                    logo_width = 80
                    logo_height = 80
                    logo_x = (width - logo_width) / 2
                    logo_y = height - 120
                    
                    c.drawImage(logo_image, logo_x, logo_y, 
                               width=logo_width, height=logo_height,
                               preserveAspectRatio=True, mask='auto')
                except Exception as e:
                    logger.warning(f"Could not draw logo in ReportLab: {e}")
            
            y_position = height - 180
            
            c.setFont("Helvetica-Bold", 28)
            c.drawCentredString(width / 2, y_position, 
                               context.get('header_text', 'Certificate of Completion'))
            
            y_position -= 60
            
            c.setFont("Helvetica", 14)
            c.drawCentredString(width / 2, y_position, "This is to certify that")
            
            y_position -= 40
            
            c.setFont("Helvetica-Bold", 24)
            c.drawCentredString(width / 2, y_position, context.get('student_name', ''))
            
            y_position -= 40
            
            c.setFont("Helvetica", 14)
            c.drawCentredString(width / 2, y_position, 
                               f"has successfully completed the course")
            
            y_position -= 35
            
            c.setFont("Helvetica-Bold", 18)
            c.drawCentredString(width / 2, y_position, context.get('course_name', ''))
            
            y_position -= 30
            
            c.setFont("Helvetica", 12)
            c.drawCentredString(width / 2, y_position, 
                               f"Class: {context.get('class_name', '')}")
            
            y_position -= 40
            if context.get('final_grade'):
                c.drawCentredString(width / 2, y_position,
                                   f"Grade: {context.get('final_grade')} | "
                                   f"Completed: {context.get('completion_date_formatted', '')}")
            
            c.setFont("Helvetica", 8)
            c.drawCentredString(width / 2, 50,
                               f"Certificate No: {context.get('certificate_number', '')} | "
                               f"Verification: {context.get('verification_code', '')}")
            
            c.save()
            
            return buffer.getvalue()
            
        except Exception as e:
            logger.error(f"ReportLab conversion error: {e}", exc_info=True)
            raise
    
    def save_to_model(self) -> None:
        try:
            pdf_content, _ = self.generate(format='pdf')
            
            filename = f"certificate_{self.certificate.certificate_number}.pdf"
            
            self.certificate.certificate_file.save(
                filename,
                ContentFile(pdf_content),
                save=False
            )
            self.certificate.file_generated_at = timezone.now()
            self.certificate.save(update_fields=['certificate_file', 'file_generated_at'])
            
            logger.info(f"Saved certificate file: {filename}")
            
        except Exception as e:
            logger.error(f"Error saving certificate file: {e}", exc_info=True)
            raise


def generate_certificate_context(certificate) -> Dict[str, Any]:

    generator = CertificateGenerator(certificate)
    context = generator._build_context()
    
    context['logo_section'] = _format_logo_section(context)
    context['rank_svc_display'] = _format_rank_svc(context)
    context['grade_display'] = _format_grade(context)
    context['signature_section'] = _format_signature(context)
    context['secondary_signature_block'] = _format_secondary_signature(context)
    
    return context

def _format_logo_section(context: Dict) -> str:
    if context.get('logo_base64'):
        return f'<img src="{context["logo_base64"]}" class="logo" alt="School Logo">'
    return ''


def _format_rank_svc(context: Dict) -> str:
    parts = []
    if context.get('student_rank'):
        parts.append(context['student_rank'])
    if context.get('student_svc_number'):
        parts.append(f"Service No: {context['student_svc_number']}")
    return ' | '.join(parts) if parts else ''


def _format_grade(context: Dict) -> str:
    parts = []
    if context.get('final_grade'):
        parts.append(f"Grade: {context['final_grade']}")
    if context.get('final_percentage'):
        parts.append(f"Score: {context['final_percentage']}%")
    if context.get('attendance_percentage'):
        parts.append(f"Attendance: {context['attendance_percentage']}%")
    return ' | '.join(parts) if parts else ''


def _format_signature(context: Dict) -> str:
    if context.get('signature_base64'):
        return f'<img src="{context["signature_base64"]}" class="signature-image" alt="Signature">'
    return ''


def _format_secondary_signature(context: Dict) -> str:
    if context.get('secondary_signatory_name'):
        sig_img = ''
        if context.get('secondary_signature_base64'):
            sig_img = f'<img src="{context["secondary_signature_base64"]}" class="signature-image" alt="Signature">'
        
        return f'''
        <div class="signature-block">
            {sig_img}
            <div class="signature-line"></div>
            <div class="signature-name">{context["secondary_signatory_name"]}</div>
            <div class="signature-title">{context.get("secondary_signatory_title", "")}</div>
        </div>
        '''
    return ''