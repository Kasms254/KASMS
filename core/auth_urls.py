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
from .totp_views import (
    totp_enroll_start_view,
    totp_enroll_confirm_view,
    totp_disable_view,
    totp_verify_login_view,
    totp_recover_start_view,
    totp_recover_confirm_view,
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

    path('totp/enroll/start/', totp_enroll_start_view, name='totp_enroll_start'),

    path('totp/enroll/confirm/', totp_enroll_confirm_view, name='totp_enroll_confirm'),

    path('totp/disable/', totp_disable_view, name='totp_disable'),

    path('totp/verify/', totp_verify_login_view, name='totp_verify_login'),

    path('totp/recover/start/', totp_recover_start_view, name='totp_recover_start'),

    path('totp/recover/confirm/', totp_recover_confirm_view, name='totp_recover_confirm'),
]
