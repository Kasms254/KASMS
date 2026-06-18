#!/bin/sh
# =============================================================================
# Nginx Container Entrypoint – KASMS
#
# Substitutes ${DOMAIN} in the Nginx server block template, then starts Nginx.
# Only ${DOMAIN} is substituted; all native Nginx variables ($host, $uri, etc.)
# are left untouched because envsubst is called with the explicit variable list.
# =============================================================================
set -e

TEMPLATE=/etc/nginx/templates/kasms.conf.template
OUTPUT=/etc/nginx/conf.d/kasms.conf

if [ -z "${DOMAIN}" ]; then
    echo "[nginx-entrypoint] ERROR: DOMAIN environment variable is not set."
    echo "  Set DOMAIN=your.production.domain.com in your .env file."
    exit 1
fi

echo "[nginx-entrypoint] Generating Nginx config for domain: ${DOMAIN}"
envsubst '${DOMAIN}' < "${TEMPLATE}" > "${OUTPUT}"

echo "[nginx-entrypoint] Testing Nginx configuration..."
nginx -t

echo "[nginx-entrypoint] Starting Nginx..."
exec nginx -g "daemon off;"
