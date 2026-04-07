
import logging
from datetime import datetime
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
import pytz
from core.models import (
    BiometricDevice, BiometricUserMapping, BiometricRecord,
    SessionAttendance, AttendanceSession, User
)

logger = logging.getLogger('biometric.push')


@csrf_exempt
@require_POST
def biometric_push_endpoint(request):

    raw_body = request.body.decode('utf-8', errors='replace')
    logger.info(f'Received push from device: {raw_body[:500]}')

    post_data = {}
    for line in raw_body.split('\n'):
        if '=' in line:
            key, value = line.split('=', 1)
            post_data[key.strip()] = value.strip()

    table = post_data.get('table', '')
    stamp = post_data.get('stamp', '')

    if 'options' in post_data:
        return _handle_device_options(request, post_data)

    if table == 'ATTLOG' or table == 'attlog':
        return _handle_attendance_push(request, post_data, raw_body)

    if table == 'USER' or table == 'user':
        return _handle_users_push(request, post_data, raw_body)

    logger.warning(f'Unknown push data type: table={table}')
    return HttpResponse('OK', content_type='text/plain')


def _handle_device_options(request, post_data):

    options = post_data.get('options', '')
    device_ip = request.META.get('REMOTE_ADDR', '')

    logger.info(f'Device ping received from {device_ip}, options: {options}')

    device = BiometricDevice.objects.filter(
        ip_address=device_ip,
        is_active=True
    ).first()

    if not device:
        logger.warning(
            f'Unknown device pushing from {device_ip}. '
            'Please create the device in the admin panel first.'
        )
        return HttpResponse('OK', content_type='text/plain')

    device.last_sync_at = timezone.now()
    device.last_sync_status = 'push_active'
    device.save(update_fields=['last_sync_at', 'last_sync_status'])

    return HttpResponse('OK', content_type='text/plain')


def _handle_attendance_push(request, post_data, raw_body):

    device_ip = request.META.get('REMOTE_ADDR', '')

    device = BiometricDevice.objects.filter(
        ip_address=device_ip,
        is_active=True
    ).first()

    if not device:
        logger.error(f'Attendance push from unknown device: {device_ip}')
        return HttpResponse('ERROR: Device not registered', content_type='text/plain')


    records_processed = 0
    records_created = 0

    for line in raw_body.split('\n'):
        if not line.strip() or '=' in line:
            continue

        parts = line.strip().split('\t')
        if len(parts) < 4:
            continue

        try:
            user_id = parts[0].strip()
            verify_type = int(parts[1]) if parts[1].isdigit() else 0
            state = int(parts[2]) if parts[2].isdigit() else 0
            timestamp_str = parts[3].strip()

            scan_time = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
            device_tz = pytz.timezone('Africa/Nairobi')
            scan_time = device_tz.localize(scan_time)

            student = _resolve_student(device, user_id)
            if not student:
                logger.warning(f'No student mapping for user_id={user_id} on device {device.name}')
                continue

            # Check for duplicate
            exists = BiometricRecord.objects.filter(
                device_id=str(device.id),
                biometric_id=user_id,
                scan_time=scan_time
            ).exists()

            if exists:
                continue

            # Create biometric record
            record = BiometricRecord.objects.create(
                school=device.school,
                device_id=str(device.id),
                device_type='zkteco',
                device_name=device.name,
                student=student,
                biometric_id=user_id,
                scan_time=scan_time,
                verification_type=_verify_type_to_string(verify_type),
                raw_data={
                    'user_id': user_id,
                    'timestamp': timestamp_str,
                    'verify_type': verify_type,
                    'state': state,
                    'device_ip': device_ip,
                    'source': 'push',
                }
            )

            records_created += 1

            # Try to process to attendance immediately
            try:
                record.process_to_attendance()
            except Exception as e:
                logger.error(f'Error processing attendance for record {record.id}: {e}')

            records_processed += 1

        except Exception as e:
            logger.error(f'Error parsing attendance line: {line}, error: {e}')
            continue

    # Update device sync status
    device.last_sync_at = timezone.now()
    device.last_sync_status = 'push_received'
    device.last_sync_records = records_created
    device.total_synced_records += records_created
    device.save(update_fields=[
        'last_sync_at', 'last_sync_status',
        'last_sync_records', 'total_synced_records'
    ])

    logger.info(
        f'Processed {records_processed} attendance records '
        f'from {device.name} ({device_ip})'
    )

    return HttpResponse('OK', content_type='text/plain')


def _handle_users_push(request, post_data, raw_body):

    device_ip = request.META.get('REMOTE_ADDR', '')
    logger.info(f'User push from {device_ip}: {raw_body[:200]}')

    return HttpResponse('OK', content_type='text/plain')


def _resolve_student(device, device_user_id):

    # First try biometric user mapping
    mapping = BiometricUserMapping.objects.filter(
        device=device,
        device_user_id=device_user_id,
        is_active=True
    ).select_related('student').first()

    if mapping:
        return mapping.student

    # Fallback: match by svc_number
    student = User.objects.filter(
        svc_number=device_user_id,
        role='student',
        is_active=True,
        school_memberships__school=device.school,
        school_memberships__status='active'
    ).first()

    if student:
        BiometricUserMapping.objects.get_or_create(
            device=device,
            device_user_id=device_user_id,
            defaults={
                'school': device.school,
                'student': student,
            }
        )
        return student

    return None


def _verify_type_to_string(verify_type):
    types = {
        0: 'password',
        1: 'fingerprint',
        2: 'card',
        3: 'face',
        4: 'palm',
        5: 'finger_vein',
        15: 'auto',
    }
    return types.get(verify_type, f'unknown_{verify_type}')
