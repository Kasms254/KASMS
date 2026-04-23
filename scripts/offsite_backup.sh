#!/bin/bash
# =============================================================================
# Offsite Backup – KASMS
#
# Backs up PostgreSQL + media files to a remote destination via rclone.
# rclone supports: S3, Backblaze B2, Cloudflare R2, Google Drive, SFTP, and 40+ others.
#
# SETUP (run once on the server):
#   1. Install rclone:  curl https://rclone.org/install.sh | sudo bash
#   2. Configure:       rclone config
#      Name your remote "kasms-backup" (must match RCLONE_REMOTE below).
#      For Backblaze B2 (cheapest for backups at $0.006/GB/month):
#        rclone config → n → b2 → enter Application Key ID and Key
#      For Cloudflare R2 (free egress):
#        rclone config → n → s3 → Cloudflare → enter keys
#      For SFTP (backup to another server):
#        rclone config → n → sftp → enter host, user, key path
#   3. Create the bucket/folder on the remote.
#   4. Test:            rclone lsd kasms-backup:
#   5. Add to crontab:  crontab -e
#      0 2 * * * /path/to/KASMS/scripts/offsite_backup.sh >> /var/log/kasms_backup.log 2>&1
#
# Retention policy:
#   - Daily backups kept for 7 days
#   - Weekly backups (taken on Sunday) kept for 4 weeks
#   - Monthly backups (taken on the 1st) kept for 3 months
#   rclone does not natively enforce retention — this script handles it.
# =============================================================================
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
if [ -f "$(dirname "$0")/../.env" ]; then
    set -a; source "$(dirname "$0")/../.env"; set +a
fi

DB_NAME="${DB_NAME:-kasms_db}"
DB_USER="${DB_USER:-kasms_user}"

# Name of the rclone remote (set via `rclone config`, must match exactly).
RCLONE_REMOTE="${RCLONE_REMOTE:-kasms-backup}"

# Remote path: remote_name:bucket/subfolder
RCLONE_DEST="${RCLONE_REMOTE}:kasms/backups"

# Local temp directory for staging (must have enough space for the compressed backup).
STAGING_DIR="${BACKUP_STAGING_DIR:-/tmp/kasms_offsite}"

# Alert email (requires 'mail' command: sudo apt-get install mailutils)
ALERT_EMAIL="${BACKUP_ALERT_EMAIL:-}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)    # 1=Mon … 7=Sun
DAY_OF_MONTH=$(date +%-d)

# Determine backup tier (monthly > weekly > daily)
if [ "${DAY_OF_MONTH}" = "1" ]; then
    TIER="monthly"
elif [ "${DAY_OF_WEEK}" = "7" ]; then
    TIER="weekly"
else
    TIER="daily"
fi

DB_BACKUP_NAME="db_${TIER}_${TIMESTAMP}.sql.gz"
MEDIA_BACKUP_NAME="media_${TIER}_${TIMESTAMP}.tar.gz"

# ── Helpers ───────────────────────────────────────────────────────────────────
alert() {
    local msg="$1"
    echo "[offsite-backup] ALERT: ${msg}"
    if [ -n "${ALERT_EMAIL}" ]; then
        echo "${msg}" | mail -s "[KASMS] Backup Alert - $(hostname)" "${ALERT_EMAIL}" 2>/dev/null || true
    fi
}

# ── Preflight ─────────────────────────────────────────────────────────────────
if ! command -v rclone &>/dev/null; then
    alert "rclone not found. Install: curl https://rclone.org/install.sh | sudo bash"
    exit 1
fi

# Verify rclone remote is configured.
if ! rclone lsd "${RCLONE_REMOTE}:" &>/dev/null; then
    alert "rclone remote '${RCLONE_REMOTE}' not configured or unreachable. Run: rclone config"
    exit 1
fi

mkdir -p "${STAGING_DIR}"
trap 'rm -rf "${STAGING_DIR}/${DB_BACKUP_NAME}" "${STAGING_DIR}/${MEDIA_BACKUP_NAME}"' EXIT

echo "============================================================"
echo "  KASMS Offsite Backup — $(date)"
echo "  Tier     : ${TIER}"
echo "  Remote   : ${RCLONE_DEST}"
echo "============================================================"

