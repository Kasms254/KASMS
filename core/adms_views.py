"""
ZKTeco ADMS (Automatic Data Master Server) Protocol Implementation
===================================================================
Device Configuration:
    On the ZKTeco F22:
        Menu > Comm. > Cloud Server Setting:
            Server Address: <SERVER_IP>
            Server Port: <PORT> (e.g. 8000)
            Enable: On
"""

import logging
from datetime import datetime

from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET
from django.conf import settings
import pytz

from core.models import (
    BiometricDevice, BiometricUserMapping, BiometricRecord, User,
)

logger = logging.getLogger('biometric.adms')

DEVICE_TIMEZONE = getattr(settings, 'BIOMETRIC_DEVICE_TIMEZONE', 'Africa/Nairobi')
ADMS_HEARTBEAT_INTERVAL = getattr(settings, 'ADMS_HEARTBEAT_INTERVAL', 30)
ADMS_MAX_RECORDS_PER_PUSH = getattr(settings, 'ADMS_MAX_RECORDS_PER_PUSH', 30)


def _get_device_by_sn(serial_number, request=None):
    device = BiometricDevice.all_objects.filter(
        serial_number=serial_number, is_active=True,
    ).select_related('school').first()
    if device and request:
        remote_ip = _get_client_ip(request)
        if remote_ip and remote_ip != device.ip_address:
            logger.info('Device %s IP changed: %s -> %s', serial_number, device.ip_address, remote_ip)
            device.ip_address = remote_ip
            device.save(update_fields=['ip_address', 'updated_at'])
    return device


def _get_client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def _resolve_student(device, device_user_id):
    mapping = BiometricUserMapping.all_objects.filter(
        device=device, device_user_id=device_user_id, is_active=True,
    ).select_related('student').first()
    if mapping:
        return mapping.student
    student = User.objects.filter(
        svc_number=device_user_id, role='student', is_active=True,
        school_memberships__school=device.school, school_memberships__status='active',
    ).first()
    if student:
        BiometricUserMapping.all_objects.get_or_create(
            device=device, device_user_id=device_user_id,
            defaults={'school': device.school, 'student': student},
        )
        return student
    return None


def _verify_type_to_string(verify_type):
    types = {0: 'password', 1: 'fingerprint', 2: 'card', 3: 'face', 4: 'palm', 5: 'finger_vein', 15: 'auto'}
    return types.get(verify_type, f'unknown_{verify_type}')


