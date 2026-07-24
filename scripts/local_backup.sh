#!/bin/bash
# =============================================================================
# Local Backup – KASMS
#
# Backs up PostgreSQL DB, media files, and config to /var/backups/kasms/.
# Every artifact is streamed through `age` and encrypted before it ever
# touches disk — no plaintext dump, tarball, or .env copy is ever written.
# Retention: 14 days.
#
# Requires an age key to already exist (run once): sudo ./scripts/generate_age_key.sh
#
# Add to crontab (run as kasms user):
#   0 1 * * * /var/www/KASMS/scripts/local_backup.sh
# =============================================================================
set -euo pipefail

cd /var/www/KASMS
if [ -f .env ]; then set -a; source .env; set +a; fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/backup_encryption.sh"

DB_NAME="${DB_NAME:-kasms_db}"
DB_USER="${DB_USER:-kasms_user}"
BACKUP_BASE="/var/backups/kasms"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOGFILE="/var/log/kasms_backup.log"

exec >> "$LOGFILE" 2>&1
echo "========================================"
echo "LOCAL BACKUP STARTED: $(date)"

require_age_encryption
mkdir -p "${BACKUP_BASE}"

FAILED=0

# Database
echo "--- Database ---"
DB_OUT="${BACKUP_BASE}/db_${TIMESTAMP}.dump.age"
set +e
docker compose exec -T db \
    pg_dump --username="${DB_USER}" --dbname="${DB_NAME}" \
    --format=custom --no-owner --no-acl \
    | age -R "${AGE_RECIPIENTS_FILE}" -o "${DB_OUT}"
PIPE_STATUSES=("${PIPESTATUS[@]}")
set -e
if check_pipeline_status "${DB_OUT}" "${PIPE_STATUSES[@]}"; then
    echo "DB: $(du -sh "${DB_OUT}" | cut -f1) (encrypted)"
else
    FAILED=1
fi

# Media
echo "--- Media ---"
MEDIA_OUT="${BACKUP_BASE}/media_${TIMESTAMP}.tar.gz.age"
set +e
docker run --rm \
    -v kasms_media_files:/media:ro \
    alpine \
    tar -czf - -C /media . \
    | age -R "${AGE_RECIPIENTS_FILE}" -o "${MEDIA_OUT}"
PIPE_STATUSES=("${PIPESTATUS[@]}")
set -e
if check_pipeline_status "${MEDIA_OUT}" "${PIPE_STATUSES[@]}"; then
    echo "Media: $(du -sh "${MEDIA_OUT}" | cut -f1) (encrypted)"
else
    FAILED=1
fi

# Config (includes .env — this is secrets material, always encrypt)
echo "--- Config ---"
CONFIG_OUT="${BACKUP_BASE}/config_${TIMESTAMP}.tar.gz.age"
set +e
tar -czf - -C / \
    var/www/KASMS/.env \
    var/www/KASMS/docker-compose.yml \
    var/www/KASMS/Dockerfile 2>/dev/null \
    | age -R "${AGE_RECIPIENTS_FILE}" -o "${CONFIG_OUT}"
PIPE_STATUSES=("${PIPESTATUS[@]}")
set -e
# tar exits 2 (not fatal) when some of the listed files don't exist, e.g. no
# Dockerfile in this checkout — archive whatever it found. Only a hard tar
# failure (anything else non-zero) or an age failure should abort this leg.
if [ "${PIPE_STATUSES[0]}" -eq 2 ]; then
    PIPE_STATUSES[0]=0
fi
if check_pipeline_status "${CONFIG_OUT}" "${PIPE_STATUSES[@]}"; then
    echo "Config: $(du -sh "${CONFIG_OUT}" | cut -f1) (encrypted)"
else
    FAILED=1
fi

# Retention — keep 14 days (applies to .age artifacts only; nothing else
# is ever written to this directory)
find "${BACKUP_BASE}" -type f -name '*.age' -mtime +14 -delete

if [ "${FAILED}" -ne 0 ]; then
    echo "LOCAL BACKUP FINISHED WITH ERRORS: $(date)"
    echo "========================================"
    exit 1
fi

echo "LOCAL BACKUP FINISHED: $(date)"
echo "========================================"
