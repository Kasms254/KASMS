import logging
from celery import shared_task
from django.core.cache import cache

logger = logging.getLogger('biometric.sync')
cert_email_logger = logging.getLogger('certificate.email')


def _record_certificate_email_audit(certificate, action, metadata):

    from core.models import CertificateAuditLog
    try:
        CertificateAuditLog.objects.create(
            school=certificate.school,
            action=action,
            class_obj=certificate.class_obj,
            certificate=certificate,
            student=certificate.student,
            metadata=metadata,
        )
    except Exception:
        cert_email_logger.error(
            'Failed to write certificate email audit log for certificate %s',
            certificate.id, exc_info=True,
        )


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_certificate_email(self, certificate_id):

    from django.conf import settings
    from django.core.mail import EmailMessage
    from django.utils import timezone
    from core.models import Certificate
    from core.services import CertificateGenerator

    try:
        certificate = Certificate.all_objects.select_related(
            'student', 'school', 'class_obj',
        ).get(id=certificate_id)
    except Certificate.DoesNotExist:
        cert_email_logger.error(
            'send_certificate_email: certificate %s not found', certificate_id,
        )
        return {'status': 'error', 'message': 'Certificate not found'}

    student = certificate.student

    if not student.email:
        cert_email_logger.warning(
            'send_certificate_email: no email on file for student %s (certificate %s)',
            student.id, certificate_id,
        )
        _record_certificate_email_audit(
            certificate, 'email_failed', {'reason': 'missing_email'},
        )
        return {'status': 'skipped', 'message': 'Student has no email on file'}


    claimed = Certificate.all_objects.filter(
        id=certificate_id, certificate_emailed_at__isnull=True,
    ).update(certificate_emailed_at=timezone.now())

    if not claimed:
        cert_email_logger.info(
            'send_certificate_email: certificate %s already emailed, skipping',
            certificate_id,
        )
        return {'status': 'skipped', 'message': 'Already emailed'}

    if not certificate.certificate_file:
        try:
            CertificateGenerator(certificate).save_to_model()
            certificate.refresh_from_db()
        except Exception as exc:
            cert_email_logger.error(
                'send_certificate_email: failed to generate PDF for %s: %s',
                certificate_id, exc, exc_info=True,
            )
            # Release the claim so a retry can attempt this again instead
            # of being permanently skipped by the guard above.
            Certificate.all_objects.filter(id=certificate_id).update(
                certificate_emailed_at=None,
            )
            _record_certificate_email_audit(
                certificate, 'email_failed', {'reason': 'pdf_generation_failed'},
            )
            raise self.retry(exc=exc)

    subject = f'Your KASMS Certificate — {certificate.certificate_number}'
    message = (
        f'Hello {certificate.student_name or student.get_full_name()},\n\n'
        f'Congratulations! Your certificate for {certificate.course_name} '
        f'({certificate.class_name}) has been issued.\n\n'
        f'Certificate Number: {certificate.certificate_number}\n'
        f'Issued: {certificate.issued_at.strftime("%d %B %Y") if certificate.issued_at else ""}\n\n'
        'Your certificate is attached to this email as a PDF.\n\n'
        'You can view and download this and any other certificates you have '
        'earned at any time by logging into elimuka - graduated students are '
        'taken directly to the Certificates section of their dashboard.\n\n'
        f'If you have any questions, contact your school administrator.\n\n'
        '– Elimuka System'
    )

    try:
        with certificate.certificate_file.open('rb') as fh:
            pdf_bytes = fh.read()
        filename = f"certificate_{certificate.certificate_number.replace('/', '_')}.pdf"
        email = EmailMessage(
            subject, message, settings.DEFAULT_FROM_EMAIL, [student.email],
        )
        email.attach(filename, pdf_bytes, 'application/pdf')
        email.send(fail_silently=False)
    except Exception as exc:
        cert_email_logger.error(
            'send_certificate_email: failed to send email for certificate %s: %s',
            certificate_id, exc, exc_info=True,
        )
        Certificate.all_objects.filter(id=certificate_id).update(
            certificate_emailed_at=None,
        )
        _record_certificate_email_audit(
            certificate, 'email_failed', {'reason': str(exc)[:200]},
        )
        raise self.retry(exc=exc)

    cert_email_logger.info(
        'send_certificate_email: sent certificate %s to student %s',
        certificate_id, student.id,
    )
    _record_certificate_email_audit(certificate, 'email_sent', {})
    return {'status': 'sent'}


@shared_task(bind=True, max_retries=0)
def sync_all_devices(self):
    from core.models import BiometricDevice
    from core.biometric_scheduler import sync_device_once

    devices = BiometricDevice.all_objects.filter(
        status='active', is_active=True
    )

    results = []
    for device in devices:
        try:
            result = sync_device_once(device)
            if result is not None:
                results.append({'device': device.name, 'result': result})
        except Exception as e:
            logger.error(f'Task error for {device.name}: {e}')

    return results


@shared_task
def sync_single_device(device_id):
    from core.models import BiometricDevice
    from core.biometric_scheduler import sync_device_once

    try:
        device = BiometricDevice.all_objects.get(id=device_id, is_active=True)
    except BiometricDevice.DoesNotExist:
        return {'status': 'error', 'message': 'Device not found'}

    result = sync_device_once(device)
    if result is None:
        return {'status': 'skipped', 'message': 'Sync already in progress'}
    return result


@shared_task
def process_pending_records():
    from core.models import BiometricRecord
    from django.utils import timezone
    from datetime import timedelta

    # all_objects: see sync_all_devices above — no request/school context here.
    pending = BiometricRecord.all_objects.filter(
        processed=False,
        scan_time__gte=timezone.now() - timedelta(hours=24)
    ).select_related('student')

    processed = 0
    for record in pending:
        try:
            attendance = record.process_to_attendance()
            if attendance:
                processed += 1
        except Exception as e:
            logger.error(f'Error processing record {record.id}: {e}')

    return {'processed': processed, 'total_pending': pending.count()}


@shared_task
def sync_device_clocks():
    from core.models import BiometricDevice
    from core.services.zkteco_service import ZKTecoSyncService
    from core.biometric_scheduler import SYNC_LOCK_KEY, SYNC_LOCK_TIMEOUT

    # all_objects: see sync_all_devices above — no request/school context here.
    devices = BiometricDevice.all_objects.filter(
        status='active', is_active=True
    )
    for device in devices:

        lock_key = SYNC_LOCK_KEY.format(device_id=device.id)
        if not cache.add(lock_key, True, timeout=SYNC_LOCK_TIMEOUT):
            logger.debug(f'Skipping clock sync for {device.name}: sync in progress')
            continue

        try:
            service = ZKTecoSyncService(device)
            service.sync_device_time()
        except Exception as e:
            logger.error(f'Clock sync failed for {device.name}: {e}')
        finally:
            cache.delete(lock_key)
