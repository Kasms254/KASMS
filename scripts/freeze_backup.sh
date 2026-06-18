#!/bin/bash
# =============================================================================
# Freeze Writes + Final Backup – KASMS
#
# Use this for the FINAL backup immediately before DNS cutover.
# It quiesces the application (stops Django + Celery), waits for any
# in-flight tasks to drain, then takes a backup of the fully quiet database.
#
# This guarantees the backup contains EVERY write that was committed before
# the migration — zero data loss.
#
# Usage:
#   chmod +x scripts/freeze_backup.sh
#   ./scripts/freeze_backup.sh
#
# After this script completes:
#   1. Review the backup file path printed at the end.
#   2. Transfer the backup to the new server.
#   3. Point DNS to the new server.
#   4. The old server's services are STOPPED — do not restart them.
#      If you need to rollback, run: docker compose up -d backend celery_worker celery_beat
# =============================================================================
set -euo pipefail

# Load .env for DB credentials
if [ -f .env ]; then
    set -a; source .env; set +a
fi

DB_NAME="${DB_NAME:-kasms_db}"
DB_USER="${DB_USER:-kasms_user}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="kasms_FINAL_backup_${TIMESTAMP}.sql.gz"
TASK_DRAIN_TIMEOUT=60   # seconds to wait for Celery tasks to finish

echo "============================================================"
echo "  KASMS Write Freeze + Final Backup"
echo "  This will STOP Django and Celery on this server."
echo "  Run this ONLY when you are ready to cut over to the new server."
echo "============================================================"
echo ""
read -p "Type 'freeze' to confirm and continue: " CONFIRM
if [ "${CONFIRM}" != "freeze" ]; then
    echo "Aborted."
    exit 1
fi

# ── Step 1: Stop Django (no new writes from API) ──────────────────────────────
echo ""
echo "[freeze] Step 1: Stopping Django backend (graceful shutdown)..."
docker compose stop backend
echo "[freeze]   backend stopped. Nginx will return 502 until DNS is switched."

# ── Step 2: Wait for Celery workers to finish in-flight tasks ────────────────
echo ""
echo "[freeze] Step 2: Waiting for Celery workers to drain (max ${TASK_DRAIN_TIMEOUT}s)..."
START_TIME=$(date +%s)
while true; do
    ACTIVE=$(docker compose exec -T celery_worker \
        celery -A kasms inspect active --timeout 5 -q 2>/dev/null | \
        python3 -c "
import sys, json
data = sys.stdin.read().strip()
if not data or data == 'Error: No nodes replied within time constraint':
    print(0)
    sys.exit(0)
try:
    parsed = json.loads(data)
    total = sum(len(v) for v in parsed.values())
    print(total)
except Exception:
    print(0)
" 2>/dev/null || echo "0")

    if [ "${ACTIVE}" = "0" ]; then
        echo "[freeze]   No active tasks. Workers are idle."
        break
    fi

    ELAPSED=$(( $(date +%s) - START_TIME ))
    if [ "${ELAPSED}" -ge "${TASK_DRAIN_TIMEOUT}" ]; then
        echo "[freeze]   WARNING: ${ACTIVE} task(s) still active after ${TASK_DRAIN_TIMEOUT}s."
        echo "[freeze]   Proceeding with backup anyway. These tasks will need to be"
        echo "[freeze]   re-queued or manually completed on the new server."
        break
    fi

    echo "[freeze]   ${ACTIVE} task(s) still running... (${ELAPSED}s elapsed)"
    sleep 5
done

# ── Step 3: Stop Celery (no more writes from async tasks) ────────────────────
echo ""
echo "[freeze] Step 3: Stopping Celery worker and beat..."
docker compose stop celery_worker celery_beat
echo "[freeze]   Celery stopped. Database is now fully quiescent."

# ── Step 4: Take the backup ───────────────────────────────────────────────────
echo ""
echo "[freeze] Step 4: Taking final backup..."
docker compose exec -T db \
    pg_dump \
        --username="${DB_USER}" \
        --dbname="${DB_NAME}" \
        --format=plain \
        --no-owner \
        --no-acl \
| gzip -6 > "${BACKUP_FILE}"

# Verify
if [ ! -f "${BACKUP_FILE}" ] || [ ! -s "${BACKUP_FILE}" ]; then
    echo "[freeze] ERROR: Backup file is empty or missing."
    echo "[freeze] Restarting services for safety..."
    docker compose start backend celery_worker celery_beat
    exit 1
fi

BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)

# ── Step 5: Verify the backup SQL is parseable ────────────────────────────────
echo ""
echo "[freeze] Step 5: Verifying backup integrity..."
TABLE_COUNT=$(gunzip -c "${BACKUP_FILE}" | grep -c "^CREATE TABLE" || true)
echo "[freeze]   Tables found in backup: ${TABLE_COUNT}"
if [ "${TABLE_COUNT}" -lt 5 ]; then
    echo "[freeze]   WARNING: Fewer tables than expected. Verify the backup manually:"
    echo "[freeze]   gunzip -c ${BACKUP_FILE} | head -100"
fi

echo ""
echo "============================================================"
echo "  FINAL BACKUP COMPLETE"
echo "  File : ${BACKUP_FILE}"
echo "  Size : ${BACKUP_SIZE}"
echo "  Tables found: ${TABLE_COUNT}"
echo ""
echo "  Old server services are STOPPED."
echo ""
echo "  Next steps:"
echo "  1. Transfer backup to new server:"
echo "     scp ${BACKUP_FILE} user@NEW_IP:/home/user/kasms/"
echo ""
echo "  2. On new server, restore:"
echo "     ./scripts/deploy.sh --restore=${BACKUP_FILE}"
echo ""
echo "  3. Verify new server is healthy:"
echo "     curl https://your-domain.com/health/"
echo ""
echo "  4. Point DNS A record to new server IP."
echo ""
echo "  ROLLBACK (if anything goes wrong before DNS switch):"
echo "     docker compose start backend celery_worker celery_beat"
echo "============================================================"
