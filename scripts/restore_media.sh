
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/backup_encryption.sh"

BACKUP_FILE="${1:-}"
if [ -z "${BACKUP_FILE}" ]; then
    echo "Usage: $0 <media_backup.tar.gz[.age]> [--yes]"
    echo "Example: $0 /var/backups/kasms/media_20260518_010000.tar.gz.age"
    exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "ERROR: Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

AUTO_YES=0
for arg in "$@"; do
    if [ "${arg}" = "--yes" ]; then
        AUTO_YES=1
    fi
done

ENCRYPTED=0
if [[ "${BACKUP_FILE}" == *.age ]]; then
    ENCRYPTED=1
    require_age_decryption
fi

if [ -f .env ]; then
    set -a; source .env; set +a
fi

MEDIA_VOLUME="${MEDIA_VOLUME:-kasms_media_files}"
BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)

echo "============================================================"
echo "  KASMS Media Restore"
echo "  Backup file : ${BACKUP_FILE} (${BACKUP_SIZE})"
echo "  Encrypted   : $([ "${ENCRYPTED}" -eq 1 ] && echo yes || echo no)"
echo "  Target vol  : ${MEDIA_VOLUME}"
echo "============================================================"
echo ""
echo "WARNING: This extracts the archive into the '${MEDIA_VOLUME}' Docker"
echo "volume, overwriting any file at the same path. It does NOT delete"
echo "files already in the volume that aren't in the archive."
echo ""

if [ "${AUTO_YES}" -ne 1 ]; then
    read -p "Are you sure? Type 'yes' to continue: " CONFIRM
    if [ "${CONFIRM}" != "yes" ]; then
        echo "Aborted."
        exit 1
    fi
fi

echo ""
echo "[restore-media] Extracting into ${MEDIA_VOLUME}..."
if [ "${ENCRYPTED}" -eq 1 ]; then
    age -d -i "${AGE_KEY_FILE}" "${BACKUP_FILE}" | \
    docker run --rm -i -v "${MEDIA_VOLUME}:/media" alpine \
        tar -xzf - -C /media
else
    docker run --rm -i -v "${MEDIA_VOLUME}:/media" alpine \
        tar -xzf - -C /media \
        < "${BACKUP_FILE}"
fi

echo ""
echo "============================================================"
echo "  Media restore COMPLETE."
echo "  Verify: docker run --rm -v ${MEDIA_VOLUME}:/media alpine ls -la /media"
echo "============================================================"
