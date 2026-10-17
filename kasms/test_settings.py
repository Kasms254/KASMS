"""
Test settings — uses SQLite in-memory with migrations disabled.
Django creates tables directly from models, bypassing the broken migration chain.

Usage (pytest — preferred):
    pytest
    pytest tests/security/
    pytest -m tenant

Usage (Django test runner — for specific legacy tests):
    python manage.py test --settings=kasms.test_settings core.tests.test_policy
    python manage.py test --settings=kasms.test_settings core.tests.test_policy.TestPolicyModeEvaluation
"""
import os

from .settings import *  # noqa: F401, F403

# ── Database ──────────────────────────────────────────────────────────────────
# In-memory SQLite avoids needing a live Postgres instance for unit/security tests.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

# Opt-in: TEST_DATABASE=postgres runs the suite on the PostgreSQL server configured by the
# usual DB_* / HOST / PORT variables (CI service). Needed for the row-locking/concurrency
# tests, which skip on SQLite. The test runner creates and drops its own test_<DB_NAME>.
if os.getenv("TEST_DATABASE") == "postgres":
    from .settings import DATABASES as _APP_DATABASES
    DATABASES = {"default": {**_APP_DATABASES["default"], "CONN_MAX_AGE": 0}}

# ── Migrations ────────────────────────────────────────────────────────────────
# Disable migrations — Django creates tables directly from models.
# Avoids conflicts in the migration chain when running on a fresh DB.
class DisableMigrations:
    def __contains__(self, item):
        return True

    def __getitem__(self, item):
        return None

MIGRATION_MODULES = DisableMigrations()

# ── Password hashing ──────────────────────────────────────────────────────────
# MD5 is intentionally insecure but extremely fast for tests.
# NEVER use this in production.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

# ── Email ─────────────────────────────────────────────────────────────────────
# Swallow all outgoing email; inspect via django.core.mail.outbox in tests.
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# ── Celery ────────────────────────────────────────────────────────────────────
# Run tasks synchronously in the calling thread — no broker needed.
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True  # Raise exceptions rather than silently swallowing

# ── Media ─────────────────────────────────────────────────────────────────────
MEDIA_ROOT = "/tmp/kasms_test_media/"

# ── Logging ───────────────────────────────────────────────────────────────────
# Silence noisy loggers during test runs. Set to WARNING to keep critical output.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
        }
    },
    "root": {
        "handlers": ["console"],
        "level": "WARNING",
    },
    "loggers": {
        "django": {"level": "WARNING"},
        "core": {"level": "WARNING"},
        "certificate.verification": {"level": "WARNING"},
    },
}

# ── Cache ─────────────────────────────────────────────────────────────────────
# Use a local in-memory cache — no Redis needed.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}
