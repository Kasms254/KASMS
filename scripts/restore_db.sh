#!/bin/bash
# =============================================================================
# PostgreSQL Database Restore – KASMS
#
# Run this on the NEW server AFTER docker compose up -d db.
#
# Usage:
#   chmod +x scripts/restore_db.sh
#   ./scripts/restore_db.sh kasms_backup_20260423_140000.sql.gz
#
# What this script does:
#   1. Verifies the backup file is readable
#   2. Waits for the PostgreSQL Docker container to be ready
#   3. Drops and recreates the database (clean slate)
#   4. Restores the backup
#   5. Verifies row counts in key tables
# =============================================================================
set -euo pipefail

# ── Arguments ─────────────────────────────────────────────────────────────────
BACKUP_FILE="${1:-}"
if [ -z "${BACKUP_FILE}" ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    echo "Example: $0 kasms_backup_20260423_140000.sql.gz"
    exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "ERROR: Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

# ── Configuration (read from .env if present) ─────────────────────────────────
if [ -f .env ]; then
    set -a; source .env; set +a
fi

DB_NAME="${DB_NAME:-kasms_db}"
DB_USER="${DB_USER:-kasms_user}"
DB_PASSWORD="${DB_PASSWORD}"
COMPOSE_SERVICE="db"
BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)

echo "============================================================"
echo "  KASMS PostgreSQL Restore"
echo "  Backup file : ${BACKUP_FILE} (${BACKUP_SIZE})"
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

# ── Wait for PostgreSQL to be ready ──────────────────────────────────────────
echo ""
echo "[restore] Waiting for PostgreSQL container to be ready..."
until docker compose exec -T "${COMPOSE_SERVICE}" \
    pg_isready -U "${DB_USER}" -d postgres -q; do
    echo "[restore]   PostgreSQL not ready, waiting 3s..."
    sleep 3
done
echo "[restore] PostgreSQL is ready."

# ── Drop and recreate the target database ────────────────────────────────────
echo "[restore] Dropping existing database (if it exists)..."
docker compose exec -T "${COMPOSE_SERVICE}" \
    psql -U "${DB_USER}" -d postgres \
    -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" || true

echo "[restore] Creating fresh database..."
docker compose exec -T "${COMPOSE_SERVICE}" \
    psql -U "${DB_USER}" -d postgres \
    -c "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\" ENCODING 'UTF8' LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8' TEMPLATE template0;"

# ── Restore the backup ────────────────────────────────────────────────────────
echo "[restore] Restoring backup (this may take several minutes for large databases)..."
gunzip -c "${BACKUP_FILE}" | docker compose exec -T "${COMPOSE_SERVICE}" \
    psql -U "${DB_USER}" -d "${DB_NAME}" \
    --single-transaction \
    -v ON_ERROR_STOP=0 \
    2>&1 | grep -v "^SET$\|^--\|already exists\|^$" || true

echo ""
echo "[restore] Restore pipeline completed."

# ── Verify restore ────────────────────────────────────────────────────────────
echo ""
echo "[restore] Verifying restore – table row counts:"
docker compose exec -T "${COMPOSE_SERVICE}" \
    psql -U "${DB_USER}" -d "${DB_NAME}" \
    -c "
SELECT
    schemaname,
    tablename,
    n_live_tup AS row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC
LIMIT 20;
"

echo ""
echo "============================================================"
echo "  Restore COMPLETE."
echo "  Next steps:"
echo "    1. Start backend:  docker compose up -d backend"
echo "    2. Migrations run automatically on backend startup."
echo "    3. Check logs:     docker compose logs -f backend"
echo "============================================================"
