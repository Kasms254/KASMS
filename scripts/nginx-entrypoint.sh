#!/bin/sh
# =============================================================================
# Nginx Container Entrypoint – KASMS
#
# Renders the templates in /etc/nginx/templates/ into their runtime
# locations, then starts Nginx. Which server-block template is used depends
# on NGINX_TLS_MODE:
#   - proxy      (default): behind an edge proxy (Caddy) that terminates TLS.
#                Requires TRUSTED_PROXY_IP so X-Forwarded-* can be trusted.
#   - standalone: this nginx terminates TLS itself. Requires certs at
#                /etc/letsencrypt/live/${DOMAIN}/{fullchain,privkey}.pem.
#
# Each envsubst call passes an explicit variable list so native Nginx
# variables ($host, $uri, etc.) are left untouched.
# =============================================================================
set -e

if [ -z "${DOMAIN}" ]; then
    echo "[nginx-entrypoint] ERROR: DOMAIN environment variable is not set."
    echo "  Set DOMAIN=your.domain.or.ip in your .env file."
    exit 1
fi

NGINX_TLS_MODE="${NGINX_TLS_MODE:-proxy}"
TRUSTED_PROXY_IP="${TRUSTED_PROXY_IP:-127.0.0.1}"
ADMIN_ALLOWED_CIDR="${ADMIN_ALLOWED_CIDR:-127.0.0.1/32}"
export DOMAIN TRUSTED_PROXY_IP ADMIN_ALLOWED_CIDR

mkdir -p /etc/nginx/includes

echo "[nginx-entrypoint] TLS mode: ${NGINX_TLS_MODE} | domain: ${DOMAIN}"

echo "[nginx-entrypoint] Rendering trust config (TRUSTED_PROXY_IP=${TRUSTED_PROXY_IP})"
envsubst '${TRUSTED_PROXY_IP}' \
    < /etc/nginx/templates/00-trust.conf.template \
    > /etc/nginx/conf.d/00-trust.conf

echo "[nginx-entrypoint] Rendering shared locations (ADMIN_ALLOWED_CIDR=${ADMIN_ALLOWED_CIDR})"
envsubst '${ADMIN_ALLOWED_CIDR}' \
    < /etc/nginx/templates/kasms-locations.conf.template \
    > /etc/nginx/includes/kasms-locations.conf

case "${NGINX_TLS_MODE}" in
    proxy)
        envsubst '${DOMAIN}' \
            < /etc/nginx/templates/kasms-proxy.conf.template \
            > /etc/nginx/conf.d/kasms.conf
        ;;
    standalone)
        envsubst '${DOMAIN}' \
            < /etc/nginx/templates/kasms-standalone.conf.template \
            > /etc/nginx/conf.d/kasms.conf
        ;;
    *)
        echo "[nginx-entrypoint] ERROR: unknown NGINX_TLS_MODE '${NGINX_TLS_MODE}' (expected 'proxy' or 'standalone')."
        exit 1
        ;;
esac

echo "[nginx-entrypoint] Testing Nginx configuration..."
nginx -t

echo "[nginx-entrypoint] Starting Nginx..."
exec nginx -g "daemon off;"
