from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from django.conf import settings

from .cookie_utils import ACCESS_COOKIE_NAME
from django.contrib.auth import get_user_model

class CookieJWTAuthentication(BaseAuthentication):

    def authenticate(self, request):
        raw_token = request.COOKIES.get(ACCESS_COOKIE_NAME)

        if not raw_token:
            return None

        try:
            validated_token = AccessToken(raw_token)

        except TokenError as e:
            raise AuthenticationFailed(
                detail= "Access token expired or invalid",
                code = "token_not_valid"
            )

        return self._get_user(validated_token), validated_token

    def _get_user(Self, validated_token):
        
        User = get_user_model()
        user_id = validated_token.get(
            settings.SIMPLE_JWT.get("USER_ID_CLAIM", "user_id")
        )
        if user_id is None:
            raise AuthenticationFailed("Token contained no user identification.")

        try:
            user = User.objects.get(
                **{settings.SIMPLE_JWT.get("USER_ID_FIELD", "id"): user_id}
            )
        except User.DoesNotExist:
            raise AuthenticationFailed("User not Found")

        if not user.is_active:
            raise AuthenticationFailed("User account is disabled. ")

        return user


    def authenticate_header(self, request):

        return "Cookie"
        