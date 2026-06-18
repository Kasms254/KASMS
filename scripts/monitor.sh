#!/bin/bash
# =============================================================================
# KASMS Production Monitor
#
# Checks: Django health endpoint, all Docker containers, disk usage, SSL expiry.
# Sends email alert if any check fails.
#
# SETUP:
#   1. Install mail client:  sudo apt-get install -y mailutils
#   2. Configure .env with MONITOR_ALERT_EMAIL and DOMAIN.
#   3. Add to crontab (runs every 5 minutes):
#        crontab -e
#        */5 * * * * /path/to/KASMS/scripts/monitor.sh >> /var/log/kasms_monitor.log 2>&1
#   4. Optional Slack webhook:
#        Set MONITOR_SLACK_WEBHOOK=https://hooks.slack.com/services/... in .env
#
# Exit codes:  0 = all OK,  1 = one or more checks failed
# =============================================================================
set -euo pipefail

# ── Load config ───────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "${SCRIPT_DIR}")"

if [ -f "${PROJECT_DIR}/.env" ]; then
    set -a; source "${PROJECT_DIR}/.env"; set +a
fi

DOMAIN="${DOMAIN:-localhost}"
ALERT_EMAIL="${MONITOR_ALERT_EMAIL:-}"
SLACK_WEBHOOK="${MONITOR_SLACK_WEBHOOK:-}"
HEALTH_URL="https://${DOMAIN}/health/"
DISK_WARN_PCT="${MONITOR_DISK_WARN:-80}"
DISK_CRIT_PCT="${MONITOR_DISK_CRIT:-90}"
SSL_WARN_DAYS="${MONITOR_SSL_WARN_DAYS:-21}"

# ── State ─────────────────────────────────────────────────────────────────────
FAILURES=()
WARNINGS=()
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

cd "${PROJECT_DIR}"

# ── Helper: send alert ────────────────────────────────────────────────────────
send_alert() {
    local subject="$1"
    local body="$2"
    local level="${3:-CRITICAL}"   # CRITICAL or WARNING

    echo "[monitor][${level}] ${subject}"
    echo "${body}"

    if [ -n "${ALERT_EMAIL}" ]; then
        printf "%s\n\nServer: %s\nTime: %s\n\n%s" \
            "${subject}" "$(hostname)" "${TIMESTAMP}" "${body}" \
        | mail -s "[KASMS][${level}] ${subject}" "${ALERT_EMAIL}" 2>/dev/null || true
    fi

    if [ -n "${SLACK_WEBHOOK}" ]; then
        local emoji=":red_circle:"
        [ "${level}" = "WARNING" ] && emoji=":warning:"
        curl -s -X POST "${SLACK_WEBHOOK}" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"${emoji} *[KASMS][${level}]* ${subject}\n${body}\"}" \
            --max-time 10 >/dev/null 2>&1 || true
    fi
}

# ── Check 1: Django /health/ endpoint ────────────────────────────────────────
check_health_endpoint() {
    local http_code
    http_code=$(curl -s -o /tmp/kasms_health_resp.json \
        -w "%{http_code}" \
        --max-time 10 \
        --connect-timeout 5 \
        "${HEALTH_URL}" 2>/dev/null || echo "000")

    if [ "${http_code}" = "200" ]; then
        echo "[monitor][OK] Health endpoint: 200"
    elif [ "${http_code}" = "503" ]; then
        local detail
        detail=$(cat /tmp/kasms_health_resp.json 2>/dev/null || echo "no response body")
        FAILURES+=("Health endpoint returned 503 (degraded): ${detail}")
    elif [ "${http_code}" = "000" ]; then
        FAILURES+=("Health endpoint unreachable (connection refused or DNS failure) — URL: ${HEALTH_URL}")
    else
        FAILURES+=("Health endpoint returned unexpected HTTP ${http_code}")
    fi
    rm -f /tmp/kasms_health_resp.json
}

# ── Check 2: Docker container status ─────────────────────────────────────────
check_docker_containers() {
    local required_services=("db" "redis" "backend" "celery_worker" "celery_beat" "nginx")

    for svc in "${required_services[@]}"; do
        local status
        status=$(docker compose ps --format json "${svc}" 2>/dev/null | \
            python3 -c "
import sys, json
data = sys.stdin.read().strip()
if not data:
    print('missing')
    sys.exit(0)
# docker compose ps --format json outputs one JSON object per line
for line in data.splitlines():
    try:
        obj = json.loads(line)
        state = obj.get('State', obj.get('Status', 'unknown'))
        health = obj.get('Health', '')
        if health:
            print(f'{state}/{health}')
        else:
            print(state)
        sys.exit(0)
    except Exception:
        pass
print('unknown')
" 2>/dev/null || echo "unknown")

        case "${status}" in
            "running/healthy"|"running")
                echo "[monitor][OK] Container ${svc}: ${status}"
                ;;
            "running/starting")
                WARNINGS+=("Container ${svc} is still starting up (may be OK if recently deployed)")
                ;;
            "running/unhealthy")
                FAILURES+=("Container ${svc} is running but UNHEALTHY. Check: docker compose logs ${svc}")
                ;;
            "exited"*|"dead"*)
                FAILURES+=("Container ${svc} has EXITED. Restart: docker compose up -d ${svc}")
                ;;
            "missing")
                FAILURES+=("Container ${svc} not found. Start: docker compose up -d ${svc}")
                ;;
            *)
                WARNINGS+=("Container ${svc} in unexpected state: ${status}")
                ;;
        esac
    done
}

