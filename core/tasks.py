import logging
from celery import shared_task
from django.core.cache import cache

logger = logging.getLogger('biometric.sync')


@shared_task(bind=True, max_retries=0)
def sync_all_devices(self):
    from core.models import BiometricDevice
    from core.biometric_scheduler import sync_device_once

    # all_objects: system-wide beat task with no request/school context —
    # see core.biometric_scheduler.sync_loop for why this must be explicit.
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
        # Share the attendance-sync lock: this also opens a device session,
        # and ZKTeco devices don't support concurrent connections.
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