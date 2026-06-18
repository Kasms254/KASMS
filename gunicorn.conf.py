
import multiprocessing
import os

bind = "0.0.0.0:8000"
backlog = 2048

workers = int(os.getenv("GUNICORN_WORKERS", multiprocessing.cpu_count() * 2 + 1))
worker_class = "sync"           # sync is correct for Django (not async)
worker_connections = 1000
timeout = 120                   # WeasyPrint PDF generation can take 30-60s
graceful_timeout = 30           # time workers get to finish before SIGKILL on reload
keepalive = 5

max_requests = 1000
max_requests_jitter = 100       # random jitter so workers don't all restart at once

limit_request_line   = 4094
limit_request_fields = 100
limit_request_field_size = 8190

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


preload_app = True
