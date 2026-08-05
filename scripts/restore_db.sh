#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/backup_encryption.sh"

BACKUP_FILE="${1:-}"
if [ -z "${BACKUP_FILE}" ]; then
    echo "Usage: $0 <backup_file.dump[.age]>"
    echo "Example: $0 /var/backups/kasms/db_20260518_010000.dump.age"
    exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "ERROR: Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

ENCRYPTED=0
if [[ "${BACKUP_FILE}" == *.age ]]; then
    ENCRYPTED=1
    require_age_decryption
fi

if [ -f .env ]; then
    set -a; source .env; set +a
fi

DB_NAME="${DB_NAME:-kasms_db}"
DB_USER="${DB_USER:-kasms_user}"
COMPOSE_SERVICE="db"
BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)

echo "============================================================"
echo "  KASMS PostgreSQL Restore"
echo "  Backup file : ${BACKUP_FILE} (${BACKUP_SIZE})"
echo "  Encrypted   : $([ "${ENCRYPTED}" -eq 1 ] && echo yes || echo no)"
echo "  Target DB   : ${DB_NAME}"
echo "  Container   : ${COMPOSE_SERVICE}"
echo "============================================================"
echo ""
echo "WARNING: This will DROP and recreate the database '${DB_NAME}'."
echo "  All existing data in the target database will be lost."
echo ""
read -p "Are you sure? Type 'yes' to continue: " CONFIRM
if [ "${CONFIRM}" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "[restore] Stopping backend services..."
docker compose stop backend celery_worker celery_beat || true

echo "[restore] Waiting for PostgreSQL container to be ready..."
until docker compose exec -T "${COMPOSE_SERVICE}" \
    pg_isready -U "${DB_USER}" -d postgres -q; do
    echo "[restore]   PostgreSQL not ready, waiting 3s..."
    sleep 3
done
echo "[restore] PostgreSQL is ready."

echo "[restore] Dropping existing database (if it exists)..."
docker compose exec -T "${COMPOSE_SERVICE}" \
    psql -U "${DB_USER}" -d postgres \
    -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" || true

echo "[restore] Creating fresh database..."
docker compose exec -T "${COMPOSE_SERVICE}" \
    psql -U "${DB_USER}" -d postgres \
    -c "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\" ENCODING 'UTF8' LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8' TEMPLATE template0;"

echo "[restore] Restoring backup (this may take several minutes for large databases)..."
if [ "${ENCRYPTED}" -eq 1 ]; then
    age -d -i "${AGE_KEY_FILE}" "${BACKUP_FILE}" | \
    docker compose exec -T "${COMPOSE_SERVICE}" \
        pg_restore \
        --username="${DB_USER}" \
        --dbname="${DB_NAME}" \
        --no-owner \
        --no-acl \
        --format=custom
else
    docker compose exec -T "${COMPOSE_SERVICE}" \
        pg_restore \
        --username="${DB_USER}" \
        --dbname="${DB_NAME}" \
        --no-owner \
        --no-acl \
        --format=custom \
        < "${BACKUP_FILE}"
fi

echo ""
echo "[restore] Restore pipeline completed."

echo ""
echo "[restore] Verifying restore – table row counts:"
docker compose exec -T "${COMPOSE_SERVICE}" \
    psql -U "${DB_USER}" -d "${DB_NAME}" \
    -c "
SELECT
    schemaname,
    relname,
    n_live_tup AS row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC
LIMIT 20;
"

echo ""
echo "[restore] Restarting backend services..."
docker compose start backend celery_worker celery_beat

echo ""
echo "============================================================"
echo "  Restore COMPLETE."
echo "  Check logs: docker compose logs -f backend"
echo "============================================================"
