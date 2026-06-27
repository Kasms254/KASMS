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
