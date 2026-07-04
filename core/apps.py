import os
from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    started = False

    def ready(self):

        # Prevent Django's autoreloader from starting two threads
        if os.environ.get("RUN_MAIN") != "true":
            return

        if CoreConfig.started:
            return

        CoreConfig.started = True

        from core.biometric_scheduler import start_scheduler
        start_scheduler()