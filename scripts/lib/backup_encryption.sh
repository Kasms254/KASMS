# =============================================================================
# Shared age-encryption helpers for KASMS backup/restore scripts.
#
# Source this file (do not execute it directly):
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "${SCRIPT_DIR}/lib/backup_encryption.sh"
#
# Requires: `set -euo pipefail` and bash (uses PIPESTATUS) in the caller.
# =============================================================================

AGE_DIR="${AGE_DIR:-/etc/kasms/age}"
AGE_KEY_FILE="${AGE_KEY_FILE:-${AGE_DIR}/backup-key.txt}"
AGE_RECIPIENTS_FILE="${AGE_RECIPIENTS_FILE:-${AGE_DIR}/recipients.txt}"

# Call once near the top of any script that ENCRYPTS a backup. Only needs
# the public recipients file — never the private key.
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

# Call once near the top of any script that DECRYPTS (restores) a backup.
# This one does need the private key.
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

# True (exit 0) if the private key is present on this host. Backups use
# this to decide whether a decrypt-based integrity check is possible —
# a missing key is NOT an error here, it's the expected end state once an
# operator has followed the offline-key-migration steps in
# BACKUP_ENCRYPTION.md, so callers should degrade to a warning, not fail.
age_key_available() {
    [ -f "${AGE_KEY_FILE}" ]
}

# check_pipeline_status <output_file> <status...>
#
# Call immediately after a pipeline like:
#
#   set +e
#   pg_dump ... | age -R "${AGE_RECIPIENTS_FILE}" -o "${OUT}"
#   PIPE_STATUSES=("${PIPESTATUS[@]}")
#   set -e
#   check_pipeline_status "${OUT}" "${PIPE_STATUSES[@]}"
#
# IMPORTANT: do NOT write `pipeline || true` to suppress `set -e` here. With
# `pipefail` active (as all callers have it), a failing pipeline followed by
# `|| true` runs `true` as a separate fallback pipeline, which silently
# overwrites PIPESTATUS down to just `true`'s own exit code (0) — so a real
# pg_dump/age failure would never be detected. Bracketing with `set +e` /
# `set -e` instead runs the pipeline without triggering errexit AND leaves
# PIPESTATUS holding the real per-stage exit codes.
#
# Deletes the partial/corrupt output file and returns non-zero if any stage
# of the pipeline failed; this is what prevents a truncated backup (e.g.
# pg_dump died but age still saw a clean EOF and exited 0) from being kept,
# uploaded, or counted as a successful backup.
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
