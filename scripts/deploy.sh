#!/bin/bash
# =============================================================================
# Full Deployment Script – KASMS
#
# Run this on the NEW server after:
#   1. Installing Docker + Docker Compose (see README or deployment guide)
#   2. Cloning the repository
#   3. Creating .env from .env.example with all values filled in
#
# Usage:
#   chmod +x scripts/deploy.sh
#   ./scripts/deploy.sh
#
# Flags:
#   --skip-build     Skip docker compose build (use existing images)
#   --skip-ssl       Skip Let's Encrypt setup (e.g., using Cloudflare)
#   --restore FILE   Restore database from a backup file before starting
# =============================================================================
set -euo pipefail

SKIP_BUILD=0
SKIP_SSL=0
RESTORE_FILE=""

# ── Parse arguments ───────────────────────────────────────────────────────────
for arg in "$@"; do
    case $arg in
        --skip-build) SKIP_BUILD=1 ;;
        --skip-ssl)   SKIP_SSL=1   ;;
        --restore=*)  RESTORE_FILE="${arg#*=}" ;;
        *) echo "Unknown argument: $arg"; exit 1 ;;
    esac
done

# ── Preflight checks ─────────────────────────────────────────────────────────
echo "============================================================"
echo "  KASMS Production Deployment"
echo "============================================================"
echo ""

if [ ! -f .env ]; then
    echo "ERROR: .env file not found."
    echo "  Run: cp .env.example .env"
    echo "  Then fill in all <REPLACE: ...> values."
    exit 1
fi

if grep -q "<REPLACE:" .env; then
    echo "ERROR: .env still contains placeholder values (<REPLACE: ...>)."
    echo "  Fill in all required values before deploying."
    grep "<REPLACE:" .env | while read -r line; do
        echo "    → ${line}"
    done
    exit 1
fi

# Load env for script use
set -a; source .env; set +a

# Check Docker
if ! command -v docker &>/dev/null; then
    echo "ERROR: Docker is not installed."
    echo "  Run: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

if ! docker compose version &>/dev/null; then
    echo "ERROR: Docker Compose v2 is not installed."
    echo "  Run: sudo apt-get install docker-compose-plugin"
    exit 1
fi

echo "[deploy] Preflight checks passed."
echo ""

# ── Step 1: Build images ─────────────────────────────────────────────────────
if [ "${SKIP_BUILD}" = "0" ]; then
    echo "[deploy] Step 1/6: Building Docker images..."
    echo "  This includes building the React app inside Docker."
    echo "  First build takes 5-15 minutes depending on internet speed."
    docker compose build --no-cache --parallel
    echo "[deploy] Build complete."
else
    echo "[deploy] Step 1/6: Skipping build (--skip-build)."
fi
echo ""

# ── Step 2: Start database and Redis only ────────────────────────────────────
echo "[deploy] Step 2/6: Starting database and Redis..."
docker compose up -d db redis
echo "[deploy] Waiting for services to be healthy..."
sleep 10
docker compose ps db redis
echo ""

# ── Step 3: Restore database (if --restore was passed) ───────────────────────
if [ -n "${RESTORE_FILE}" ]; then
    echo "[deploy] Step 3/6: Restoring database from: ${RESTORE_FILE}"
    chmod +x scripts/restore_db.sh
    ./scripts/restore_db.sh "${RESTORE_FILE}"
else
    echo "[deploy] Step 3/6: No --restore flag – starting with a fresh database."
    echo "  (Migrations will run automatically when the backend starts.)"
fi
echo ""

# ── Step 4: Start all application services ───────────────────────────────────
echo "[deploy] Step 4/6: Starting all services..."
docker compose up -d backend celery_worker celery_beat

echo "[deploy] Waiting for backend to finish migrations (up to 120s)..."
BACKEND_READY=0
for i in $(seq 1 40); do
    if docker compose exec -T backend \
        python manage.py shell -c "print('ok')" &>/dev/null 2>&1; then
        BACKEND_READY=1
        break
    fi
    sleep 3
done

if [ "${BACKEND_READY}" = "0" ]; then
    echo "[deploy] WARNING: Backend did not become ready in time."
    echo "  Check logs: docker compose logs backend"
else
    echo "[deploy] Backend is ready."
fi
echo ""

# ── Step 5: SSL setup ────────────────────────────────────────────────────────
if [ "${SKIP_SSL}" = "0" ]; then
    echo "[deploy] Step 5/6: Setting up Let's Encrypt SSL..."
    chmod +x scripts/init_letsencrypt.sh
    ./scripts/init_letsencrypt.sh
else
    echo "[deploy] Step 5/6: Skipping SSL setup (--skip-ssl)."
    echo "  Starting Nginx without SSL (HTTP only or Cloudflare handles SSL)..."
    docker compose up -d nginx
fi
echo ""

# ── Step 6: Start certbot renewal daemon ────────────────────────────────────
echo "[deploy] Step 6/6: Starting Certbot auto-renewal daemon..."
docker compose up -d certbot
echo ""

# ── Final status ─────────────────────────────────────────────────────────────
echo "============================================================"
echo "  Deployment COMPLETE"
echo "============================================================"
echo ""
docker compose ps
echo ""
echo "Useful commands:"
echo "  View logs        : docker compose logs -f"
echo "  Backend logs     : docker compose logs -f backend"
echo "  Run a migration  : docker compose exec backend python manage.py migrate"
echo "  Django shell     : docker compose exec backend python manage.py shell"
echo "  DB shell         : docker compose exec db psql -U ${DB_USER} -d ${DB_NAME}"
echo "  Restart all      : docker compose restart"
echo "  Stop all         : docker compose down"
echo "  Stop + wipe DB   : docker compose down -v  ← DESTRUCTIVE"
echo ""
echo "Your application should be live at: https://${DOMAIN}"
