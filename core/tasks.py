import logging
from celery import shared_task
from django.core.cache import cache
from django.utils import timezone
from core.models import BiometricDevice
from core.services.zkteco_service import ZKTecoSyncService
logger = logging.getLogger('biometric.sync')


@shared_task(bind=True, max_retries=0)
def sync_all_devices(self):
    devices = BiometricDevice.objects.filter(
        status='active', is_active=True
    )
    results = []
    for device in devices:

        lock_key = f'biometric_sync:{device.id}'
        if cache.get(lock_key):
            logger.debug(f'Skipping {device.name}: sync in progress')
            continue

        try:
            cache.set(lock_key, True, timeout=120)

            service = ZKTecoSyncService(device)
            result = service.fetch_and_store_logs()
            results.append({
                'device': device.name,
                'result': result
            })
        except Exception as e:
            logger.error(f'Task error for {device.name}: {e}')
        finally:
            cache.delete(lock_key)

    return results

@shared_task
def sync_single_device(device_id):
    try:
        device = BiometricDevice.objects.get(id=device_id,
        is_active=True)
        service = ZKTecoSyncService(device)
        return service.fetch_and_store_logs()
    except BiometricDevice.DoesNotExist:
        return {'status': 'error', 'message': 'Device not found'
        }

@shared_task
def process_pending_records():
    
    pending = BiometricRecord.objects.filter(
        processed = False,
        scan_time__gte=timezone.now()- timezone.timedelta(hours=24)
    ).select_related('student')

    processed = 0
    for record in pending:
        try:
            attendance = record.process_to_attendance()
            if attendance:
                processed += 1
        except Exception as e:
            logger.error(f'Error processing record {record.id}: {e}')

    return {'processed': processed, 'pending': pending.count()}


@shared_task
def sync_device_clocks():

    devices  = BiometricDevice.objects.filter(
        status='active', is_active=True
    )
    for device in devices:
        try:
            service = ZKTecoSyncService(device)
            service.sync_device_time()
        except Exception as e:
            logger.error(f'Clock sync failed for {device.name}: {e}')

            