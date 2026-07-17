from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from datetime import timedelta
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import TokenError
ACCESS_COOKIE_NAME ='access_token'
REFRESH_COOKIE_NAME = 'refresh_token'

ACCESS_DENYLIST_PREFIX = 'access_token_denylist:'

def _get_jwt_setting(key, default):
    return getattr(settings, "SIMPLE_JWT", {}). get(key, default)

ACCESS_TOKEN_LIFETIME: timedelta=_get_jwt_setting(
    'ACCESS_TOKEN_LIFETIME', timedelta(hours=1)
)
REFRESH_TOKEN_LIFETIME: timedelta = _get_jwt_setting(
    "REFRESH_TOKEN_LIFETIME", timedelta(days=7)
)

def is_production() -> bool:
    return not getattr (settings, "DEBUG", True)

def get_cookie_settings() -> dict:

    production = is_production()

    cross_site = getattr(settings, "COOKIE_CROSS_SITE", True)

    if production and cross_site:
        samesite = "None"

    else:
        samesite = "Lax"

    return {
        "httponly": True,
        "secure": production,
        "samesite": samesite,
        "path": "/",
    }



def set_access_cookie(response, access_token: str):
    opts = get_cookie_settings()
    response.set_cookie(
        key = ACCESS_COOKIE_NAME,
        value = access_token,
        max_age = int(ACCESS_TOKEN_LIFETIME.total_seconds()),
        **opts,
    )


def set_refresh_cookie(response, refresh_token: str):

    opts = get_cookie_settings()
    opts["path"] = "/api/auth"
    response.set_cookie(
        key = REFRESH_COOKIE_NAME,
        value = refresh_token,
        max_age = int(REFRESH_TOKEN_LIFETIME.total_seconds()),
        **opts,
    )

def set_auth_cookies(response, access_token: str, refresh_token: str):
    set_access_cookie(response, access_token)
    set_refresh_cookie(response, refresh_token)

def delete_auth_cookies(response):
    base = get_cookie_settings()

    response.delete_cookie(ACCESS_COOKIE_NAME, path="/", samesite=base["samesite"])
    response.delete_cookie(
        REFRESH_COOKIE_NAME, path="/api/auth", samesite=base["samesite"]
    )


def denylist_access_token(raw_token: str) -> None:



    try:
        token = AccessToken(raw_token)
    except TokenError:
        return

    jti = token.get('jti')
    if not jti:
        return

    remaining = token['exp'] - int(timezone.now().timestamp())
    if remaining > 0:
        cache.set(f'{ACCESS_DENYLIST_PREFIX}{jti}', True, timeout=remaining)


def is_access_token_denylisted(token) -> bool:
    """token: a validated simplejwt Token instance (has a jti claim)."""
    jti = token.get('jti')
    if not jti:
        return False
    return cache.get(f'{ACCESS_DENYLIST_PREFIX}{jti}') is not None
