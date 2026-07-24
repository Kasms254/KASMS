

AGE_DIR="${AGE_DIR:-/etc/kasms/age}"
AGE_KEY_FILE="${AGE_KEY_FILE:-${AGE_DIR}/backup-key.txt}"
AGE_RECIPIENTS_FILE="${AGE_RECIPIENTS_FILE:-${AGE_DIR}/recipients.txt}"


require_age_encryption() {
    if ! command -v age &>/dev/null; then
        echo "[backup] ERROR: 'age' is not installed. Install it, then run" >&2
        echo "[backup] scripts/generate_age_key.sh once to create a key." >&2
        exit 1
    fi
    if [ ! -f "${AGE_RECIPIENTS_FILE}" ]; then
        echo "[backup] ERROR: recipients file not found: ${AGE_RECIPIENTS_FILE}" >&2
        echo "[backup] Run: sudo ./scripts/generate_age_key.sh" >&2
        exit 1
    fi
}


require_age_decryption() {
    if ! command -v age &>/dev/null; then
        echo "[restore] ERROR: 'age' is not installed." >&2
        exit 1
    fi
    if [ ! -f "${AGE_KEY_FILE}" ]; then
        echo "[restore] ERROR: private key not found: ${AGE_KEY_FILE}" >&2
        echo "[restore] If it was moved to offline storage, copy it back" >&2
        echo "[restore] temporarily (or point AGE_KEY_FILE at it) to restore." >&2
        exit 1
    fi
}

age_key_available() {
    [ -f "${AGE_KEY_FILE}" ]
}


check_pipeline_status() {
    local out_file="$1"; shift
    local status
    for status in "$@"; do
        if [ "${status}" -ne 0 ]; then
            echo "[backup] ERROR: backup pipeline failed (exit codes: $*)." >&2
            echo "[backup] Removing partial/incomplete output: ${out_file}" >&2
            rm -f "${out_file}"
            return 1
        fi
    done
    return 0
}
