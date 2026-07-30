import threading
import time
import logging

from django.core.cache import cache
from django.db import close_old_connections

from core.models import BiometricDevice
from core.services.zkteco_service import ZKTecoSyncService

logger = logging.getLogger("biometric.scheduler")

# Shared with core.tasks.sync_all_devices / sync_single_device / sync_device_clocks.
# ZKTeco devices don't support concurrent sessions, and this in-process thread
# runs alongside the Celery beat "sync-biometric-devices" task in production
# (though not typically alongside `runserver` locally) — without a shared lock
# both would connect to the same device at the same time.
SYNC_LOCK_KEY = 'biometric_sync:{device_id}'
SYNC_LOCK_TIMEOUT = 120

# A device that's actually unreachable (wrong network, cable unplugged, etc.)
# would otherwise be retried every 30s forever by the daemon thread — wasted
# connection attempts and log noise for a condition that isn't transient.
# After a failed attempt, back off for 5 minutes before trying that device
# again automatically. A manual "sync now" click always bypasses this.
BACKOFF_KEY = 'biometric_sync_backoff:{device_id}'
BACKOFF_SECONDS = 300


def sync_device_once(device, bypass_backoff=False):
    """
    Sync a single device, guarded by a lock shared across every entry point
    (scheduler thread, Celery beat, manual "sync now" action) so only one
    caller talks to the physical device at a time. Returns None if another
    sync for this device was already in progress, or if it's in its post
    failure backoff window (unless bypass_backoff=True).
    """
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
        # This thread can live for days (it runs in the Gunicorn master
        # process under preload_app). Without this, a dropped/idle DB
        # connection is never recovered and every later query fails.
        close_old_connections()

        try:
            # all_objects: this is a system-wide background job with no
            # request/school context, so it must see every school's
            # devices explicitly rather than relying on the tenant-aware
            # manager's context defaulting to "unscoped" when unset.
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