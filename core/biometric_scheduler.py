import threading
import time
import logging
from contextlib import contextmanager

from django.core.cache import cache
from django.db import close_old_connections

from core.models import BiometricDevice
from core.services.zkteco_service import ZKTecoSyncService

logger = logging.getLogger("biometric.scheduler")

SYNC_LOCK_KEY = 'biometric_sync:{device_id}'
SYNC_LOCK_TIMEOUT = 120

BACKOFF_KEY = 'biometric_sync_backoff:{device_id}'
BACKOFF_SECONDS = 300


@contextmanager
def device_lock(device, timeout=SYNC_LOCK_TIMEOUT):

    lock_key = SYNC_LOCK_KEY.format(device_id=device.id)
    acquired = cache.add(lock_key, True, timeout=timeout)
    try:
        yield acquired
    finally:
        if acquired:
            cache.delete(lock_key)


def sync_device_once(device, bypass_backoff=False):

    backoff_key = BACKOFF_KEY.format(device_id=device.id)

    if not bypass_backoff and cache.get(backoff_key):
        logger.debug(f"Skipping {device.name}: backing off after recent failure")
        return None

    lock_key = SYNC_LOCK_KEY.format(device_id=device.id)

    if not cache.add(lock_key, True, timeout=SYNC_LOCK_TIMEOUT):
        logger.debug(f"Skipping {device.name}: sync already in progress")
        return None

    try:
        logger.info(f"Auto syncing {device.name}")

        service = ZKTecoSyncService(device)
        result = service.fetch_and_store_logs()

        if result.get('status') == 'error':
            cache.set(backoff_key, True, timeout=BACKOFF_SECONDS)
        else:
            cache.delete(backoff_key)

        logger.info(
            f"{device.name}: "
            f"Created={result.get('created', 0)}, "
            f"Processed={result.get('processed', 0)}"
        )

        return result
    finally:
        cache.delete(lock_key)


def sync_loop():
    while True:

        close_old_connections()

        try:

            devices = BiometricDevice.all_objects.filter(is_active=True)

            for device in devices:
                try:
                    sync_device_once(device)
                except Exception as e:
                    logger.error(f"{device.name}: {e}")

        except Exception as e:
            logger.error(e)

        time.sleep(30)


_started = False


def start_scheduler():
    global _started

    if _started:
        return

    _started = True

    threading.Thread(
        target=sync_loop,
        daemon=True
    ).start()
