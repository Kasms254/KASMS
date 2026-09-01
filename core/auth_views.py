import secrets
import uuid
import logging
from datetime import timedelta
from urllib.parse import urlparse
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
from django.core.cache import cache
from .models import Enrollment, SchoolMembership, TwoFactorCode
from .cookie_utils import denylist_access_token
from .serializers import UserListSerializer, SchoolMembershipSerializer
from .rate_limiting import LockoutGuard, get_client_ip
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.contrib.auth import authenticate
from audit.services import audit_event
from audit.constants import AuditAction
logger = logging.getLogger(__name__)

LOGIN_MAX_ATTEMPTS = getattr(settings, 'LOGIN_MAX_ATTEMPTS', 5)
LOGIN_IP_MAX_ATTEMPTS = getattr(settings, 'LOGIN_IP_MAX_ATTEMPTS', LOGIN_MAX_ATTEMPTS * 3)
LOGIN_LOCKOUT_DURATION = getattr(settings, 'LOGIN_LOCKOUT_DURATION', 1800)
LOGIN_ATTEMPT_WINDOW = getattr(settings, 'LOGIN_ATTEMPT_WINDOW', 300)

_get_client_ip = get_client_ip


def _origin_from_referer(referer):

    parsed = urlparse(referer)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f'{parsed.scheme}://{parsed.netloc}'


def _is_cross_origin_auth_request(request):

    trusted_origins = set(getattr(settings, 'CORS_ALLOWED_ORIGINS', None) or [])

    origin = request.META.get('HTTP_ORIGIN')
    if origin:
        return origin not in trusted_origins

    referer = request.META.get('HTTP_REFERER')
    if referer:
        return _origin_from_referer(referer) not in trusted_origins

    return False


def _reject_if_cross_origin(request):
    if not _is_cross_origin_auth_request(request):
        return None
    logger.warning(
        'Blocked cross-origin auth request | path=%s | origin=%s',
        request.path,
        request.META.get('HTTP_ORIGIN') or request.META.get('HTTP_REFERER'),
        extra={'event': 'login_csrf_blocked'},
    )
    return Response(
        {'error': 'Request origin not allowed.'},
        status=status.HTTP_403_FORBIDDEN,
    )


_login_guard = LockoutGuard(
    namespace='login',
    max_attempts=LOGIN_MAX_ATTEMPTS,
    ip_max_attempts=LOGIN_IP_MAX_ATTEMPTS,
    lockout_duration=LOGIN_LOCKOUT_DURATION,
    attempt_window=LOGIN_ATTEMPT_WINDOW,
    log_label='Login',
    locked_message='Account locked due to too many failed login attempts, Try again in {minutes} minute(s)',
    locked_message_ip='Too many failed login attempts from this location. Try again in {minutes} minute(s)',
)


def _check_lockout(svc_number, ip_address=None):
    return _login_guard.check(svc_number, ip_address)


def _record_failed_login(svc_number, ip_address=None):
    return _login_guard.record_failure(svc_number, ip_address)


def _clear_failed_login(svc_number, ip_address=None):
    return _login_guard.clear(svc_number, ip_address)


TWO_FA_GUARD_MAX_ATTEMPTS = getattr(settings, 'TWO_FA_GUARD_MAX_ATTEMPTS', 5)
TWO_FA_GUARD_IP_MAX_ATTEMPTS = getattr(settings, 'TWO_FA_GUARD_IP_MAX_ATTEMPTS', TWO_FA_GUARD_MAX_ATTEMPTS * 3)
TWO_FA_GUARD_LOCKOUT_DURATION = getattr(settings, 'TWO_FA_GUARD_LOCKOUT_DURATION', 1800)
TWO_FA_GUARD_ATTEMPT_WINDOW = getattr(settings, 'TWO_FA_GUARD_ATTEMPT_WINDOW', 300)


_otp_guard = LockoutGuard(
    namespace='email-otp',
    max_attempts=TWO_FA_GUARD_MAX_ATTEMPTS,
    ip_max_attempts=TWO_FA_GUARD_IP_MAX_ATTEMPTS,
    lockout_duration=TWO_FA_GUARD_LOCKOUT_DURATION,
    attempt_window=TWO_FA_GUARD_ATTEMPT_WINDOW,
    log_label='Email OTP',
    locked_message='Too many failed verification attempts. Try again in {minutes} minute(s)',
    locked_message_ip='Too many failed verification attempts from this location. Try again in {minutes} minute(s)',
)

def _get_tokens_for_user(user, session_id=None):

    if session_id is None:
        session_id = uuid.uuid4().hex

    refresh = RefreshToken.for_user(user)
    refresh['session_id'] = session_id

    access_token = refresh.access_token
    access_token['session_id'] = session_id

    return str(access_token), str(refresh), session_id

