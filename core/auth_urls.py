from django.urls import path
from .auth_views import (
    csrf_token_view,
    login_view,
    verify_2fa_view,
    resend_2fa_view,
    logout_view,
    token_refresh_view,
    current_user_view,
    change_password_view,
    verify_token_view,
)

auth_urlpatterns = [
    path('csrf/', csrf_token_view, name='csrf_token'),

    path('login/', login_view, name='login'),

    path('verify-2fa/', verify_2fa_view, name='verify_2fa'),

    path('resend-2fa/', resend_2fa_view, name='resend_2fa'),

    path('logout/', logout_view, name='logout'),

    path('token/refresh/', token_refresh_view, name='token_refresh'),

    path('me/', current_user_view, name='current_user'),

    path('change-password/', change_password_view, name='change_password'),

    path('verify-token/', verify_token_view, name='verify_token'),
]
