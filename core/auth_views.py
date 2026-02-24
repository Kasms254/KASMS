from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from .serializers import UserSerializer, UserListSerializer
from .models import Enrollment
from .cookie_utils import (
    set_auth_cookies,
    delete_auth_cookies,
    REFRESH_COOKIE_NAME,
)
from django.middleware.csrf import get_token as get_csrf_token
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from django.conf import settings

def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {
        'refresh': str(refresh),
        'access': str(refresh.access_token),
    }


def check_student_can_login(user):

    if user.role != 'student':
        return True, None
    
    has_active_enrollment = Enrollment.all_objects.filter(
        student=user,
        is_active=True,
        class_obj__is_active=True
    ).exists()
    
    if not has_active_enrollment:
        return False, "Your enrollment is not active. Please contact your school administrator."
    
    return True, None


@api_view(['POST'])
@permission_classes([AllowAny])
@csrf_exempt
def login_view(request):

    svc_number = request.data.get('svc_number')
    password = request.data.get('password')
    
    if not svc_number or not password:
        return Response(
            {"error": "Service NUmber and password are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = authenticate(request, svc_number=svc_number, password=password)

    if user is None:
        return Response({
            "error": "Invalid credentials"
        }, status=status.HTTP_401_UNAUTHORIZED,
        )
    if not user.is_active:
        return Response({
            "error": "User account is disabled"
        }, 
        status=status.HTTP_403_FORBIDDEN,
        )

    # Non-superadmin users need school and enrollment checks
    if user.role != "superadmin":
        if user.school and not user.school.is_active:
            return Response(
                {"error": "Your school account is currently inactive. Please contact support"},
                status=status.HTTP_403_FORBIDDEN
            )
        can_login, error_message = check_student_can_login(user)
        if not can_login:
            return Response({
                "error": error_message
            }, status=status.HTTP_403_FORBIDDEN)

    # All user types (including superadmin) reach here
    tokens = get_tokens_for_user(user)
    user_data = UserListSerializer(user).data

    response = Response(
        {
            "message": "Login successful",
            "must_change_password": user.must_change_password,
            "user": user_data,
        },
        status=status.HTTP_200_OK
    )

    set_auth_cookies(response, tokens["access"], tokens["refresh"])
    get_csrf_token(request)

    return response

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):

    try:
        raw_refresh = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if raw_refresh:
            token = RefreshToken(raw_refresh)
            token.blacklist()
    except TokenError:
        pass

    response = Response(
        {"message": "Logout successful"},
        status=status.HTTP_200_OK,
    )
    delete_auth_cookies(response)
    return response


@api_view(['POST'])
@permission_classes([AllowAny])
def token_refresh_view(request):

    raw_refresh = request.COOKIES.get(REFRESH_COOKIE_NAME)

    if not raw_refresh:
        return Response(
            {"error": "No refresh token cookie present"},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    try:
        old_refresh = RefreshToken(raw_refresh)

        old_refresh.blacklist()
        new_refresh = RefreshToken.for_user(

            _get_user_from_token(old_refresh)
        )

        response = Response(
            {"message" : "Token refreshed successfully"},
            status=status.HTTP_200_OK,
        )
        set_auth_cookies(response, str(new_refresh.access_token), str(new_refresh))
        return response

    except TokenError:
        response = Response(
            {"error": "Refresh token is invalid or expired. PLease login in again"},
            status=status.HTTP_401_UNAUTHORIZED,
        )
        delete_auth_cookies(response)
        return response

def _get_user_from_token(token):

    User = get_user_model()
    user_id = token.get(settings.SIMPLE_JWT.get("USER_ID_CLAIM", "user_id"))
    user = User.objects.get(
        **{settings.SIMPLE_JWT.get("USER_ID_FIELD", "id"): user_id}
    )
    if not user.is_active:
        raise TokenError("User account is disabled.")
    return user

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_user_view(request):
    serializer = UserListSerializer(request.user)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):

    user = request.user
    old_password = request.data.get('old_password')
    new_password = request.data.get('new_password')
    new_password2 = request.data.get('new_password2')
    
    if not all([old_password, new_password, new_password2]):
        return Response(
            {"error": "All password fields are required"},
            status=status.HTTP_400_BAD_REQUEST
        )

    if new_password != new_password2:
        return Response({
            "error": "New passwords do not match"
        }, 
        status=status.HTTP_400_BAD_REQUEST)

    if not user.check_password(old_password):
        return Response({
            "error": "old password is incorrect"
        }, 
        status=status.HTTP_400_BAD_REQUEST)

    try:
        validate_password(new_password, user)
    except ValidationError as e:
        return Response(
            {"error": list(e.messages)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.set_password(new_password)
    user.must_change_password = False
    user.save()

    tokens = get_tokens_for_user(user)

    response = Response(
        {"message": "Password changed succesfully."},
        status=status.HTTP_200_OK,
    )
    set_auth_cookies(response, tokens["access"], tokens["refresh"])

    return response

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify_token_view(request):

    user = request.user

    if user.role == "student":
        can_login, error_message = check_student_can_login(user)
        if not can_login:
            return Response(
                {"valid": False, "error": error_message},
                status=status.HTTP_403_FORBIDDEN,
            )

    return Response(
        {
            "valid": True,
            "message": "Token is valid", 
            "user": UserListSerializer(user).data
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def csrf_token_view(request):

    return Response({"message": "CSRF cookie set."}, status=status.HTTP_200_OK)

