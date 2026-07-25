import logging
import os
from django.apps import AppConfig

logger = logging.getLogger(__name__)


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    started = False

    def ready(self):
        import sys

        argv0 = sys.argv[0] if sys.argv else ""
        is_gunicorn = "gunicorn" in argv0
        is_runserver = "manage.py" in argv0 and sys.argv[1:2] == ["runserver"]

        should_start = is_gunicorn or (
            is_runserver and os.environ.get("RUN_MAIN") == "true"
        )

        if not should_start:
            return

        if CoreConfig.started:
            return

        CoreConfig.started = True

        self._check_cache_backend_for_production()

        from core.biometric_scheduler import start_scheduler
        start_scheduler()

    @staticmethod
    def _check_cache_backend_for_production():

        from django.conf import settings
        from django.core.exceptions import ImproperlyConfigured

        debug = os.getenv('DEBUG', 'False') == 'True'
        if debug:
            return

        backend = settings.CACHES.get('default', {}).get('BACKEND', '')
        if 'locmem' not in backend.lower():
            return

        if os.getenv('ALLOW_LOCMEM_CACHE_IN_PRODUCTION', 'False') == 'True':

            logger.warning(
                "Booting with CACHES['default']['BACKEND']=LocMemCache in "
                "production because ALLOW_LOCMEM_CACHE_IN_PRODUCTION=True "
                "is set. Rate-limit lockout counters, the JWT denylist, "
                "and session inactivity tracking are NOT shared across "
                "workers/processes while this is active — each worker "
                "enforces them independently. Set REDIS_URL and remove "
                "this override as soon as Redis is available.",
            )
            return

        raise ImproperlyConfigured(
            "CACHES['default']['BACKEND'] is LocMemCache with DEBUG=False. "
            "This cache is per-process only, but rate-limit lockout "
            "counters, the JWT denylist, and session inactivity "
            "tracking all need to be shared across every "
            "worker/process. Set REDIS_URL (or otherwise configure a "
            "shared cache backend) before running in production. If you "
            "need to deploy before Redis is ready, set "
            "ALLOW_LOCMEM_CACHE_IN_PRODUCTION=True as a deliberate, "
            "temporary override."
        )