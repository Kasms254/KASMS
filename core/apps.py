import os
from django.apps import AppConfig


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

        if settings.DEBUG:
            return

        backend = settings.CACHES.get('default', {}).get('BACKEND', '')
        if 'locmem' in backend.lower():
            raise ImproperlyConfigured(
                "CACHES['default']['BACKEND'] is LocMemCache with DEBUG=False. "
                "This cache is per-process only, but rate-limit lockout "
                "counters, the JWT denylist, and session inactivity "
                "tracking all need to be shared across every "
                "worker/process. Set REDIS_URL (or otherwise configure a "
                "shared cache backend) before running in production."
            )