# ── Database Backup ───────────────────────────────────────────────────────────
echo ""
echo "[offsite-backup] Backing up PostgreSQL database..."
docker compose exec -T db \
    pg_dump \
        --username="${DB_USER}" \
        --dbname="${DB_NAME}" \
        --format=plain \
        --no-owner \
        --no-acl \
| gzip -6 > "${STAGING_DIR}/${DB_BACKUP_NAME}"

DB_SIZE=$(du -sh "${STAGING_DIR}/${DB_BACKUP_NAME}" | cut -f1)
echo "[offsite-backup]   Database backup: ${DB_SIZE}"

# Verify DB backup
TABLE_COUNT=$(gunzip -c "${STAGING_DIR}/${DB_BACKUP_NAME}" | grep -c "^CREATE TABLE" || true)
if [ "${TABLE_COUNT}" -lt 5 ]; then
    alert "Database backup integrity check failed: only ${TABLE_COUNT} tables found. Aborting upload."
    exit 1
fi

# ── Media Files Backup ────────────────────────────────────────────────────────
echo ""
echo "[offsite-backup] Backing up media files..."
# Get the Docker volume's host path
MEDIA_VOLUME_PATH=$(docker volume inspect kasms_media_files \
    --format '{{.Mountpoint}}' 2>/dev/null || echo "")

if [ -n "${MEDIA_VOLUME_PATH}" ] && [ -d "${MEDIA_VOLUME_PATH}" ]; then
    tar -czf "${STAGING_DIR}/${MEDIA_BACKUP_NAME}" \
        -C "${MEDIA_VOLUME_PATH}" . \
        2>/dev/null || true
    MEDIA_SIZE=$(du -sh "${STAGING_DIR}/${MEDIA_BACKUP_NAME}" | cut -f1)
    echo "[offsite-backup]   Media backup: ${MEDIA_SIZE}"
else
    echo "[offsite-backup]   WARNING: Could not find media volume path. Skipping media backup."
    echo "[offsite-backup]   Run 'docker volume inspect kasms_media_files' to debug."
    MEDIA_BACKUP_NAME=""
fi

# ── Upload to Remote ──────────────────────────────────────────────────────────
echo ""
echo "[offsite-backup] Uploading to ${RCLONE_DEST}/${TIER}/..."

rclone copy \
    "${STAGING_DIR}/${DB_BACKUP_NAME}" \
    "${RCLONE_DEST}/${TIER}/" \
    --progress \
    --retries 3 \
    --low-level-retries 5

if [ -n "${MEDIA_BACKUP_NAME}" ] && [ -f "${STAGING_DIR}/${MEDIA_BACKUP_NAME}" ]; then
    rclone copy \
        "${STAGING_DIR}/${MEDIA_BACKUP_NAME}" \
        "${RCLONE_DEST}/${TIER}/" \
        --progress \
        --retries 3 \
        --low-level-retries 5
fi

echo "[offsite-backup] Upload complete."

# ── Apply Retention Policy ────────────────────────────────────────────────────
echo ""
echo "[offsite-backup] Applying retention policy..."

# Daily: delete files older than 7 days
rclone delete "${RCLONE_DEST}/daily/" \
    --min-age 7d --include "*.gz" 2>/dev/null || true

# Weekly: delete files older than 28 days (4 weeks)
rclone delete "${RCLONE_DEST}/weekly/" \
    --min-age 28d --include "*.gz" 2>/dev/null || true

# Monthly: delete files older than 90 days (3 months)
rclone delete "${RCLONE_DEST}/monthly/" \
    --min-age 90d --include "*.gz" 2>/dev/null || true

echo "[offsite-backup] Retention policy applied."

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "[offsite-backup] Listing current remote backups:"
rclone ls "${RCLONE_DEST}/" 2>/dev/null | tail -20

echo ""
echo "============================================================"
echo "  Offsite Backup COMPLETE — $(date)"
echo "  Tier       : ${TIER}"
echo "  DB backup  : ${DB_BACKUP_NAME} (${DB_SIZE})"
if [ -n "${MEDIA_BACKUP_NAME}" ]; then
    echo "  Media      : ${MEDIA_BACKUP_NAME}"
fi
echo "  Remote     : ${RCLONE_DEST}/${TIER}/"
echo "============================================================"
