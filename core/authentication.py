from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from .cookie_utils import is_access_token_denylisted


class CookieJWTAuthentication(JWTAuthentication):


    def authenticate(self, request):
        cookie_name = getattr(
            settings, 'JWT_ACCESS_COOKIE_NAME', 'access_token'
        )
        raw_token = request.COOKIES.get(cookie_name)

        if raw_token is None:
            # No cookie — fall back to the standard Authorization: Bearer
            # header (same as simplejwt's default JWTAuthentication), but
            # resolve the raw token ourselves so the denylist check below
            # always runs regardless of which source the token came from.
            header = self.get_header(request)
            if header is None:
                return None
            raw_token = self.get_raw_token(header)
            if raw_token is None:
                return None

        try:
            validated_token = self.get_validated_token(raw_token)
        except (InvalidToken, TokenError):
            return None

        if is_access_token_denylisted(validated_token):
            return None

        return self.get_user(validated_token), validated_token
