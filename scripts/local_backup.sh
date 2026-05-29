#!/bin/bash
# =============================================================================
# Local Backup – KASMS
#
# Backs up PostgreSQL DB, media files, and config to /var/backups/kasms/.
# Retention: 14 days.
#
# Add to crontab (run as kasms user):
#   0 1 * * * /var/www/KASMS/scripts/local_backup.sh
# =============================================================================
set -euo pipefail

cd /var/www/KASMS
if [ -f .env ]; then set -a; source .env; set +a; fi

DB_NAME="${DB_NAME:-kasms_db}"
DB_USER="${DB_USER:-kasms_user}"
BACKUP_BASE="/var/backups/kasms"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOGFILE="/var/log/kasms_backup.log"

exec >> "$LOGFILE" 2>&1
echo "========================================"
echo "LOCAL BACKUP STARTED: $(date)"

mkdir -p "${BACKUP_BASE}"

# Database
echo "--- Database ---"
docker compose exec -T db \
    pg_dump --username="${DB_USER}" --dbname="${DB_NAME}" \
    --format=custom --no-owner --no-acl \
    > "${BACKUP_BASE}/db_${TIMESTAMP}.dump"
echo "DB: $(du -sh ${BACKUP_BASE}/db_${TIMESTAMP}.dump | cut -f1)"

# Media
echo "--- Media ---"
docker run --rm \
    -v kasms_media_files:/media:ro \
    alpine \
    tar -czf - -C /media . \
    > "${BACKUP_BASE}/media_${TIMESTAMP}.tar.gz"
echo "Media: $(du -sh ${BACKUP_BASE}/media_${TIMESTAMP}.tar.gz | cut -f1)"

# Config
echo "--- Config ---"
tar -czf "${BACKUP_BASE}/config_${TIMESTAMP}.tar.gz" \
    /var/www/KASMS/.env \
    /var/www/KASMS/docker-compose.yml \
    /var/www/KASMS/Dockerfile 2>/dev/null || true
echo "Config: $(du -sh ${BACKUP_BASE}/config_${TIMESTAMP}.tar.gz | cut -f1)"

# Retention — keep 14 days
find "${BACKUP_BASE}" -type f -mtime +14 -delete

echo "LOCAL BACKUP FINISHED: $(date)"
echo "========================================"
