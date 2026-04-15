
import logging
from datetime import datetime
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
import pytz
from core.models import (
    BiometricDevice, BiometricUserMapping, BiometricRecord,
    SessionAttendance, AttendanceSession, User
)

logger = logging.getLogger('biometric.push')

NAIROBI_TZ = pytz.timezone('Africa/Nairobi')


@csrf_exempt
def biometric_push_endpoint(request):

    if request.method == 'GET':
        return _handle_device_get(request)
    if request.method == 'POST':
        return _handle_device_post(request)
    return HttpResponse('Method Not Allowed', status=405, content_type='text/plain')

def _lookup_device(request):

    device_ip = request.META.get('REMOTE_ADDR', '')
    sn = request.GET.get('SN', '').strip()

    if sn:
        device = BiometricDevice.objects.filter(serial_number=sn, is_active=True).first()
        if device:
            return device

    device = BiometricDevice.objects.filter(ip_address=device_ip, is_active=True).first()

    if device and sn and not device.serial_number:
        device.serial_number = sn
        device.save(update_fields=['serial_number'])

    return device

def _handle_device_get(request):

    device_ip = request.META.get('REMOTE_ADDR', '')
    sn = request.GET.get('SN', '').strip()

    logger.info(f'ADMS GET heartbeat from {device_ip}, SN={sn}')

    device = _lookup_device(request)

    if not device:
        logger.warning(
            f'Unregistered device GET from {device_ip} SN={sn}. '
            'Create the device in KASMS admin first.'
        )
    else:
        device.last_sync_at = timezone.now()
        device.last_sync_status = 'push_active'
        device.save(update_fields=['last_sync_at', 'last_sync_status'])
        logger.debug(f'ADMS heartbeat acknowledged for device: {device.name}')

    return HttpResponse(_build_adms_options(sn), content_type='text/plain')


def _build_adms_options(sn):
    lines = [
        f'GET OPTION FROM:{sn}',
        'ATTLOGStamp=None',
        'OPERLOGStamp=9999',
        'ErrorDelay=30',
        'Delay=10',
        'TransTimes=00:00;14:05',
        'TransInterval=1',
        'TransFlag=TransData AttLog ',
        'TimeZone=8',
        'Realtime=1',
        'Encrypt=None',
        'ServerVer=2.4.1',
        'TableNameStamp=None',
    ]
    return '\n'.join(lines) + '\n'

def _handle_device_post(request):
    raw_body = request.body.decode('utf-8', errors='replace')
    logger.info(f'ADMS POST from {request.META.get("REMOTE_ADDR", "")}: {raw_body[:500]}')

    post_data = _parse_adms_body(raw_body, request)
    table = post_data.get('table', '').upper()

    if 'options' in post_data:
        return _handle_device_options(request, post_data)

    if table == 'ATTLOG':
        return _handle_attendance_push(request, post_data, raw_body)

    if table == 'USER':
        return _handle_users_push(request, post_data, raw_body)

    if table == 'OPERLOG':
        return HttpResponse('OK', content_type='text/plain')

    logger.warning(f'Unknown ADMS table received: table={table}')
    return HttpResponse('OK', content_type='text/plain')


def _parse_adms_body(raw_body, request):

    post_data = {}

    if request.POST:
        post_data.update(request.POST.dict())

    for line in raw_body.replace('\r\n', '\n').split('\n'):
        line = line.strip()
        if not line:
            continue
        if '=' in line and '\t' not in line:
            key, _, value = line.partition('=')
            post_data.setdefault(key.strip(), value.strip())

    return post_data

def _handle_device_options(request, post_data):
    device_ip = request.META.get('REMOTE_ADDR', '')
    logger.info(f'Device options POST from {device_ip}: {post_data.get("options", "")}')

    device = _lookup_device(request)
    if device:
        device.last_sync_at = timezone.now()
        device.last_sync_status = 'push_active'
        device.save(update_fields=['last_sync_at', 'last_sync_status'])

    return HttpResponse('OK', content_type='text/plain')


