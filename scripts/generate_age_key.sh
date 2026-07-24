
set -euo pipefail

AGE_DIR="${AGE_DIR:-/etc/kasms/age}"
AGE_KEY_FILE="${AGE_KEY_FILE:-${AGE_DIR}/backup-key.txt}"
AGE_RECIPIENTS_FILE="${AGE_RECIPIENTS_FILE:-${AGE_DIR}/recipients.txt}"

if ! command -v age-keygen &>/dev/null; then
    echo "[keygen] ERROR: age-keygen not found."
    echo "[keygen] Install age first:"
    echo "[keygen]   Ubuntu 22.10+/Debian 12+: sudo apt-get install -y age"
    echo "[keygen]   Older Ubuntu: download the official release from"
    echo "[keygen]   https://github.com/FiloSottile/age/releases and verify"
    echo "[keygen]   its checksum before installing."
    exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
    echo "[keygen] WARNING: not running as root. The key directory should be"
    echo "[keygen] root-owned; re-run with sudo unless you've deliberately"
    echo "[keygen] chosen a different ownership model."
fi

mkdir -p "${AGE_DIR}"
chmod 700 "${AGE_DIR}"

if [ -f "${AGE_KEY_FILE}" ]; then
    echo "[keygen] Key already exists at ${AGE_KEY_FILE} — not regenerating."
    echo "[keygen] (Delete it manually first if you intend to rotate the key —"
    echo "[keygen]  see the key rotation section in BACKUP_ENCRYPTION.md before"
    echo "[keygen]  doing so, since old backups only decrypt with the old key.)"
else
    echo "[keygen] Generating new age keypair at ${AGE_KEY_FILE}..."
    # age-keygen writes the private key (with the public key as a comment)
    # to stdout; redirect straight to the target file with a private umask
    # so no other user can read it while it's being written.
    ( umask 077 && age-keygen -o "${AGE_KEY_FILE}" )
    chmod 600 "${AGE_KEY_FILE}"
    echo "[keygen] Private key written: ${AGE_KEY_FILE} (mode 600)"
fi

echo "[keygen] Writing public recipients file: ${AGE_RECIPIENTS_FILE}"
age-keygen -y "${AGE_KEY_FILE}" > "${AGE_RECIPIENTS_FILE}"
chmod 644 "${AGE_RECIPIENTS_FILE}"

echo ""
echo "============================================================"
echo "  age key ready"
echo "  Private key (SECRET, root-only) : ${AGE_KEY_FILE}"
echo "  Public recipients (safe to read): ${AGE_RECIPIENTS_FILE}"
echo ""
echo "  Backup scripts only need the recipients file and will find it"
echo "  automatically at the default path above (override with"
echo "  AGE_RECIPIENTS_FILE=... in .env if you move it)."
echo ""
echo "  IMPORTANT: back up ${AGE_KEY_FILE} to secure offline storage"
echo "  (e.g. an encrypted USB drive in a safe, or a password manager"
echo "  vault) now. Losing it means every existing .age backup becomes"
echo "  permanently unrecoverable. See BACKUP_ENCRYPTION.md for the"
echo "  recommended offline-migration procedure."
echo "============================================================"
