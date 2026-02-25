import secrets
import logging
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from django.contrib.auth import authenticate
from django.views.decorators.csrf import csrf_exempt
from .serializers import UserSerializer, UserListSerializer
from .models import Enrollment


def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)

def _generate_otp():
    length = getattr(settings, 'TWO_FA_CODE_LENGTH', 6)
    return ''.join([str(secrets.randbelow(10)) for _ in range(length)])


def _send_2fa_email(user, code):
    subject = 'Your KASMS Login Verification Code'
    message = (
        f'Hello {user.get_full_name() or user.svc_number},\n\n'
        f'Your verification code is: {code}\n\n'
        f'This code expires in {getattr(settings, "TWO_FA_CODE_EXPIRY_MINUTES", 5)} minutes.\n\n'
        f'If you did not request this code, please ignore this email and '
        f'secure your account immediately.\n\n'
        f'– KASMS System'
    )
    try:
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
            fail_silently=False,
        )
        return True
    except Exception as exc:
        logger.error('Failed to send 2FA email to %s: %s', user.email, exc)
        return False


def _create_2fa_code(user):

    TwoFactorCode.objects.filter(user=user, is_used=False).update(is_used=True)

    code = _generate_otp()
    expiry_minutes = getattr(settings, 'TWO_FA_CODE_EXPIRY_MINUTES', 5)
    return TwoFactorCode.objects.create(
        user=user,
        code=code,
        expires_at=timezone.now() + timedelta(minutes=expiry_minutes),
    )


def _mask_email(email):
    if not email or '@' not in email:
        return '***@***.***'
    local, domain = email.rsplit('@', 1)
    if len(local) <= 2:
        masked_local = local[0] + '***'
    else:
        masked_local = local[:2] + '***'
    return f'{masked_local}@{domain}'

def check_student_can_login(user):
    if user.role != 'student':
        return True, None

    has_active_enrollment = Enrollment.all_objects.filter(
        student=user,
        is_active=True,
        class_obj__is_active=True,
    ).exists()

    if not has_active_enrollment:
        return False, (
            'Your enrollment is not active. '
            'Please contact your school administrator.'
        )
    return True, None

@api_view(['GET'])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def csrf_token_view(request):

    return Response({'detail': 'CSRF cookie set'})


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
@csrf_exempt
def login_view(request):

    svc_number = request.data.get('svc_number')
    password = request.data.get('password')
    school_code = request.data.get('school_code')  # Optional for explicit school selection
    
    if not svc_number or not password:
        return Response(
            {'error': 'Service Number and password are required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Authenticate user using custom backend (SvcNumberBackend)
    user = authenticate(request, svc_number=svc_number, password=password)
    
    if user is None:
        return Response(
            {'error': 'Invalid credentials'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    
    if not user.is_active:
        return Response(
            {'error': 'User account is disabled'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    if user.role != 'superadmin' and user.school:
        if not user.school.is_active:
            return Response(
                {'error': 'Your school account is currently inactive. Please contact support.'},
                status=status.HTTP_403_FORBIDDEN
            )
    
    can_login, error_message = check_student_can_login(user)
    if not can_login:
        return Response(
            {'error': error_message},
            status=status.HTTP_403_FORBIDDEN
        )
    
    tokens = get_tokens_for_user(user)
    
    user_data = UserListSerializer(user).data
    
    return Response({
        'message': 'Login successful',
        'access': tokens['access'],
        'refresh': tokens['refresh'],
        'must_change_password': user.must_change_password,
        'user': user_data
    }, status=status.HTTP_200_OK)

    set_auth_cookies(response, tokens["access"], tokens["refresh"])
    get_csrf_token(request)

    return response

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    refresh_name = getattr(settings, 'JWT_REFRESH_COOKIE_NAME', 'refresh_token')
    raw_refresh = request.COOKIES.get(refresh_name)

    try:
        refresh_token = request.data.get('refresh')
        if refresh_token:
            token = RefreshToken(refresh_token)
            token.blacklist()
        
        return Response({
            'message': 'Logout successful'
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({
            'error': 'Invalid token or token already blacklisted'
        }, status=status.HTTP_400_BAD_REQUEST)


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def token_refresh_view(request):

    from rest_framework_simplejwt.serializers import TokenRefreshSerializer
    
    serializer = TokenRefreshSerializer(data=request.data)
    
    if serializer.is_valid():
        return Response(serializer.validated_data, status=status.HTTP_200_OK)
    
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


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
            {'error': 'All password fields are required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if new_password != new_password2:
        return Response(
            {'error': 'New passwords do not match'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if not user.check_password(old_password):
        return Response(
            {'error': 'Old password is incorrect'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    from django.contrib.auth.password_validation import validate_password
    from django.core.exceptions import ValidationError
    
    try:
        validate_password(new_password, user)
    except ValidationError as e:
        return Response(
            {'error': list(e.messages)},
            status=status.HTTP_400_BAD_REQUEST
        )

    user.set_password(new_password)
    user.must_change_password = False
    user.save()
    
    tokens = get_tokens_for_user(user)
    
    return Response({
        'message': 'Password changed successfully',
        'access': tokens['access'],
        'refresh': tokens['refresh']
    }, status=status.HTTP_200_OK)

    return response

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify_token_view(request):
    user = request.user
    
    if user.role == 'student':
        can_login, error_message = check_student_can_login(user)
        if not can_login:
            return Response({
                'valid': False,
                'error': error_message
            }, status=status.HTTP_403_FORBIDDEN)
    
    return Response({
        'message': 'Token is valid',
        'valid': True,
        'user': UserListSerializer(user).data
    }, status=status.HTTP_200_OK)