def _handle_attendance_push(request, post_data, raw_body):

    device_ip = request.META.get('REMOTE_ADDR', '')

    device = _lookup_device(request)
    if not device:
        logger.error(f'Attendance push from unregistered device IP={device_ip}')
        return HttpResponse('ERROR: Device not registered', content_type='text/plain')

    records_created = 0

    for line in raw_body.replace('\r\n', '\n').split('\n'):
        line = line.strip()
        if not line or ('=' in line and '\t' not in line):
            continue

        parts = line.split('\t')
        if len(parts) < 4:
            continue

        try:
            user_id = parts[0].strip()
            verify_type = int(parts[1]) if parts[1].strip().isdigit() else 0
            state = int(parts[2]) if parts[2].strip().isdigit() else 0
            timestamp_str = parts[3].strip()

            scan_time = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
            scan_time = NAIROBI_TZ.localize(scan_time)

            student = _resolve_student(device, user_id)
            if not student:
                logger.warning(
                    f'No student mapping for user_id={user_id} on device={device.name}'
                )
                continue

            if BiometricRecord.objects.filter(
                device_id=str(device.id),
                biometric_id=user_id,
                scan_time=scan_time,
            ).exists():
                continue

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
                    'source': 'adms_push',
                },
            )
            records_created += 1

            try:
                record.process_to_attendance()
            except Exception as exc:
                logger.error(f'process_to_attendance failed for record {record.id}: {exc}')

        except Exception as exc:
            logger.error(f'Error parsing ATTLOG line "{line}": {exc}')
            continue

    device.last_sync_at = timezone.now()
    device.last_sync_status = 'push_received'
    device.last_sync_records = records_created
    device.total_synced_records += records_created
    device.save(update_fields=[
        'last_sync_at', 'last_sync_status',
        'last_sync_records', 'total_synced_records',
    ])

    logger.info(
        f'ATTLOG: created {records_created} records from device={device.name} ({device_ip})'
    )
    return HttpResponse('OK', content_type='text/plain')


def _handle_users_push(request, post_data, raw_body):

    device_ip = request.META.get('REMOTE_ADDR', '')

    device = _lookup_device(request)
    if not device:
        logger.warning(f'User push from unregistered device IP={device_ip}')
        return HttpResponse('OK', content_type='text/plain')

    mappings_created = 0
    mappings_updated = 0

    for line in raw_body.replace('\r\n', '\n').split('\n'):
        line = line.strip()
        if not line or ('=' in line and '\t' not in line):
            continue

        parts = line.split('\t')
        # Minimum: uid, pin, name
        if len(parts) < 3:
            continue

        try:
            device_user_id = parts[1].strip()   # pin = user ID on device
            device_user_name = parts[2].strip()  # name as stored on device

            if not device_user_id:
                continue

            student = _resolve_student(device, device_user_id)

            mapping, created = BiometricUserMapping.objects.get_or_create(
                device=device,
                device_user_id=device_user_id,
                defaults={
                    'school': device.school,
                    'device_user_name': device_user_name,
                    'student': student,
                },
            )

            if created:
                mappings_created += 1
                logger.info(
                    f'Auto-created mapping: device={device.name} '
                    f'user_id={device_user_id} name={device_user_name} '
                    f'student={student}'
                )
            elif mapping.device_user_name != device_user_name:
                mapping.device_user_name = device_user_name
                if student and not mapping.student:
                    mapping.student = student
                mapping.save(update_fields=['device_user_name', 'student'])
                mappings_updated += 1

        except Exception as exc:
            logger.error(f'Error processing USER line "{line}": {exc}')
            continue

    logger.info(
        f'USER push from device={device.name}: '
        f'created={mappings_created} updated={mappings_updated}'
    )
    return HttpResponse('OK', content_type='text/plain')

def _resolve_student(device, device_user_id):

    mapping = BiometricUserMapping.objects.filter(
        device=device,
        device_user_id=device_user_id,
        is_active=True,
    ).select_related('student').first()

    if mapping:
        return mapping.student

    student = User.objects.filter(
        svc_number=device_user_id,
        role='student',
        is_active=True,
        school_memberships__school=device.school,
        school_memberships__status='active',
    ).first()

    if student:
        BiometricUserMapping.objects.get_or_create(
            device=device,
            device_user_id=device_user_id,
            defaults={
                'school': device.school,
                'student': student,
            },
        )

    return student

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
