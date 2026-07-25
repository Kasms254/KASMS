#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/backup_encryption.sh"

# Load .env for DB credentials
if [ -f .env ]; then
    set -a; source .env; set +a
fi

DB_NAME="${DB_NAME:-kasms_db}"
DB_USER="${DB_USER:-kasms_user}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="kasms_FINAL_backup_${TIMESTAMP}.dump.age"
TASK_DRAIN_TIMEOUT=60   # seconds to wait for Celery tasks to finish

require_age_encryption

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

# ── Step 4: Take the backup (custom format — required by restore_db.sh's ────
#            pg_restore step below — encrypted and streamed, so no ─────────
#            plaintext dump is ever written to disk) ────────────────────────
echo ""
echo "[freeze] Step 4: Taking final backup..."
set +e
docker compose exec -T db \
    pg_dump \
        --username="${DB_USER}" \
        --dbname="${DB_NAME}" \
        --format=custom \
        --no-owner \
        --no-acl \
| age -R "${AGE_RECIPIENTS_FILE}" -o "${BACKUP_FILE}"

PIPE_STATUSES=("${PIPESTATUS[@]}")
set -e
if ! check_pipeline_status "${BACKUP_FILE}" "${PIPE_STATUSES[@]}"; then
    echo "[freeze] Restarting services for safety..."
    docker compose start backend celery_worker celery_beat
    exit 1
fi

# Verify
if [ ! -f "${BACKUP_FILE}" ] || [ ! -s "${BACKUP_FILE}" ]; then
    echo "[freeze] ERROR: Backup file is empty or missing."
    echo "[freeze] Restarting services for safety..."
    docker compose start backend celery_worker celery_beat
    exit 1
fi

BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)

# ── Step 5: Verify the backup archive is parseable ────────────────────────────
echo ""
echo "[freeze] Step 5: Verifying backup integrity..."
if age_key_available; then
    TABLE_COUNT=$(age -d -i "${AGE_KEY_FILE}" "${BACKUP_FILE}" 2>/dev/null \
        | docker compose exec -T db pg_restore --list 2>/dev/null \
        | grep -c "TABLE DATA" || true)
    echo "[freeze]   Tables found in backup: ${TABLE_COUNT}"
    if [ "${TABLE_COUNT}" -lt 5 ]; then
        echo "[freeze]   WARNING: Fewer tables than expected. Verify the backup manually:"
        echo "[freeze]   age -d -i ${AGE_KEY_FILE} ${BACKUP_FILE} | docker compose exec -T db pg_restore --list | head -100"
    fi
else
    echo "[freeze]   Private key not present locally — skipping decrypt-verify (expected once the key has been moved offline)."
    TABLE_COUNT="unverified"
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
echo "  2. On new server, restore (scripts/restore_db.sh, called by deploy.sh"
echo "     below, decrypts .age backups automatically — it needs the age"
echo "     private key copied to the new server, see BACKUP_ENCRYPTION.md):"
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
