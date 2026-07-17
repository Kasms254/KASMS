import threading
import time
import logging

from core.models import BiometricDevice
from core.services.zkteco_service import ZKTecoSyncService

logger = logging.getLogger("biometric.scheduler")


def sync_loop():
    while True:
        try:
            devices = BiometricDevice.objects.filter(is_active=True)

            for device in devices:
                try:
                    logger.info(f"Auto syncing {device.name}")

                    service = ZKTecoSyncService(device)
                    result = service.fetch_and_store_logs()

                    logger.info(
                        f"{device.name}: "
                        f"Created={result.get('created', 0)}, "
                        f"Processed={result.get('processed', 0)}"
                    )

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