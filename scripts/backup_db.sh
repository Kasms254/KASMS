#!/bin/bash
# =============================================================================
# PostgreSQL Database Backup – KASMS
#
# Run this on the OLD server BEFORE migration.
#
# Usage:
#   chmod +x scripts/backup_db.sh
#   ./scripts/backup_db.sh
#
# Output: kasms_backup_YYYYMMDD_HHMMSS.sql.gz  (in current directory)
#
# The backup uses pg_dump with --format=plain (SQL text) so it is:
#   - Human-readable for verification
#   - Compatible with any PostgreSQL version >= source version
#   - Safe for cross-version restores (14→16, etc.)
#
# NOTE: Run on the OLD server. The database does NOT need to be in Docker.
# This script works against a native PostgreSQL install OR a Docker container.
# =============================================================================
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
# If running against a Docker container on the old server, set these to match
# your old server's PostgreSQL credentials.
DB_NAME="${DB_NAME:-kasms_db}"
DB_USER="${DB_USER:-kasms_user}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="kasms_backup_${TIMESTAMP}.sql.gz"

echo "============================================================"
echo "  KASMS PostgreSQL Backup"
echo "  Database : ${DB_NAME}"
echo "  Host     : ${DB_HOST}:${DB_PORT}"
echo "  Output   : ${BACKUP_FILE}"
echo "============================================================"

# ── Method A: Native PostgreSQL (old server without Docker) ──────────────────
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
    | gzip -9 > "${BACKUP_FILE}"

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
    | gzip -9 > "${BACKUP_FILE}"

else
    echo "[backup] ERROR: Neither pg_dump nor docker found. Cannot create backup."
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
echo "IMPORTANT: Verify the backup before transferring:"
echo "  gunzip -c ${BACKUP_FILE} | head -50"
