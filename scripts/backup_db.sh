#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/backup_encryption.sh"

DB_NAME="${DB_NAME:-kasms_db}"
DB_USER="${DB_USER:-kasms_user}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="kasms_backup_${TIMESTAMP}.sql.gz.age"

require_age_encryption

echo "============================================================"
echo "  KASMS PostgreSQL Backup"
echo "  Database : ${DB_NAME}"
echo "  Host     : ${DB_HOST}:${DB_PORT}"
echo "  Output   : ${BACKUP_FILE}"
echo "============================================================"

set +e
if command -v pg_dump &>/dev/null; then
    echo "[backup] Using native pg_dump..."
    PGPASSWORD="${DB_PASSWORD}" pg_dump \
        --host="${DB_HOST}" \
        --port="${DB_PORT}" \
        --username="${DB_USER}" \
        --dbname="${DB_NAME}" \
        --format=plain \
        --no-owner \
        --no-acl \
        --verbose \
    | gzip -9 \
    | age -R "${AGE_RECIPIENTS_FILE}" -o "${BACKUP_FILE}"
    PIPE_STATUSES=("${PIPESTATUS[@]}")

# ── Method B: Dockerized PostgreSQL (if old server uses Docker) ───────────────
elif command -v docker &>/dev/null; then
    echo "[backup] pg_dump not found locally – using Docker container..."
    # Adjust 'kasms-db-1' to match your old Docker container name.
    # Run: docker ps  to find the correct container name.
    OLD_CONTAINER="${PGCONTAINER:-kasms-db-1}"
    docker exec "${OLD_CONTAINER}" \
        pg_dump \
            --username="${DB_USER}" \
            --dbname="${DB_NAME}" \
            --format=plain \
            --no-owner \
            --no-acl \
    | gzip -9 \
    | age -R "${AGE_RECIPIENTS_FILE}" -o "${BACKUP_FILE}"
    PIPE_STATUSES=("${PIPESTATUS[@]}")

else
    set -e
    echo "[backup] ERROR: Neither pg_dump nor docker found. Cannot create backup."
    exit 1
fi
set -e
if ! check_pipeline_status "${BACKUP_FILE}" "${PIPE_STATUSES[@]}"; then
    exit 1
fi

# ── Verify backup ─────────────────────────────────────────────────────────────
if [ ! -f "${BACKUP_FILE}" ] || [ ! -s "${BACKUP_FILE}" ]; then
    echo "[backup] ERROR: Backup file is missing or empty. Something went wrong."
    exit 1
fi

BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
echo ""
echo "============================================================"
echo "  Backup COMPLETE"
echo "  File : ${BACKUP_FILE}"
echo "  Size : ${BACKUP_SIZE}"
echo "============================================================"
echo ""
echo "Next step – transfer to new server:"
echo "  scp ${BACKUP_FILE} user@NEW_SERVER_IP:/home/user/kasms/"
echo ""
echo "IMPORTANT: Verify the backup before transferring (requires the age"
echo "private key used to encrypt it):"
echo "  age -d -i /etc/kasms/age/backup-key.txt ${BACKUP_FILE} | gunzip -c | head -50"
