#!/bin/bash
# =============================================================================
# Let's Encrypt Initial Certificate Setup – KASMS
#
# Run this ONCE after setting up the new server, before starting all services.
#
# What it does:
#   1. Creates dummy self-signed cert so Nginx can start on HTTPS initially
#   2. Starts Nginx (needed for Certbot's HTTP-01 challenge)
#   3. Requests the real certificate from Let's Encrypt
#   4. Restarts Nginx with the real certificate
#
# Requirements:
#   - DOMAIN in .env must already point to this server's IP via DNS
#   - Port 80 must be open and reachable from the internet (for ACME challenge)
#   - Port 443 must be open
#
# Usage:
#   chmod +x scripts/init_letsencrypt.sh
#   ./scripts/init_letsencrypt.sh
# =============================================================================
set -euo pipefail

# ── Load config ──────────────────────────────────────────────────────────────
if [ -f .env ]; then
    set -a; source .env; set +a
fi

DOMAIN="${DOMAIN:?ERROR: DOMAIN is not set in .env}"
EMAIL="${CERTBOT_EMAIL:?ERROR: CERTBOT_EMAIL is not set. Add CERTBOT_EMAIL=admin@yourdomain.com to .env}"
STAGING="${CERTBOT_STAGING:-0}"   # Set to 1 to use Let's Encrypt staging (for testing)

CERT_PATH="./certbot/conf/live/${DOMAIN}"
DATA_PATH="./certbot"

echo "============================================================"
echo "  Let's Encrypt Setup for: ${DOMAIN}"
echo "  Email  : ${EMAIL}"
echo "  Staging: ${STAGING}"
echo "============================================================"
echo ""

# ── Create required directories ──────────────────────────────────────────────
mkdir -p "${DATA_PATH}/conf/live/${DOMAIN}"
mkdir -p "${DATA_PATH}/www"

# ── Step 1: Generate a temporary self-signed cert ────────────────────────────
# Nginx needs a valid cert to start listening on 443. We create a dummy one
# now and replace it with the real Let's Encrypt cert in step 3.
if [ ! -f "${CERT_PATH}/fullchain.pem" ]; then
    echo "[init-ssl] Generating temporary self-signed certificate..."
    docker compose run --rm --no-deps certbot \
        sh -c "
            mkdir -p /etc/letsencrypt/live/${DOMAIN} && \
            openssl req -x509 -nodes -newkey rsa:4096 -days 1 \
                -keyout /etc/letsencrypt/live/${DOMAIN}/privkey.pem \
                -out /etc/letsencrypt/live/${DOMAIN}/fullchain.pem \
                -subj '/CN=${DOMAIN}'
        "
    echo "[init-ssl] Temporary certificate created."
else
    echo "[init-ssl] Certificate already exists at ${CERT_PATH}. Skipping dummy cert."
fi

# ── Step 2: Start Nginx (with temporary cert) ────────────────────────────────
echo ""
echo "[init-ssl] Starting Nginx with temporary certificate..."
docker compose up -d nginx
sleep 5   # give Nginx time to start

# ── Step 3: Request real certificate from Let's Encrypt ──────────────────────
echo ""
echo "[init-ssl] Requesting Let's Encrypt certificate..."
STAGING_ARG=""
if [ "${STAGING}" = "1" ]; then
    STAGING_ARG="--staging"
    echo "[init-ssl] Using STAGING environment (not a production cert)"
fi

docker compose run --rm certbot \
    certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "${EMAIL}" \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    ${STAGING_ARG} \
    -d "${DOMAIN}" \
    -d "www.${DOMAIN}"

# ── Step 4: Reload Nginx with the real certificate ───────────────────────────
echo ""
echo "[init-ssl] Reloading Nginx with the real certificate..."
docker compose exec nginx nginx -s reload

echo ""
echo "============================================================"
echo "  SSL setup COMPLETE."
echo "  Your site is now live at: https://${DOMAIN}"
echo ""
echo "  Certificate auto-renews every 12h via the certbot service."
echo "  To verify: docker compose logs certbot"
echo "============================================================"
