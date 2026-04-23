# syntax=docker/dockerfile:1
# =============================================================================
# Stage 1: Dependency Builder
# Installs build tools and compiles Python packages that have C extensions.
# This stage is NOT included in the final image (no build tools in production).
# =============================================================================
FROM python:3.12-slim AS builder

# Build-time system dependencies:
#   gcc/g++          – compile C extensions (pycairo, rlPyCairo)
#   libpq-dev        – psycopg2 header files
#   libcairo2-dev    – pycairo build headers
#   libpango1.0-dev  – WeasyPrint/pycairo Pango headers
#   libgdk-pixbuf2.0-dev – WeasyPrint image support headers
#   libffi-dev       – cffi / cryptography
#   pkg-config       – locate .pc files for cairo/pango
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libpq-dev \
    libcairo2-dev \
    libpango1.0-dev \
    libgdk-pixbuf2.0-dev \
    libffi-dev \
    pkg-config \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Install into an isolated venv so the runtime stage can copy the whole env cleanly.
COPY requirements.txt .
RUN python -m venv /venv && \
    /venv/bin/pip install --no-cache-dir --upgrade "pip>=24" && \
    /venv/bin/pip install --no-cache-dir -r requirements.txt

# =============================================================================
# Stage 2: Production Runtime
# Lean image with only what Django needs to run. No compilers, no dev headers.
# =============================================================================
FROM python:3.12-slim AS runtime

# Runtime-only system packages:
#   libcairo2 / libpango-* / libgdk-pixbuf2.0-0 – WeasyPrint / pycairo at runtime
#   libffi8              – cffi / cryptography runtime
#   libpq5               – psycopg2 runtime (client library)
#   fonts-liberation     – PDF generation default fonts
#   fontconfig           – font discovery for WeasyPrint
#   shared-mime-info     – MIME type detection (WeasyPrint images, file uploads)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libffi8 \
    libpq5 \
    fonts-liberation \
    fontconfig \
    shared-mime-info \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*

# Copy the compiled virtual environment from the builder stage.
COPY --from=builder /venv /venv

# Put the venv first so all pip-installed binaries are found automatically.
ENV PATH="/venv/bin:$PATH" \
    # Prevent Python from writing .pyc files (cleaner image layers)
    PYTHONDONTWRITEBYTECODE=1 \
    # Force stdout/stderr to be unbuffered (logs appear in real time)
    PYTHONUNBUFFERED=1 \
    # Show tracebacks on crash (helpful in production logs)
    PYTHONFAULTHANDLER=1

WORKDIR /app

# Copy project source. .dockerignore excludes venv, __pycache__, node_modules, etc.
COPY . .

# Create directories that must exist at runtime. Doing this here (as root)
# before the chown ensures we own them. These are bind-mounted in prod anyway.
RUN mkdir -p /app/logs /app/media /app/staticfiles

# Non-root user: principle of least privilege.
RUN addgroup --system --gid 1001 django && \
    adduser --system --uid 1001 --gid 1001 --no-create-home django && \
    chown -R django:django /app

# Entrypoint script (already in repo at scripts/entrypoint.sh).
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER django

EXPOSE 8000

# Default command token – entrypoint.sh uses this to decide to run migrations
# + collectstatic before launching Gunicorn.
CMD ["gunicorn"]

ENTRYPOINT ["/entrypoint.sh"]
