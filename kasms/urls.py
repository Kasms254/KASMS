from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from drf_yasg.views import get_schema_view
from drf_yasg import openapi
from rest_framework import permissions

schema_view = get_schema_view(
    openapi.Info(
        title="My API",
        default_version='v1',
        description="API documentation",
        contact=openapi.Contact(email="admin@example.com"),
    ),
    public=True,
    permission_classes=[permissions.AllowAny],
)


@require_GET
def health_check(request):
    """
    Public, unauthenticated endpoint used by:
      - Docker healthcheck (backend container)
      - External uptime monitors (UptimeRobot, Freshping, etc.)
      - Nginx upstream probing (optional)

    Returns 200 when DB and cache are reachable, 503 otherwise.
    Deliberately does NOT require authentication — checked by middleware
    analysis: CookieJWT passes through (no token), TenantMiddleware sets
    school=None (no X-School-Code header), SchoolAccessMiddleware returns
    immediately for anonymous users.  Zero risk of cross-tenant leakage.
    """
    checks = {}
    ok = True

    # ── Database ─────────────────────────────────────────────────────────────
    try:
        from django.db import connection
        with connection.cursor() as cur:
            cur.execute("SELECT 1")
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {str(exc)[:80]}"
        ok = False

    # ── Cache / Redis ─────────────────────────────────────────────────────────
    try:
        from django.core.cache import cache
        cache.set("_health_ping", "pong", timeout=10)
        if cache.get("_health_ping") != "pong":
            raise RuntimeError("unexpected value returned")
        checks["cache"] = "ok"
    except Exception as exc:
        checks["cache"] = f"error: {str(exc)[:80]}"
        ok = False

    status = 200 if ok else 503
    return JsonResponse(
        {"status": "ok" if ok else "degraded", "checks": checks},
        status=status,
    )


urlpatterns = [
    # Health check MUST be first — no authentication, no tenant middleware impact.
    path("health/", health_check, name="health"),
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
    path('iclock/', include('core.adms_urls')),
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    re_path(r'^swagger/$', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui'),
    re_path(r'^redoc/$', schema_view.with_ui('redoc', cache_timeout=0), name='schema-redoc'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)