def _stamp_initial_activity(user, session_id):
    """Seed the per-session activity cache key at login so the first
    token refresh does not treat a missing key as inactivity."""
    timeout = getattr(settings, 'INACTIVITY_TIMEOUT', 900)
    cache_key = f'user_last_activity:{user.id}:{session_id}'
    cache.set(
        cache_key,
        timezone.now().isoformat(),
        timeout=timeout * 2,
    )

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

    if has_active_enrollment or user.is_alumni:
        return True, None

    return False, (
        'Your enrollment is not active. '
        'Please contact your school administrator.'
    )

def _reject_if_ineligible_for_login(user):

    if user.role not in ('superadmin', 'chief_of_training'):
        has_active_membership = SchoolMembership.all_objects.filter(
            user=user, status='active',
        ).exists()

        if not has_active_membership and not user.is_alumni:
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

    return None

@api_view(['GET'])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def csrf_token_view(request):

    return Response({'detail': 'CSRF cookie set'})

@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):

    blocked = _reject_if_cross_origin(request)
    if blocked:
        return blocked

    svc_number = request.data.get('svc_number')
    password = request.data.get('password')
    ip_address = _get_client_ip(request)

    is_locked, lockout_msg, remaining_seconds = _check_lockout(svc_number, ip_address)
    if is_locked:
        logger.warning(
            'Blocked login attempt (locked out) | svc=%s | ip=%s',
            svc_number, ip_address,
            extra={'event': 'login_blocked'},
        )
        audit_event(
            AuditAction.LOGIN_FAILED, request=request,
            metadata={'svc_number': svc_number, 'reason': 'locked_out'},
        )
        return Response(
            {
                'error': lockout_msg,
                'locked': True,
                'retry_after_seconds': remaining_seconds,
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    user = authenticate(request, svc_number=svc_number, password=password)
    if user is None:
        is_now_locked, remaining = _record_failed_login(svc_number, ip_address)
        logger.info(
            'Failed login attempt | svc=%s | ip=%s | remaining=%d',
            svc_number, ip_address, remaining,
        )
        audit_event(
            AuditAction.LOGIN_FAILED, request=request,
            metadata={'svc_number': svc_number, 'reason': 'invalid_credentials'},
        )

        error_msg = 'Invalid credentials.'
        if is_now_locked:
            minutes = LOGIN_LOCKOUT_DURATION // 60
            error_msg = (
                f'Account locked after {LOGIN_MAX_ATTEMPTS} failed attempts. '
                f'Try again in {minutes} minutes.'
            )
            return Response(
                {
                    'error': error_msg,
                    'locked': True,
                    'retry_after_seconds': LOGIN_LOCKOUT_DURATION,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
 
        if remaining <= 2:
            error_msg = (
                f'Invalid credentials. {remaining} attempt(s) remaining '
                f'before your account is locked.'
            )
 
        return Response(
            {'error': error_msg, 'remaining_attempts': remaining},
            status=status.HTTP_401_UNAUTHORIZED,
        )
 
    if not user.is_active:
        return Response(
            {'error': 'Account disabled'},
            status=status.HTTP_403_FORBIDDEN,
        )
 
    _clear_failed_login(svc_number, ip_address)

    ineligible = _reject_if_ineligible_for_login(user)
    if ineligible:
        return ineligible

    if not user.email:
        return Response(
            {'error': 'No email address on file. Contact your administrator.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    if user.totp_enabled:
        logger.info(
            'Login requires TOTP | svc=%s | ip=%s',
            svc_number, ip_address,
            extra={'event': 'login_requires_totp'},
        )
        return Response({
            'message': 'TOTP verification required.',
            'requires_totp': True,
            'svc_number': user.svc_number,
        }, status=status.HTTP_200_OK)

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
    blocked = _reject_if_cross_origin(request)
    if blocked:
        return blocked

    svc_number = request.data.get('svc_number')
    code = request.data.get('code', '').strip()
    password = request.data.get('password')
    ip_address = _get_client_ip(request)
 
    if not svc_number or not code or not password:
        return Response(
            {'error': 'svc_number, password, and code are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
 
    is_locked, lockout_msg, remaining_seconds = _check_lockout(svc_number, ip_address)
    if is_locked:
        return Response(
            {
                'error': lockout_msg,
                'locked': True,
                'retry_after_seconds': remaining_seconds,
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    is_otp_locked, otp_lockout_msg, otp_remaining_seconds = _otp_guard.check(svc_number, ip_address)
    if is_otp_locked:
        return Response(
            {
                'error': otp_lockout_msg,
                'locked': True,
                'retry_after_seconds': otp_remaining_seconds,
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    user = authenticate(request, svc_number=svc_number, password=password)
    if user is None or not user.is_active:
        _record_failed_login(svc_number, ip_address)
        audit_event(
            AuditAction.LOGIN_FAILED, request=request,
            metadata={'svc_number': svc_number, 'reason': 'invalid_credentials'},
        )
        return Response(
            {'error': 'Invalid credentials'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if user.totp_enabled:

        return Response(
            {'error': 'This account requires authenticator app verification.'},
            status=status.HTTP_400_BAD_REQUEST,
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

    if not secrets.compare_digest(two_fa.code, code):
        two_fa.attempts += 1
        two_fa.save(update_fields=['attempts'])
        remaining = max_attempts - two_fa.attempts
        is_now_otp_locked, _ = _otp_guard.record_failure(svc_number, ip_address)

        audit_event(
            AuditAction.LOGIN_FAILED, request=request, actor=user,
            metadata={'svc_number': svc_number, 'reason': 'invalid_2fa_code'},
        )
        if is_now_otp_locked:
            return Response(
                {'error': 'Too many failed attempts. Account temporarily locked.', 'locked': True},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        return Response(
            {'error': f'Invalid code. {remaining} attempt(s) remaining.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    two_fa.is_used = True
    two_fa.save(update_fields=['is_used'])

    _clear_failed_login(svc_number, ip_address)
    _otp_guard.clear(svc_number, ip_address)

    ineligible = _reject_if_ineligible_for_login(user)
    if ineligible:
        return ineligible

    access, refresh, session_id = _get_tokens_for_user(user)
    _stamp_initial_activity(user, session_id)
    audit_event(AuditAction.LOGIN, request=request, actor=user, metadata={'method': '2fa_email'})

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
    blocked = _reject_if_cross_origin(request)
    if blocked:
        return blocked

    svc_number = request.data.get('svc_number')
    password = request.data.get('password')
    ip_address = _get_client_ip(request)

    if not svc_number or not password:
        return Response(
            {'error': 'svc_number and password are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
 
    is_locked, lockout_msg, remaining_seconds = _check_lockout(svc_number, ip_address)
    if is_locked:
        return Response(
            {
                'error': lockout_msg,
                'locked': True,
                'retry_after_seconds': remaining_seconds,
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    is_otp_locked, otp_lockout_msg, otp_remaining_seconds = _otp_guard.check(svc_number, ip_address)
    if is_otp_locked:
        return Response(
            {
                'error': otp_lockout_msg,
                'locked': True,
                'retry_after_seconds': otp_remaining_seconds,
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    from django.contrib.auth import authenticate
    user = authenticate(request, svc_number=svc_number, password=password)
    if user is None or not user.is_active:
        _record_failed_login(svc_number, ip_address)
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
    audit_event(AuditAction.LOGOUT, request=request)
    refresh_name = getattr(settings, 'JWT_REFRESH_COOKIE_NAME', 'refresh_token')
    raw_refresh = request.COOKIES.get(refresh_name)

    if raw_refresh:
        try:
            token = RefreshToken(raw_refresh)
            token.blacklist()
        except TokenError:
            pass

    access_name = getattr(settings, 'JWT_ACCESS_COOKIE_NAME', 'access_token')
    raw_access = request.COOKIES.get(access_name)
    if raw_access:
        denylist_access_token(raw_access)

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
    except TokenError:
        response = Response(
            {'error': 'Refresh token is invalid or expired.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
        return _clear_token_cookies(response)
 
    user_id = old_refresh.payload.get('user_id')
    session_id = old_refresh.payload.get('session_id')
    inactivity_timeout = getattr(settings, 'INACTIVITY_TIMEOUT', 900)

    if session_id:
        activity_cache_key = f'user_last_activity:{user_id}:{session_id}'
    else:
        activity_cache_key = f'user_last_activity:{user_id}'
 
    last_activity_iso = cache.get(activity_cache_key)
 
    if last_activity_iso is None:
        try:
            old_refresh.blacklist()
        except TokenError:
            pass
        response = Response(
            {'error': 'Session expired due to inactivity. Please log in again.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
        return _clear_token_cookies(response)

    last_activity = timezone.datetime.fromisoformat(last_activity_iso)
    idle_seconds = (timezone.now() - last_activity).total_seconds()
 
    if idle_seconds > inactivity_timeout:
        try:
            old_refresh.blacklist()
        except TokenError:
            pass
        response = Response(
            {'error': 'Session expired due to inactivity. Please log in again.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
        return _clear_token_cookies(response)
 
    try:
        old_refresh.blacklist()
    except TokenError:
        response = Response(
            {'error': 'Refresh token is invalid or expired.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
        return _clear_token_cookies(response)
 
    from .models import User
    try:
        user = User.all_objects.get(id=user_id, is_active=True)
    except User.DoesNotExist:
        response = Response(
            {'error': 'User not found.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
        return _clear_token_cookies(response)

    access, refresh, new_session_id = _get_tokens_for_user(user, session_id=session_id)
    if not session_id:
        _stamp_initial_activity(user, new_session_id)
 
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


    access_name = getattr(settings, 'JWT_ACCESS_COOKIE_NAME', 'access_token')
    raw_access = request.COOKIES.get(access_name)
    if raw_access:
        denylist_access_token(raw_access)

    access, refresh, session_id = _get_tokens_for_user(user)
    _stamp_initial_activity(user, session_id)
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