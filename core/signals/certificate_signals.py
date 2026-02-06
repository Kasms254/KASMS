from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.conf import settings
import logging
from core.models import Certificate, CertificateTemplate, ExamResult, SessionAttendance, AttendanceSession
from core.services.certificate_service import CertificateGenerator
from decimal import Decimal


logger = logging.getLogger(__name__)

AUTO_ISSUE_CERTIFICATES = getattr(settings, 'AUTO_ISSUE_CERTIFICATES', True)
GENERATE_PDF_ON_ISSUE = getattr(settings, 'GENERATE_PDF_ON_ISSUE', True)


@receiver(pre_save)
def track_enrollment_completion(sender, instance, **kwargs):

    if sender.__name__ != 'Enrollment':
        return
    
    if not instance.pk:
        instance._was_completed = False
        return
    
    try:
        old_instance = sender.objects.get(pk=instance.pk)
        instance._was_completed = old_instance.completion_date is not None
    except sender.DoesNotExist:
        instance._was_completed = False


@receiver(post_save)
def auto_issue_certificate_on_completion(sender, instance, created, **kwargs):

    if sender.__name__ != 'Enrollment':
        return
    
    if not AUTO_ISSUE_CERTIFICATES:
        return
    
    is_newly_completed = (
        instance.completion_date is not None and 
        not getattr(instance, '_was_completed', False)
    )
    
    if not is_newly_completed:
        return
    
    logger.info(f"Enrollment completed: {instance.id} - Student: {instance.student.get_full_name()}")
    
    if Certificate.all_objects.filter(enrollment=instance).exists():
        logger.info(f"Certificate already exists for enrollment {instance.id}")
        return
    
    try:
        template = CertificateTemplate.objects.filter(
            school=instance.school,
            is_active=True,
            is_default=True
        ).first()
        
        if not template:
            template = CertificateTemplate.objects.filter(
                school=instance.school,
                is_active=True
            ).first()
        
        results = ExamResult.all_objects.filter(
            student=instance.student,
            exam__subject__class_obj=instance.class_obj,
            is_submitted=True,
            marks_obtained__isnull=False
        ).select_related('exam')
        
        final_grade = ''
        final_percentage = None
        
        if results.exists():
            total_marks = sum(float(r.marks_obtained) for r in results)
            total_possible = sum(r.exam.total_marks for r in results)
            
            if total_possible > 0:
                percentage = (total_marks / total_possible) * 100
                final_percentage = Decimal(str(round(percentage, 2)))
                
                if percentage >= 80:
                    final_grade = 'A'
                elif percentage >= 70:
                    final_grade = 'B'
                elif percentage >= 60:
                    final_grade = 'C'
                elif percentage >= 50:
                    final_grade = 'D'
                else:
                    final_grade = 'F'
        
        total_sessions = AttendanceSession.all_objects.filter(
            class_obj=instance.class_obj,
            status='completed'
        ).count()
        
        attendance_percentage = None
        if total_sessions > 0:
            attended = SessionAttendance.all_objects.filter(
                student=instance.student,
                session__class_obj=instance.class_obj,
                status__in=['present', 'late']
            ).count()
            
            attendance_percentage = Decimal(str(round((attended / total_sessions) * 100, 2)))
        
        certificate = Certificate.objects.create(
            school=instance.school,
            student=instance.student,
            enrollment=instance,
            template=template,
            completion_date=instance.completion_date,
            final_grade=final_grade,
            final_percentage=final_percentage,
            attendance_percentage=attendance_percentage,
            status='issued',
            metadata={
                'auto_issued': True,
                'issued_on_completion': True
            }
        )
        
        logger.info(f"Certificate created: {certificate.certificate_number}")
        
        if GENERATE_PDF_ON_ISSUE:
            try:
                generator = CertificateGenerator(certificate)
                generator.save_to_model()
                logger.info(f"Certificate PDF generated: {certificate.certificate_number}")
            except Exception as e:
                logger.error(f"Error generating certificate PDF: {e}", exc_info=True)
               
        try:
            from core.models import PersonalNotification
            
            PersonalNotification.objects.create(
                school=instance.school,
                user=instance.student,
                notification_type='general',
                priority='medium',
                title=f'Certificate Issued: {instance.class_obj.course.name}',
                content=(
                    f"Congratulations! Your certificate for completing "
                    f"{instance.class_obj.course.name} ({instance.class_obj.name}) "
                    f"has been issued.\n\n"
                    f"Certificate Number: {certificate.certificate_number}\n"
                    f"You can download your certificate from the Student Portal."
                ),
                is_active=True
            )
        except Exception as e:
            logger.warning(f"Could not create notification: {e}")
        
    except Exception as e:
        logger.error(f"Error auto-issuing certificate for enrollment {instance.id}: {e}", exc_info=True)

def manually_issue_certificate(enrollment, issued_by=None, template=None, **kwargs):

    if not enrollment.completion_date:
        raise ValueError("Cannot issue certificate for incomplete enrollment")
    
    if Certificate.all_objects.filter(enrollment=enrollment).exists():
        raise ValueError("Certificate already exists for this enrollment")
    
    if not template:
        template = CertificateTemplate.objects.filter(
            school=enrollment.school,
            is_active=True,
            is_default=True
        ).first()
    
    if 'final_grade' not in kwargs or 'final_percentage' not in kwargs:
        results = ExamResult.all_objects.filter(
            student=enrollment.student,
            exam__subject__class_obj=enrollment.class_obj,
            is_submitted=True,
            marks_obtained__isnull=False
        )
        
        if results.exists():
            total_marks = sum(float(r.marks_obtained) for r in results)
            total_possible = sum(r.exam.total_marks for r in results)
            
            if total_possible > 0:
                percentage = (total_marks / total_possible) * 100
                
                if 'final_percentage' not in kwargs:
                    kwargs['final_percentage'] = Decimal(str(round(percentage, 2)))
                
                if 'final_grade' not in kwargs:
                    if percentage >= 80:
                        kwargs['final_grade'] = 'A'
                    elif percentage >= 70:
                        kwargs['final_grade'] = 'B'
                    elif percentage >= 60:
                        kwargs['final_grade'] = 'C'
                    elif percentage >= 50:
                        kwargs['final_grade'] = 'D'
                    else:
                        kwargs['final_grade'] = 'F'
    
    if 'attendance_percentage' not in kwargs:
        total_sessions = AttendanceSession.all_objects.filter(
            class_obj=enrollment.class_obj,
            status='completed'
        ).count()
        
        if total_sessions > 0:
            attended = SessionAttendance.all_objects.filter(
                student=enrollment.student,
                session__class_obj=enrollment.class_obj,
                status__in=['present', 'late']
            ).count()
            
            kwargs['attendance_percentage'] = Decimal(str(round((attended / total_sessions) * 100, 2)))
    
    certificate = Certificate.objects.create(
        school=enrollment.school,
        student=enrollment.student,
        enrollment=enrollment,
        template=template,
        completion_date=enrollment.completion_date,
        issued_by=issued_by,
        status='issued',
        **kwargs
    )
    
    try:
        generator = CertificateGenerator(certificate)
        generator.save_to_model()
    except Exception as e:
        logger.error(f"Error generating certificate PDF: {e}", exc_info=True)
    
    return certificate