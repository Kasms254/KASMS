from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from core.views import serve_media

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
    re_path(r'^media/(?P<path>.*)$', serve_media, name='serve_media'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

