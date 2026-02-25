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
from rest_framework_simplejwt.exceptions import TokenError

from .models import Enrollment, SchoolMembership, TwoFactorCode
from .serializers import UserListSerializer, SchoolMembershipSerializer
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.contrib.auth import authenticate
logger = logging.getLogger(__name__)

def _set_token_cookies(response, access, refresh):
    secure = getattr(settings, 'JWT_COOKIE_SECURE', True)
    samesite = getattr(settings, 'JWT_COOKIE_SAMESITE', 'Lax')
    domain = getattr(settings, 'JWT_COOKIE_DOMAIN', None)
    access_name = getattr(settings, 'JWT_ACCESS_COOKIE_NAME', 'access_token')
    refresh_name = getattr(settings, 'JWT_REFRESH_COOKIE_NAME', 'refresh_token')

    access_max_age = int(
        settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds()
    )
    refresh_max_age = int(
        settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()
    )

    common = dict(
        httponly=True,
        secure=secure,
        samesite=samesite,
        domain=domain,
        path='/',
    )

    response.set_cookie(access_name, access, max_age=access_max_age, **common)
    response.set_cookie(refresh_name, refresh, max_age=refresh_max_age, **common)
    return response


def _clear_token_cookies(response):
    access_name = getattr(settings, 'JWT_ACCESS_COOKIE_NAME', 'access_token')
    refresh_name = getattr(settings, 'JWT_REFRESH_COOKIE_NAME', 'refresh_token')
    domain = getattr(settings, 'JWT_COOKIE_DOMAIN', None)

    for name in (access_name, refresh_name):
        response.delete_cookie(name, path='/', domain=domain)
    return response


