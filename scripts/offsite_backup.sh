#!/bin/bash
# =============================================================================
# Offsite Backup – KASMS
#
# Backs up PostgreSQL (custom format) + media files to a remote via rclone.
# Retention: 14 days.
#
# SETUP (run once on the server):
#   1. Install rclone:  curl https://rclone.org/install.sh | sudo bash
#   2. Configure:       rclone config
#      Name your remote "kasms-backup" (must match RCLONE_REMOTE below).
#      For SFTP (backup to another server):
#        rclone config → n → sftp → enter host, user, key path
#   3. Test:            rclone lsd kasms-backup:
#   4. Add to crontab (run as kasms user):
#      0 2 * * * /var/www/KASMS/scripts/offsite_backup.sh
# =============================================================================
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
cd /var/www/KASMS
if [ -f .env ]; then set -a; source .env; set +a; fi

DB_NAME="${DB_NAME:-kasms_db}"
DB_USER="${DB_USER:-kasms_user}"

RCLONE_REMOTE="${RCLONE_REMOTE:-kasms-backup}"
RCLONE_DEST="${RCLONE_REMOTE}:kasms-backups"

STAGING_DIR="/tmp/kasms_offsite"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

DB_BACKUP_NAME="db_${TIMESTAMP}.dump"
MEDIA_BACKUP_NAME="media_${TIMESTAMP}.tar.gz"

# ── Helpers ───────────────────────────────────────────────────────────────────
alert() {
    echo "[offsite-backup] ALERT: $1"
}

# ── Preflight ─────────────────────────────────────────────────────────────────
if ! command -v rclone &>/dev/null; then
    alert "rclone not found. Install: curl https://rclone.org/install.sh | sudo bash"
    exit 1
fi

if ! rclone lsd "${RCLONE_REMOTE}:" &>/dev/null; then
    alert "rclone remote '${RCLONE_REMOTE}' not configured or unreachable. Run: rclone config"
    exit 1
fi

mkdir -p "${STAGING_DIR}"
trap 'rm -f "${STAGING_DIR}/${DB_BACKUP_NAME}" "${STAGING_DIR}/${MEDIA_BACKUP_NAME}"' EXIT

echo "============================================================"
echo "  KASMS Offsite Backup — $(date)"
echo "  Remote : ${RCLONE_DEST}"
echo "============================================================"

# ── Database Backup ───────────────────────────────────────────────────────────
echo ""
echo "[offsite-backup] Backing up PostgreSQL database..."
docker compose exec -T db \
    pg_dump \
        --username="${DB_USER}" \
        --dbname="${DB_NAME}" \
        --format=custom \
        --no-owner \
        --no-acl \
    > "${STAGING_DIR}/${DB_BACKUP_NAME}"

DB_SIZE=$(du -sh "${STAGING_DIR}/${DB_BACKUP_NAME}" | cut -f1)
echo "[offsite-backup]   Database backup: ${DB_SIZE}"

# Integrity check
TABLE_COUNT=$(pg_restore --list < "${STAGING_DIR}/${DB_BACKUP_NAME}" | grep -c "TABLE DATA" || true)
if [ "${TABLE_COUNT}" -lt 5 ]; then
    alert "Integrity check failed: only ${TABLE_COUNT} table dumps found. Aborting upload."
    exit 1
fi
echo "[offsite-backup]   Integrity OK (${TABLE_COUNT} tables)"

# ── Media Files Backup ────────────────────────────────────────────────────────
echo ""
echo "[offsite-backup] Backing up media files..."
docker run --rm \
    -v kasms_media_files:/media:ro \
    alpine \
    tar -czf - -C /media . \
    > "${STAGING_DIR}/${MEDIA_BACKUP_NAME}"

MEDIA_SIZE=$(du -sh "${STAGING_DIR}/${MEDIA_BACKUP_NAME}" | cut -f1)
echo "[offsite-backup]   Media backup: ${MEDIA_SIZE}"

# ── Upload to Remote ──────────────────────────────────────────────────────────
echo ""
echo "[offsite-backup] Uploading to ${RCLONE_DEST}/..."

rclone copy "${STAGING_DIR}/${DB_BACKUP_NAME}" "${RCLONE_DEST}/" \
    --retries 3 --low-level-retries 5

rclone copy "${STAGING_DIR}/${MEDIA_BACKUP_NAME}" "${RCLONE_DEST}/" \
    --retries 3 --low-level-retries 5

echo "[offsite-backup] Upload complete."

# ── Retention Policy (14 days) ────────────────────────────────────────────────
echo ""
echo "[offsite-backup] Applying retention (14 days)..."
rclone delete "${RCLONE_DEST}/" --min-age 14d --include "*.dump" 2>/dev/null || true
rclone delete "${RCLONE_DEST}/" --min-age 14d --include "*.tar.gz" 2>/dev/null || true
echo "[offsite-backup] Retention applied."

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "[offsite-backup] Current remote backups:"
rclone ls "${RCLONE_DEST}/" 2>/dev/null | tail -20

echo ""
echo "============================================================"
echo "  Offsite Backup COMPLETE — $(date)"
echo "  DB    : ${DB_BACKUP_NAME} (${DB_SIZE})"
echo "  Media : ${MEDIA_BACKUP_NAME} (${MEDIA_SIZE})"
echo "  Remote: ${RCLONE_DEST}/"
echo "============================================================"
