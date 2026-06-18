# syntax=docker/dockerfile:1
# =============================================================================
# Stage 1: Build the React frontend
# Node 20 LTS – matches engines.node requirement in package.json.
# =============================================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

# Install dependencies first to maximise layer caching.
# Only reinstalls if package-lock.json changes.
COPY frontend/package*.json ./
RUN npm ci

# Vite bakes VITE_* variables into the JS bundle at build time.
# VITE_API_URL is the base URL of the Django API.
# For same-domain deployment (recommended) this is the production domain.
ARG VITE_API_URL
ARG VITE_APP_NAME=KASMS
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_APP_NAME=${VITE_APP_NAME}

COPY frontend/ .
RUN npm run build
# Output is in /frontend/dist

# =============================================================================
# Stage 2: Production Nginx image
# Serves React SPA + proxies to Django backend.
# DOMAIN env var is injected at container startup via envsubst.
# =============================================================================
FROM nginx:1.25-alpine

# Remove the default config that Nginx ships with.
RUN rm -f /etc/nginx/conf.d/default.conf

# Main nginx.conf (worker settings, gzip, rate limiting zones, upstream block).
COPY nginx/nginx.conf /etc/nginx/nginx.conf

# Server block template. The DOMAIN variable inside this file is substituted
# at container startup by the custom entrypoint (scripts/nginx-entrypoint.sh).
COPY nginx/templates/ /etc/nginx/templates/

# Copy the built React SPA.
COPY --from=frontend-builder /frontend/dist /var/www/frontend

# Custom entrypoint: runs envsubst on the template then starts nginx.
COPY scripts/nginx-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80 443

ENTRYPOINT ["/docker-entrypoint.sh"]
