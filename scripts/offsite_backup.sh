#!/bin/bash
# =============================================================================
# Offsite Backup – KASMS
#
# Backs up PostgreSQL (custom format) + media files to a remote via rclone.
# Both artifacts are streamed through `age` and encrypted before they ever
# touch disk — the staging directory only ever holds .age ciphertext, never
# a plaintext dump or tarball, even transiently. Retention: 14 days.
#
# Requires an age key to already exist (run once): sudo ./scripts/generate_age_key.sh
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/backup_encryption.sh"

DB_NAME="${DB_NAME:-kasms_db}"
DB_USER="${DB_USER:-kasms_user}"

RCLONE_REMOTE="${RCLONE_REMOTE:-kasms-backup}"
RCLONE_DEST="${RCLONE_REMOTE}:kasms-backups"

STAGING_DIR="/tmp/kasms_offsite"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

DB_BACKUP_NAME="db_${TIMESTAMP}.dump.age"
MEDIA_BACKUP_NAME="media_${TIMESTAMP}.tar.gz.age"

# ── Helpers ───────────────────────────────────────────────────────────────────
alert() {
    echo "[offsite-backup] ALERT: $1"
}

# ── Preflight ─────────────────────────────────────────────────────────────────
require_age_encryption

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

# ── Database Backup (encrypted, streamed — never written to disk in plain) ───
echo ""
echo "[offsite-backup] Backing up PostgreSQL database..."
DB_OUT="${STAGING_DIR}/${DB_BACKUP_NAME}"
set +e
docker compose exec -T db \
    pg_dump \
        --username="${DB_USER}" \
        --dbname="${DB_NAME}" \
        --format=custom \
        --no-owner \
        --no-acl \
    | age -R "${AGE_RECIPIENTS_FILE}" -o "${DB_OUT}"
PIPE_STATUSES=("${PIPESTATUS[@]}")
set -e
if ! check_pipeline_status "${DB_OUT}" "${PIPE_STATUSES[@]}"; then
    alert "Database backup/encryption failed. Aborting before upload."
    exit 1
fi

DB_SIZE=$(du -sh "${DB_OUT}" | cut -f1)
echo "[offsite-backup]   Database backup: ${DB_SIZE} (encrypted)"

# Integrity check — only possible while the private key is still on this
# host. Once it's moved to offline storage (see BACKUP_ENCRYPTION.md), this
# step is skipped; that's expected, not an error — verify those backups
# from the offline key instead (e.g. a periodic restore drill).
if age_key_available; then
    TABLE_COUNT=$(age -d -i "${AGE_KEY_FILE}" "${DB_OUT}" 2>/dev/null \
        | docker compose exec -T db pg_restore --list 2>/dev/null \
        | grep -c "TABLE DATA" || true)
    if [ "${TABLE_COUNT}" -lt 5 ]; then
        alert "Integrity check failed: only ${TABLE_COUNT} table dumps found. Aborting upload."
        exit 1
    fi
    echo "[offsite-backup]   Integrity OK (${TABLE_COUNT} tables)"
else
    echo "[offsite-backup]   Private key not present locally — skipping decrypt-verify (expected once the key has been moved offline)."
fi

# ── Media Files Backup (encrypted, streamed) ──────────────────────────────────
echo ""
echo "[offsite-backup] Backing up media files..."
MEDIA_OUT="${STAGING_DIR}/${MEDIA_BACKUP_NAME}"
set +e
docker run --rm \
    -v kasms_media_files:/media:ro \
    alpine \
    tar -czf - -C /media . \
    | age -R "${AGE_RECIPIENTS_FILE}" -o "${MEDIA_OUT}"
PIPE_STATUSES=("${PIPESTATUS[@]}")
set -e
if ! check_pipeline_status "${MEDIA_OUT}" "${PIPE_STATUSES[@]}"; then
    alert "Media backup/encryption failed. Aborting before upload."
    exit 1
fi

MEDIA_SIZE=$(du -sh "${MEDIA_OUT}" | cut -f1)
echo "[offsite-backup]   Media backup: ${MEDIA_SIZE} (encrypted)"

# ── Upload to Remote ──────────────────────────────────────────────────────────
echo ""
echo "[offsite-backup] Uploading to ${RCLONE_DEST}/..."

rclone copy "${DB_OUT}" "${RCLONE_DEST}/" \
    --retries 3 --low-level-retries 5

rclone copy "${MEDIA_OUT}" "${RCLONE_DEST}/" \
    --retries 3 --low-level-retries 5

echo "[offsite-backup] Upload complete."

# ── Retention Policy (14 days) ────────────────────────────────────────────────
echo ""
echo "[offsite-backup] Applying retention (14 days)..."
rclone delete "${RCLONE_DEST}/" --min-age 14d --include "*.dump.age" 2>/dev/null || true
rclone delete "${RCLONE_DEST}/" --min-age 14d --include "*.tar.gz.age" 2>/dev/null || true
echo "[offsite-backup] Retention applied."
echo "[offsite-backup] NOTE: pre-encryption backups (plain *.dump / *.tar.gz)"
echo "[offsite-backup] uploaded before this change are NOT matched by the"
echo "[offsite-backup] patterns above and must be purged manually — see"
echo "[offsite-backup] BACKUP_ENCRYPTION.md for the one-time cleanup steps."

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
