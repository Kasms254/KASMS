#!/bin/bash
# =============================================================================
# Django Container Entrypoint – KASMS
#
# Usage (set by Dockerfile CMD / docker-compose command):
#   gunicorn               → migrate + collectstatic + start gunicorn
#   celery -A kasms ...    → wait for db+redis, then exec celery
#   anything else          → exec directly (management commands, shell, etc.)
# =============================================================================
set -euo pipefail

# ── Helpers ───────────────────────────────────────────────────────────────────

wait_for_postgres() {
    echo "[entrypoint] Waiting for PostgreSQL at ${HOST}:${PORT:-5432}..."
    local retries=30
    until python -c "
import os, sys
try:
    import psycopg2
    psycopg2.connect(
        dbname=os.environ['DB_NAME'],
        user=os.environ['DB_USER'],
        password=os.environ['DB_PASSWORD'],
        host=os.environ['HOST'],
        port=int(os.environ.get('PORT', 5432)),
        connect_timeout=3,
    ).close()
    sys.exit(0)
except Exception as e:
    sys.exit(1)
" 2>/dev/null; do
        retries=$((retries - 1))
        if [ "$retries" -le 0 ]; then
            echo "[entrypoint] ERROR: PostgreSQL did not become ready in time. Aborting."
            exit 1
        fi
        echo "[entrypoint] PostgreSQL unavailable, retrying in 3s... ($retries attempts left)"
        sleep 3
    done
    echo "[entrypoint] PostgreSQL is ready."
}

wait_for_redis() {
    echo "[entrypoint] Waiting for Redis..."
    local retries=20
    until python -c "
import os, sys
try:
    import redis
    url = os.environ.get('CELERY_BROKER_URL', 'redis://redis:6379/0')
    r = redis.Redis.from_url(url, socket_connect_timeout=3)
    r.ping()
    sys.exit(0)
except Exception:
    sys.exit(1)
" 2>/dev/null; do
        retries=$((retries - 1))
        if [ "$retries" -le 0 ]; then
            echo "[entrypoint] ERROR: Redis did not become ready in time. Aborting."
            exit 1
        fi
        echo "[entrypoint] Redis unavailable, retrying in 3s... ($retries attempts left)"
        sleep 3
    done
    echo "[entrypoint] Redis is ready."
}

# ── Main Dispatch ─────────────────────────────────────────────────────────────

case "${1:-gunicorn}" in

    gunicorn)
        # ── Backend: migrate → collectstatic → start gunicorn ─────────────────
        wait_for_postgres

        echo "[entrypoint] Running database migrations..."
        python manage.py migrate --noinput

        echo "[entrypoint] Creating periodic task schedules (if not exist)..."
        # Ensure django-celery-beat periodic tasks are created from CELERY_BEAT_SCHEDULE
        python manage.py shell -c "
from django_celery_beat.models import PeriodicTask
print(f'  Existing periodic tasks: {PeriodicTask.objects.count()}')
" 2>/dev/null || true

        echo "[entrypoint] Collecting static files..."
        python manage.py collectstatic --noinput --clear

        echo "[entrypoint] Starting Gunicorn (workers=$(python -c 'import multiprocessing; print(multiprocessing.cpu_count()*2+1)'))..."
        exec gunicorn kasms.wsgi:application --config /app/gunicorn.conf.py
        ;;

    celery*)
        # ── Celery worker / beat: just wait for infra then exec ───────────────
        wait_for_postgres
        wait_for_redis
        echo "[entrypoint] Starting: $*"
        exec "$@"
        ;;

    *)
        # ── Pass-through for management commands, bash, etc. ──────────────────
        exec "$@"
        ;;

esac