def _get_timezone_offset():
    try:
        tz = pytz.timezone(DEVICE_TIMEZONE)
        now = datetime.now(tz)
        return int(now.utcoffset().total_seconds() // 3600)
    except Exception:
        return 3


@csrf_exempt
def adms_cdata(request):
    if request.method == 'GET':
        return _adms_cdata_handshake(request)
    elif request.method == 'POST':
        return _adms_cdata_receive(request)
    return HttpResponse('Method Not Allowed', status=405)


def _adms_cdata_handshake(request):
    serial_number = request.GET.get('SN', '').strip()
    if not serial_number:
        return HttpResponse('ERROR: Missing SN', status=400)

    device = _get_device_by_sn(serial_number, request)
    if not device:
        remote_ip = _get_client_ip(request)
        logger.warning('ADMS handshake from unregistered device SN=%s IP=%s', serial_number, remote_ip)
        config = (
            'GET OPTION FROM: {sn}\r\nErrorDelay=60\r\nDelay=30\r\n'
            'TransTimes=00:00;14:05\r\nTransInterval=1\r\n'
            'TransFlag=TransData AttLog\tOpLog\r\nRealtime=1\r\nTimeZone={tz}\r\n'
        ).format(sn=serial_number, tz=_get_timezone_offset())
        return HttpResponse(config, content_type='text/plain')

    device.last_sync_at = timezone.now()
    device.last_sync_status = 'adms_connected'
    device.save(update_fields=['last_sync_at', 'last_sync_status', 'updated_at'])

    push_ver = request.GET.get('pushver', '2.4.0')
    logger.info('ADMS handshake from %s (SN=%s, pushver=%s)', device.name, serial_number, push_ver)

    heartbeat = device.sync_interval_seconds or ADMS_HEARTBEAT_INTERVAL
    config_lines = [
        f'GET OPTION FROM: {serial_number}',
        'ErrorDelay=30',
        f'Delay={heartbeat}',
        'TransTimes=00:00;14:05',
        'TransInterval=1',
        'TransFlag=TransData AttLog\tOpLog\tEnrollUser\tChgUser\tChgFP\tFace',
        'Realtime=1',
        'Encrypt=0',
        'ServerVer=2.4.0',
        'PushProtVer=2.4.0',
        f'TimeZone={_get_timezone_offset()}',
        f'MaxRecordCount={ADMS_MAX_RECORDS_PER_PUSH}',
    ]
    return HttpResponse('\r\n'.join(config_lines) + '\r\n', content_type='text/plain')


def _adms_cdata_receive(request):
    serial_number = request.GET.get('SN', '').strip()
    table = request.GET.get('table', '').strip().upper()
    stamp = request.GET.get('Stamp', '').strip()

    if not serial_number:
        return HttpResponse('OK', content_type='text/plain')

    device = _get_device_by_sn(serial_number, request)
    if not device:
        logger.warning('ADMS cdata POST from unregistered device SN=%s', serial_number)
        return HttpResponse('OK', content_type='text/plain')

    raw_body = request.body.decode('utf-8', errors='replace')
    logger.debug('ADMS cdata from %s: table=%s stamp=%s body=%s', device.name, table, stamp, raw_body[:300])

    if table == 'ATTLOG':
        result = _process_attlog(device, raw_body, stamp)
    elif table == 'OPERLOG':
        result = _process_operlog(device, raw_body)
    elif table in ('ENROLLUSER', 'USER'):
        result = _process_user_push(device, raw_body)
    else:
        logger.info('ADMS cdata unhandled table=%s from %s', table, device.name)
        result = {'records_created': 0}

    device.last_sync_at = timezone.now()
    device.last_sync_status = f'adms_push_{table.lower()}'
    device.last_sync_records = result.get('records_created', 0)
    device.total_synced_records += result.get('records_created', 0)
    device.save(update_fields=['last_sync_at', 'last_sync_status', 'last_sync_records', 'total_synced_records', 'updated_at'])

    return HttpResponse(f'OK: {result.get("records_created", 0)}', content_type='text/plain')


@csrf_exempt
@require_GET
def adms_getrequest(request):
    serial_number = request.GET.get('SN', '').strip()
    if not serial_number:
        return HttpResponse('OK', content_type='text/plain')
    device = _get_device_by_sn(serial_number)
    if not device:
        return HttpResponse('OK', content_type='text/plain')
    device.last_sync_at = timezone.now()
    device.save(update_fields=['last_sync_at', 'updated_at'])
    return HttpResponse('OK', content_type='text/plain')


@csrf_exempt
def adms_devicecmd(request):
    serial_number = request.GET.get('SN', '').strip()
    raw_body = request.body.decode('utf-8', errors='replace')
    logger.info('ADMS devicecmd from SN=%s: %s', serial_number, raw_body[:200])
    return HttpResponse('OK', content_type='text/plain')


def _process_attlog(device, raw_body, stamp):
    device_tz = pytz.timezone(DEVICE_TIMEZONE)
    records_created = 0
    records_skipped = 0

    for line in raw_body.strip().split('\n'):
        line = line.strip()
        if not line:
            continue
        parts = line.split('\t')
        if len(parts) < 4:
            continue
        try:
            user_id = parts[0].strip()
            timestamp_str = parts[1].strip()
            status = int(parts[2].strip()) if parts[2].strip().isdigit() else 0
            verify_type = int(parts[3].strip()) if parts[3].strip().isdigit() else 0
            if not user_id or not timestamp_str:
                continue
            try:
                scan_time = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
            except ValueError:
                logger.warning('ADMS ATTLOG bad timestamp: %s', timestamp_str)
                continue
            scan_time = device_tz.localize(scan_time)
            student = _resolve_student(device, user_id)
            if not student:
                records_skipped += 1
                continue
            exists = BiometricRecord.all_objects.filter(
                device_id=str(device.id), biometric_id=user_id, scan_time=scan_time,
            ).exists()
            if exists:
                records_skipped += 1
                continue
            record = BiometricRecord.all_objects.create(
                school=device.school, device_id=str(device.id), device_type='zkteco',
                device_name=device.name, student=student, biometric_id=user_id,
                scan_time=scan_time, verification_type=_verify_type_to_string(verify_type),
                raw_data={
                    'user_id': user_id, 'timestamp': timestamp_str, 'verify_type': verify_type,
                    'status': status, 'stamp': stamp, 'device_sn': device.serial_number, 'source': 'adms',
                },
            )
            records_created += 1
            try:
                record.process_to_attendance()
            except Exception as e:
                logger.error('ADMS ATTLOG attendance error for record %s: %s', record.id, e)
        except Exception as e:
            logger.error('ADMS ATTLOG parse error: %s, error: %s', line[:100], e)
            continue

    logger.info('ADMS ATTLOG from %s: created=%d skipped=%d', device.name, records_created, records_skipped)
    return {'records_created': records_created, 'records_skipped': records_skipped}


def _process_operlog(device, raw_body):
    lines = [l.strip() for l in raw_body.strip().split('\n') if l.strip()]
    logger.info('ADMS OPERLOG from %s: %d entries', device.name, len(lines))
    return {'records_created': 0}


def _process_user_push(device, raw_body):
    lines = [l.strip() for l in raw_body.strip().split('\n') if l.strip()]
    logger.info('ADMS USER push from %s: %d entries', device.name, len(lines))
    return {'records_created': 0}