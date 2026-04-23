"""
Gunicorn Production Configuration – KASMS
==========================================

Tuning guide:
  workers       = 2 × CPU_cores + 1  (default: 5 for 2-core VPS)
                  Reduce if WeasyPrint PDF generation causes OOM (it's memory-heavy).
                  Increase only if CPU is not the bottleneck.

  timeout       = 120s  (covers WeasyPrint PDF rendering which can be slow)
                  If all PDF generation moves to Celery, reduce to 60s.

  max_requests  = 1000  (workers self-restart after N requests to release memory leaks)
"""

import multiprocessing
import os

# ── Socket ───────────────────────────────────────────────────────────────────
bind = "0.0.0.0:8000"
backlog = 2048

# ── Workers ──────────────────────────────────────────────────────────────────
workers = int(os.getenv("GUNICORN_WORKERS", multiprocessing.cpu_count() * 2 + 1))
worker_class = "sync"           # sync is correct for Django (not async)
worker_connections = 1000
timeout = 120                   # WeasyPrint PDF generation can take 30-60s
graceful_timeout = 30           # time workers get to finish before SIGKILL on reload
keepalive = 5

# Worker memory leak prevention
max_requests = 1000
max_requests_jitter = 100       # random jitter so workers don't all restart at once

# ── Security ─────────────────────────────────────────────────────────────────
limit_request_line   = 4094
limit_request_fields = 100
limit_request_field_size = 8190

# ── Logging ──────────────────────────────────────────────────────────────────
# Log to stdout/stderr so Docker captures logs via 'docker compose logs'.
accesslog = "-"
errorlog  = "-"
loglevel  = "warning"
access_log_format = (
    '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s '
    '"%(f)s" "%(a)s" %(D)sµs'
)

# ── Process ──────────────────────────────────────────────────────────────────
proc_name = "kasms_gunicorn"
daemon    = False               # Docker manages the process lifecycle

# preload_app=True: load Django once in the master process, then fork workers.
# Benefits: faster startup, copy-on-write memory savings (~30-40% RAM reduction).
# Safe for this project: Celery runs in separate containers, no fork-safety issues.
preload_app = True

# ── SSL (handled by Nginx, not Gunicorn) ────────────────────────────────────
# Do NOT configure SSL here. Nginx terminates TLS and proxies via HTTP internally.
