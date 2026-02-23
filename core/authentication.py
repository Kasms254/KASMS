from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


class CookieJWTAuthentication(JWTAuthentication):


    def authenticate(self, request):
        cookie_name = getattr(
            settings, 'JWT_ACCESS_COOKIE_NAME', 'access_token'
        )
        raw_token = request.COOKIES.get(cookie_name)

        if raw_token is None:
            return super().authenticate(request)

        try:
            validated_token = self.get_validated_token(raw_token)
        except (InvalidToken, TokenError):
            return None

        return self.get_user(validated_token), validated_token