def _get_tokens_for_user(user):
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
def login_view(request):

    svc_number = request.data.get('svc_number')
    password = request.data.get('password')

    user = authenticate(request, svc_number=svc_number, password=password)
    if user is None:
        return Response(
            {'error': 'Invalid credentials'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if not user.is_active:
        return Response(
            {'error': 'Account disabled'},
            status=status.HTTP_403_FORBIDDEN,
        )

    memberships = SchoolMembership.all_objects.filter(
        user=user, status='active',
    ).select_related('school')

    if user.role != 'superadmin' and not memberships.exists():
        history = SchoolMembership.all_objects.filter(
            user=user,
        ).select_related('school').order_by('-ended_at')
        return Response({
            'error': 'No active school membership.',
            'school_history': SchoolMembershipSerializer(history, many=True).data,
        }, status=status.HTTP_403_FORBIDDEN)

    if user.role == 'student':
        can_login, error_msg = check_student_can_login(user)
        if not can_login:
            return Response({'error': error_msg}, status=status.HTTP_403_FORBIDDEN)

    if not user.email:
        return Response(
            {'error': 'No email address on file. Contact your administrator.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    two_fa = _create_2fa_code(user)
    email_sent = _send_2fa_email(user, two_fa.code)

    if not email_sent:
        return Response(
            {'error': 'Failed to send verification email. Please try again.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response({
        'message': '2FA code sent to your email.',
        'requires_2fa': True,
        'email': _mask_email(user.email),
        'svc_number': user.svc_number,
    }, status=status.HTTP_200_OK)


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def verify_2fa_view(request):
    svc_number = request.data.get('svc_number')
    code = request.data.get('code', '').strip()
    password = request.data.get('password')

    if not svc_number or not code or not password:
        return Response(
            {'error': 'svc_number, password, and code are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = authenticate(request, svc_number=svc_number, password=password)
    if user is None or not user.is_active:
        return Response(
            {'error': 'Invalid credentials'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    max_attempts = getattr(settings, 'TWO_FA_MAX_ATTEMPTS', 5)
    recent_failures = TwoFactorCode.objects.filter(
        user=user,
        is_used=False,
        created_at__gte=timezone.now() - timedelta(minutes=15),
    ).first()

    if recent_failures and recent_failures.attempts >= max_attempts:
        return Response(
            {'error': 'Too many failed attempts. Please request a new code.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    two_fa = TwoFactorCode.objects.filter(
        user=user,
        is_used=False,
        expires_at__gt=timezone.now(),
    ).order_by('-created_at').first()

    if not two_fa:
        return Response(
            {'error': 'No valid verification code found. Please login again.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if two_fa.code != code:
        two_fa.attempts += 1
        two_fa.save(update_fields=['attempts'])
        remaining = max_attempts - two_fa.attempts
        return Response(
            {'error': f'Invalid code. {remaining} attempt(s) remaining.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    two_fa.is_used = True
    two_fa.save(update_fields=['is_used'])

    access, refresh = _get_tokens_for_user(user)
    user_data = UserListSerializer(user).data

    memberships = SchoolMembership.all_objects.filter(
        user=user, status='active',
    ).select_related('school')

    response_data = {
        'message': 'Login successful',
        'must_change_password': user.must_change_password,
        'user': user_data,
    }

    if memberships.count() > 1:
        response_data['available_schools'] = [
            {'code': m.school.code, 'name': m.school.name, 'role': m.role}
            for m in memberships
        ]

    response = Response(response_data, status=status.HTTP_200_OK)
    return _set_token_cookies(response, access, refresh)


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def resend_2fa_view(request):

    svc_number = request.data.get('svc_number')
    password = request.data.get('password')

    if not svc_number or not password:
        return Response(
            {'error': 'svc_number and password are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from django.contrib.auth import authenticate
    user = authenticate(request, svc_number=svc_number, password=password)
    if user is None or not user.is_active:
        return Response(
            {'message': 'If the account exists, a new code has been sent.'},
            status=status.HTTP_200_OK,
        )

    if not user.email:
        return Response(
            {'error': 'No email address on file. Contact your administrator.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    two_fa = _create_2fa_code(user)
    _send_2fa_email(user, two_fa.code)

    return Response({
        'message': 'A new verification code has been sent.',
        'email': _mask_email(user.email),
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    refresh_name = getattr(settings, 'JWT_REFRESH_COOKIE_NAME', 'refresh_token')
    raw_refresh = request.COOKIES.get(refresh_name)

    if raw_refresh:
        try:
            token = RefreshToken(raw_refresh)
            token.blacklist()
        except TokenError:
            pass  

    response = Response({'message': 'Logout successful'}, status=status.HTTP_200_OK)
    return _clear_token_cookies(response)


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def token_refresh_view(request):

    refresh_name = getattr(settings, 'JWT_REFRESH_COOKIE_NAME', 'refresh_token')
    raw_refresh = request.COOKIES.get(refresh_name)

    if not raw_refresh:
        return Response(
            {'error': 'No refresh token provided.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    try:
        old_refresh = RefreshToken(raw_refresh)
        old_refresh.blacklist()
    except TokenError:
        response = Response(
            {'error': 'Refresh token is invalid or expired.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
        return _clear_token_cookies(response)

    user_id = old_refresh.payload.get('user_id')
    from .models import User
    try:
        user = User.all_objects.get(id=user_id, is_active=True)
    except User.DoesNotExist:
        response = Response(
            {'error': 'User not found.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
        return _clear_token_cookies(response)

    access, refresh = _get_tokens_for_user(user)
    response = Response({'message': 'Token refreshed'}, status=status.HTTP_200_OK)
    return _set_token_cookies(response, access, refresh)


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
            status=status.HTTP_400_BAD_REQUEST,
        )

    if new_password != new_password2:
        return Response(
            {'error': 'New passwords do not match'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not user.check_password(old_password):
        return Response(
            {'error': 'Old password is incorrect'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        validate_password(new_password, user)
    except ValidationError as e:
        return Response(
            {'error': list(e.messages)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.set_password(new_password)
    user.must_change_password = False
    user.save()

    access, refresh = _get_tokens_for_user(user)
    response = Response(
        {'message': 'Password changed successfully'},
        status=status.HTTP_200_OK,
    )
    return _set_token_cookies(response, access, refresh)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify_token_view(request):
    user = request.user

    if user.role == 'student':
        can_login, error_message = check_student_can_login(user)
        if not can_login:
            return Response({
                'valid': False,
                'error': error_message,
            }, status=status.HTTP_403_FORBIDDEN)

    return Response({
        'message': 'Token is valid',
        'valid': True,
        'user': UserListSerializer(user).data,
    }, status=status.HTTP_200_OK)