# ── Check 3: Disk usage ───────────────────────────────────────────────────────
check_disk_usage() {
    # Check all mount points that are at least 1GB in size.
    while IFS= read -r line; do
        local pct mount
        pct=$(echo "${line}" | awk '{print $5}' | tr -d '%')
        mount=$(echo "${line}" | awk '{print $6}')

        if [ "${pct}" -ge "${DISK_CRIT_PCT}" ]; then
            FAILURES+=("DISK CRITICAL: ${mount} is ${pct}% full. Free space immediately.")
        elif [ "${pct}" -ge "${DISK_WARN_PCT}" ]; then
            WARNINGS+=("DISK WARNING: ${mount} is ${pct}% full.")
        else
            echo "[monitor][OK] Disk ${mount}: ${pct}%"
        fi
    done < <(df -h --output=size,used,avail,pcent,target | awk 'NR>1 && $1 ~ /G/ {print}')

    # Also check Docker volume usage specifically.
    local docker_root
    docker_root=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo "/var/lib/docker")
    local docker_pct
    docker_pct=$(df "${docker_root}" --output=pcent | tail -1 | tr -d '% ')
    echo "[monitor][INFO] Docker root (${docker_root}): ${docker_pct}% disk used"
}

# ── Check 4: SSL certificate expiry ──────────────────────────────────────────
check_ssl_expiry() {
    if ! command -v openssl &>/dev/null; then
        echo "[monitor][SKIP] openssl not found — skipping SSL check"
        return
    fi

    local expiry_date days_left
    expiry_date=$(echo | openssl s_client -servername "${DOMAIN}" \
        -connect "${DOMAIN}:443" 2>/dev/null | \
        openssl x509 -noout -enddate 2>/dev/null | \
        cut -d= -f2 || echo "")

    if [ -z "${expiry_date}" ]; then
        WARNINGS+=("Could not check SSL certificate for ${DOMAIN}. Verify HTTPS is working.")
        return
    fi

    days_left=$(( ( $(date -d "${expiry_date}" +%s) - $(date +%s) ) / 86400 ))

    if [ "${days_left}" -le 7 ]; then
        FAILURES+=("SSL certificate for ${DOMAIN} expires in ${days_left} days! Check certbot: docker compose logs certbot")
    elif [ "${days_left}" -le "${SSL_WARN_DAYS}" ]; then
        WARNINGS+=("SSL certificate for ${DOMAIN} expires in ${days_left} days. Auto-renewal should trigger soon.")
    else
        echo "[monitor][OK] SSL cert for ${DOMAIN}: expires in ${days_left} days"
    fi
}

# ── Check 5: Redis memory usage ───────────────────────────────────────────────
check_redis_memory() {
    local used_pct
    used_pct=$(docker compose exec -T redis \
        redis-cli -a "${REDIS_PASSWORD:-}" info memory 2>/dev/null | \
        python3 -c "
import sys
lines = sys.stdin.read()
used = 0
max_mem = 0
for line in lines.splitlines():
    if line.startswith('used_memory:'):
        used = int(line.split(':')[1].strip())
    if line.startswith('maxmemory:'):
        max_mem = int(line.split(':')[1].strip())
if max_mem > 0:
    pct = int(used * 100 / max_mem)
    print(pct)
else:
    print(-1)
" 2>/dev/null || echo "-1")

    if [ "${used_pct}" = "-1" ]; then
        echo "[monitor][SKIP] Could not read Redis memory stats"
    elif [ "${used_pct}" -ge 90 ]; then
        FAILURES+=("Redis memory ${used_pct}% full. Tasks may start being evicted. Increase maxmemory in docker-compose.yml.")
    elif [ "${used_pct}" -ge 75 ]; then
        WARNINGS+=("Redis memory ${used_pct}% full.")
    else
        echo "[monitor][OK] Redis memory: ${used_pct}%"
    fi
}

# ── Run all checks ────────────────────────────────────────────────────────────
echo "========================================"
echo "  KASMS Monitor — ${TIMESTAMP}"
echo "========================================"

check_health_endpoint
check_docker_containers
check_disk_usage
check_ssl_expiry
check_redis_memory

# ── Report results ────────────────────────────────────────────────────────────
echo ""
echo "----------------------------------------"

if [ ${#FAILURES[@]} -gt 0 ]; then
    echo "RESULT: FAILED (${#FAILURES[@]} failure(s), ${#WARNINGS[@]} warning(s))"
    echo ""
    echo "FAILURES:"
    for f in "${FAILURES[@]}"; do
        echo "  ✗ ${f}"
    done
    if [ ${#WARNINGS[@]} -gt 0 ]; then
        echo ""
        echo "WARNINGS:"
        for w in "${WARNINGS[@]}"; do
            echo "  ! ${w}"
        done
    fi

    # Send a single consolidated alert with all failures.
    ALERT_BODY="$(printf '%s\n' "${FAILURES[@]}")"
    if [ ${#WARNINGS[@]} -gt 0 ]; then
        ALERT_BODY+="$(printf '\n\nWarnings:\n%s' "$(printf '%s\n' "${WARNINGS[@]}")")"
    fi
    send_alert "$(hostname): ${#FAILURES[@]} check(s) FAILED" "${ALERT_BODY}" "CRITICAL"
    exit 1

elif [ ${#WARNINGS[@]} -gt 0 ]; then
    echo "RESULT: WARNING (${#WARNINGS[@]} warning(s))"
    for w in "${WARNINGS[@]}"; do
        echo "  ! ${w}"
    done
    WARN_BODY="$(printf '%s\n' "${WARNINGS[@]}")"
    send_alert "$(hostname): ${#WARNINGS[@]} warning(s)" "${WARN_BODY}" "WARNING"
    exit 0

else
    echo "RESULT: ALL CHECKS PASSED"
    exit 0
fi
