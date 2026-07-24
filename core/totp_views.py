import secrets
import logging
from datetime import timedelta

import pyotp
from django.conf import settings
from django.contrib.auth import authenticate
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .encryption import encrypt_value, decrypt_value
from .models import SchoolMembership, TwoFactorCode
from .serializers import UserListSerializer
from .rate_limiting import LockoutGuard, get_client_ip
from .auth_views import (
    _login_guard,
    _get_tokens_for_user,
    _stamp_initial_activity,
    _set_token_cookies,
    _create_2fa_code,
    _send_2fa_email,
    _mask_email,
)

logger = logging.getLogger(__name__)

_get_client_ip = get_client_ip

TOTP_ISSUER_NAME = getattr(settings, 'TOTP_ISSUER_NAME', 'KASMS')
TOTP_ENROLLMENT_EXPIRY_MINUTES = getattr(settings, 'TOTP_ENROLLMENT_EXPIRY_MINUTES', 10)
TOTP_MAX_ATTEMPTS = getattr(settings, 'TOTP_MAX_ATTEMPTS', 5)
TOTP_IP_MAX_ATTEMPTS = getattr(settings, 'TOTP_IP_MAX_ATTEMPTS', TOTP_MAX_ATTEMPTS * 3)
TOTP_LOCKOUT_DURATION = getattr(settings, 'TOTP_LOCKOUT_DURATION', 1800)
TOTP_ATTEMPT_WINDOW = getattr(settings, 'TOTP_ATTEMPT_WINDOW', 300)

TOTP_RECOVERY_MAX_ATTEMPTS = getattr(settings, 'TOTP_RECOVERY_MAX_ATTEMPTS', 5)
TOTP_RECOVERY_IP_MAX_ATTEMPTS = getattr(settings, 'TOTP_RECOVERY_IP_MAX_ATTEMPTS', TOTP_RECOVERY_MAX_ATTEMPTS * 3)
TOTP_RECOVERY_LOCKOUT_DURATION = getattr(settings, 'TOTP_RECOVERY_LOCKOUT_DURATION', 1800)
TOTP_RECOVERY_ATTEMPT_WINDOW = getattr(settings, 'TOTP_RECOVERY_ATTEMPT_WINDOW', 300)

TOTP_SETTINGS_MAX_ATTEMPTS = getattr(settings, 'TOTP_SETTINGS_MAX_ATTEMPTS', 5)
TOTP_SETTINGS_IP_MAX_ATTEMPTS = getattr(settings, 'TOTP_SETTINGS_IP_MAX_ATTEMPTS', TOTP_SETTINGS_MAX_ATTEMPTS * 3)
TOTP_SETTINGS_LOCKOUT_DURATION = getattr(settings, 'TOTP_SETTINGS_LOCKOUT_DURATION', 1800)
TOTP_SETTINGS_ATTEMPT_WINDOW = getattr(settings, 'TOTP_SETTINGS_ATTEMPT_WINDOW', 300)

# Login-time TOTP code verification — unchanged namespace/thresholds from
# before the LockoutGuard migration.
_totp_guard = LockoutGuard(
    namespace='totp',
    max_attempts=TOTP_MAX_ATTEMPTS,
    ip_max_attempts=TOTP_IP_MAX_ATTEMPTS,
    lockout_duration=TOTP_LOCKOUT_DURATION,
    attempt_window=TOTP_ATTEMPT_WINDOW,
    log_label='TOTP',
    locked_message='Too many failed authenticator attempts. Try again in {minutes} minute(s)',
    locked_message_ip='Too many failed authenticator attempts from this location. Try again in {minutes} minute(s)',
)

# "Forgot authenticator" recovery — its own namespace, independent of both
# `_login_guard` (password login) and `_totp_guard` (login-time TOTP code),
# so a failed recovery attempt can never lock a user out of ordinary login
# or vice versa.
_totp_recovery_guard = LockoutGuard(
    namespace='totp-recovery',
    max_attempts=TOTP_RECOVERY_MAX_ATTEMPTS,
    ip_max_attempts=TOTP_RECOVERY_IP_MAX_ATTEMPTS,
    lockout_duration=TOTP_RECOVERY_LOCKOUT_DURATION,
    attempt_window=TOTP_RECOVERY_ATTEMPT_WINDOW,
    log_label='TOTP recovery',
    locked_message='Too many failed recovery attempts. Try again in {minutes} minute(s)',
    locked_message_ip='Too many failed recovery attempts from this location. Try again in {minutes} minute(s)',
)

# Self-service TOTP settings actions (enroll start/confirm, disable) — all
# re-authentication-style (password/code re-entry) on an already
# authenticated session, so they get the same layered protection as login,
# but keyed by the user's immutable id rather than svc_number.
_totp_settings_guard = LockoutGuard(
    namespace='totp-settings',
    max_attempts=TOTP_SETTINGS_MAX_ATTEMPTS,
    ip_max_attempts=TOTP_SETTINGS_IP_MAX_ATTEMPTS,
    lockout_duration=TOTP_SETTINGS_LOCKOUT_DURATION,
    attempt_window=TOTP_SETTINGS_ATTEMPT_WINDOW,
    log_label='TOTP settings',
    locked_message='Too many failed attempts. Try again in {minutes} minute(s)',
    locked_message_ip='Too many failed attempts from this location. Try again in {minutes} minute(s)',
)


def _check_totp_lockout(svc_number, ip_address=None):
    return _totp_guard.check(svc_number, ip_address)


def _record_totp_failed(svc_number, ip_address=None):
    return _totp_guard.record_failure(svc_number, ip_address)


def _clear_totp_failed(svc_number, ip_address=None):
    return _totp_guard.clear(svc_number, ip_address)


def _verify_totp_code(secret_plain, code):
    """valid_window=1 tolerates +/- one 30s step of clock drift between
    server and authenticator app."""
    if not secret_plain or not code:
        return False
    try:
        return pyotp.TOTP(secret_plain).verify(code, valid_window=1)
    except Exception:
        return False


def _reject_if_must_change_password(user):
    """TOTP enrollment/disable are self-service settings actions, not part
    of the login sequence itself — a user with a forced password change
    pending must resolve that first, matching the only other self-service
    settings action (change_password_view) that's reachable in that state.
    Returns a 403 Response if blocked, otherwise None."""
    if user.must_change_password:
        return Response(
            {'error': 'Please change your password before managing two-factor authentication.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


def _available_schools(user):
    memberships = SchoolMembership.all_objects.filter(
        user=user, status='active',
    ).select_related('school')
    if memberships.count() > 1:
        return [
            {'code': m.school.code, 'name': m.school.name, 'role': m.role}
            for m in memberships
        ]
    return None


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def totp_enroll_start_view(request):
    """Self-service, all roles. Requires re-entering the current password
    so a hijacked-but-unlocked session cannot silently plant a rogue
    authenticator. Writes only the pending secret fields — never touches
    the active/confirmed secret, so an abandoned or repeated enrollment
    attempt can never break an already-working TOTP setup."""
    user = request.user
    blocked = _reject_if_must_change_password(user)
    if blocked:
        return blocked

    ip_address = _get_client_ip(request)
    is_locked, lockout_msg, remaining_seconds = _totp_settings_guard.check(str(user.id), ip_address)
    if is_locked:
        return Response(
            {'error': lockout_msg, 'locked': True, 'retry_after_seconds': remaining_seconds},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    password = request.data.get('password')
    if not password or not user.check_password(password):
        _totp_settings_guard.record_failure(str(user.id), ip_address)
        return Response({'error': 'Incorrect password.'}, status=status.HTTP_400_BAD_REQUEST)

    _totp_settings_guard.clear(str(user.id), ip_address)

    secret = pyotp.random_base32()
    user.totp_pending_secret_encrypted = encrypt_value(secret)
    user.totp_pending_expires_at = timezone.now() + timedelta(minutes=TOTP_ENROLLMENT_EXPIRY_MINUTES)
    user.save(update_fields=['totp_pending_secret_encrypted', 'totp_pending_expires_at'])

    provisioning_uri = pyotp.TOTP(secret).provisioning_uri(
        name=user.svc_number or user.email, issuer_name=TOTP_ISSUER_NAME,
    )
    logger.info(
        'TOTP enrollment started | user_id=%s | svc=%s',
        user.id, user.svc_number,
        extra={'event': 'totp_enroll_start'},
    )
    return Response({
        'secret': secret,
        'provisioning_uri': provisioning_uri,
        'expires_in_minutes': TOTP_ENROLLMENT_EXPIRY_MINUTES,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def totp_enroll_confirm_view(request):
    """Promotes the pending secret to the active/confirmed secret once the
    user proves possession of it via a valid code."""
    user = request.user
    blocked = _reject_if_must_change_password(user)
    if blocked:
        return blocked

    ip_address = _get_client_ip(request)
    is_locked, lockout_msg, remaining_seconds = _totp_settings_guard.check(str(user.id), ip_address)
    if is_locked:
        return Response(
            {'error': lockout_msg, 'locked': True, 'retry_after_seconds': remaining_seconds},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    code = (request.data.get('code') or '').strip()

    if not user.totp_pending_secret_encrypted:
        return Response(
            {'error': 'No enrollment in progress. Start enrollment again.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not user.totp_pending_expires_at or timezone.now() >= user.totp_pending_expires_at:
        user.totp_pending_secret_encrypted = ''
        user.totp_pending_expires_at = None
        user.save(update_fields=['totp_pending_secret_encrypted', 'totp_pending_expires_at'])
        return Response(
            {'error': 'Enrollment expired. Please start again.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    pending_secret = decrypt_value(user.totp_pending_secret_encrypted)
    if not _verify_totp_code(pending_secret, code):
        _totp_settings_guard.record_failure(str(user.id), ip_address)
        logger.info(
            'TOTP enrollment confirm failed | user_id=%s',
            user.id,
            extra={'event': 'totp_enroll_confirm_fail'},
        )
        return Response({'error': 'Invalid code.'}, status=status.HTTP_400_BAD_REQUEST)

    _totp_settings_guard.clear(str(user.id), ip_address)

    now = timezone.now()
    user.totp_secret_encrypted = user.totp_pending_secret_encrypted
    user.totp_enabled = True
    user.totp_confirmed_at = now
    user.last_totp_verified_at = now
    user.totp_pending_secret_encrypted = ''
    user.totp_pending_expires_at = None
    user.save(update_fields=[
        'totp_secret_encrypted', 'totp_enabled', 'totp_confirmed_at',
        'last_totp_verified_at', 'totp_pending_secret_encrypted', 'totp_pending_expires_at',
    ])
    logger.info(
        'TOTP enrollment confirmed | user_id=%s | svc=%s',
        user.id, user.svc_number,
        extra={'event': 'totp_enroll_confirm_success'},
    )
    return Response({'message': 'Two-factor authentication enabled.'}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def totp_disable_view(request):
    """Self-service, all roles. Requires password re-entry."""
    user = request.user
    blocked = _reject_if_must_change_password(user)
    if blocked:
        return blocked

    ip_address = _get_client_ip(request)
    is_locked, lockout_msg, remaining_seconds = _totp_settings_guard.check(str(user.id), ip_address)
    if is_locked:
        return Response(
            {'error': lockout_msg, 'locked': True, 'retry_after_seconds': remaining_seconds},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    password = request.data.get('password')
    if not password or not user.check_password(password):
        _totp_settings_guard.record_failure(str(user.id), ip_address)
        return Response({'error': 'Incorrect password.'}, status=status.HTTP_400_BAD_REQUEST)

    _totp_settings_guard.clear(str(user.id), ip_address)

    user.totp_enabled = False
    user.totp_secret_encrypted = ''
    user.totp_confirmed_at = None
    user.totp_pending_secret_encrypted = ''
    user.totp_pending_expires_at = None
    user.save(update_fields=[
        'totp_enabled', 'totp_secret_encrypted', 'totp_confirmed_at',
        'totp_pending_secret_encrypted', 'totp_pending_expires_at',
    ])
    logger.info(
        'TOTP disabled | user_id=%s | svc=%s',
        user.id, user.svc_number,
        extra={'event': 'totp_disabled'},
    )
    return Response({'message': 'Two-factor authentication disabled.'}, status=status.HTTP_200_OK)


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def totp_verify_login_view(request):
    """Login-time TOTP check — parallel to verify_2fa_view's contract
    (re-supplies svc_number+password since no session exists between
    login_view and this step, matching the existing email-OTP flow)."""
    svc_number = request.data.get('svc_number')
    code = (request.data.get('code') or '').strip()
    password = request.data.get('password')
    ip_address = _get_client_ip(request)

    if not svc_number or not code or not password:
        return Response(
            {'error': 'svc_number, password, and code are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    is_locked, lockout_msg, remaining_seconds = _check_totp_lockout(svc_number, ip_address)
    if is_locked:
        return Response(
            {'error': lockout_msg, 'locked': True, 'retry_after_seconds': remaining_seconds},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    user = authenticate(request, svc_number=svc_number, password=password)
    if user is None or not user.is_active or not user.totp_enabled:
        _record_totp_failed(svc_number, ip_address)
        return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)

    secret_plain = decrypt_value(user.totp_secret_encrypted)
    if not _verify_totp_code(secret_plain, code):
        is_now_locked, remaining = _record_totp_failed(svc_number, ip_address)
        if is_now_locked:
            return Response(
                {'error': 'Too many failed attempts. Account temporarily locked.', 'locked': True},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        return Response(
            {'error': f'Invalid code. {remaining} attempt(s) remaining.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    _clear_totp_failed(svc_number, ip_address)
    # Belt-and-suspenders: login_view already clears the LOGIN namespace as
    # soon as the password check succeeds, but a full successful auth here
    # (password + TOTP code) is an unambiguous proof the password was
    # correct, so also clear any stray LOGIN-namespace counter for this
    # account directly.
    _login_guard.clear(svc_number, ip_address)

    user.last_totp_verified_at = timezone.now()
    user.save(update_fields=['last_totp_verified_at'])

    access, refresh, session_id = _get_tokens_for_user(user)
    _stamp_initial_activity(user, session_id)

    response_data = {
        'message': 'Login successful',
        'must_change_password': user.must_change_password,
        'user': UserListSerializer(user).data,
    }
    available_schools = _available_schools(user)
    if available_schools:
        response_data['available_schools'] = available_schools

    logger.info(
        'TOTP login verified | user_id=%s | svc=%s',
        user.id, svc_number,
        extra={'event': 'totp_verify_success'},
    )
    response = Response(response_data, status=status.HTTP_200_OK)
    return _set_token_cookies(response, access, refresh)


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def totp_recover_start_view(request):
    """'Forgot authenticator' — proves identity via the EXISTING email-OTP
    machinery (TwoFactorCode / _create_2fa_code / _send_2fa_email), not a
    new parallel OTP mechanism."""
    svc_number = request.data.get('svc_number')
    password = request.data.get('password')
    ip_address = _get_client_ip(request)

    is_locked, lockout_msg, remaining_seconds = _totp_recovery_guard.check(svc_number, ip_address)
    if is_locked:
        return Response(
            {'error': lockout_msg, 'locked': True, 'retry_after_seconds': remaining_seconds},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    # Wrong credentials or inactive account: give nothing away — the same
    # generic response is returned regardless of whether the svc_number
    # exists, so credential-stuffing can't be used to enumerate accounts.
    user = authenticate(request, svc_number=svc_number, password=password)
    if user is None or not user.is_active:
        _totp_recovery_guard.record_failure(svc_number, ip_address)
        return Response(
            {'message': 'If the account exists and has TOTP enabled, a recovery code has been sent.'},
            status=status.HTTP_200_OK,
        )

    _totp_recovery_guard.clear(svc_number, ip_address)

    # Password is now verified, so it's safe to be specific — the caller
    # already proved they hold the account's credentials.
    if not user.totp_enabled:
        return Response(
            {'error': 'Two-factor authentication is not enabled for this account.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not user.email:
        return Response(
            {'error': 'No email address on file. Contact your administrator.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    two_fa = _create_2fa_code(user)
    email_sent = _send_2fa_email(user, two_fa.code)

    if not email_sent:
        return Response(
            {'error': 'Failed to send recovery email. Please try again later.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    logger.info(
        'TOTP recovery started | user_id=%s | svc=%s',
        user.id, svc_number,
        extra={'event': 'totp_recovery_start'},
    )
    return Response(
        {'message': 'A recovery code has been sent to your email.', 'email': _mask_email(user.email)},
        status=status.HTTP_200_OK,
    )


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def totp_recover_confirm_view(request):
    """Verifies the email-OTP code, then clears TOTP entirely so the user
    must re-enroll. Does NOT issue JWTs — the user logs in fresh afterward
    through the normal (now email-OTP) flow."""
    svc_number = request.data.get('svc_number')
    password = request.data.get('password')
    code = (request.data.get('code') or '').strip()
    ip_address = _get_client_ip(request)

    if not svc_number or not code or not password:
        return Response(
            {'error': 'svc_number, password, and code are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    is_locked, lockout_msg, remaining_seconds = _totp_recovery_guard.check(svc_number, ip_address)
    if is_locked:
        return Response(
            {'error': lockout_msg, 'locked': True, 'retry_after_seconds': remaining_seconds},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    user = authenticate(request, svc_number=svc_number, password=password)
    if user is None or not user.is_active:
        _totp_recovery_guard.record_failure(svc_number, ip_address)
        return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)

    max_attempts = getattr(settings, 'TWO_FA_MAX_ATTEMPTS', 5)
    two_fa = TwoFactorCode.objects.filter(
        user=user, is_used=False, expires_at__gt=timezone.now(),
    ).order_by('-created_at').first()

    if not two_fa:
        return Response(
            {'error': 'No valid recovery code found. Please request a new one.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if two_fa.attempts >= max_attempts:
        return Response(
            {'error': 'Too many failed attempts. Please request a new code.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    if not secrets.compare_digest(two_fa.code, code):
        two_fa.attempts += 1
        two_fa.save(update_fields=['attempts'])
        remaining = max_attempts - two_fa.attempts
        return Response(
            {'error': f'Invalid code. {remaining} attempt(s) remaining.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    two_fa.is_used = True
    two_fa.save(update_fields=['is_used'])
    _totp_recovery_guard.clear(svc_number, ip_address)

    user.totp_enabled = False
    user.totp_secret_encrypted = ''
    user.totp_confirmed_at = None
    user.totp_pending_secret_encrypted = ''
    user.totp_pending_expires_at = None
    user.save(update_fields=[
        'totp_enabled', 'totp_secret_encrypted', 'totp_confirmed_at',
        'totp_pending_secret_encrypted', 'totp_pending_expires_at',
    ])
    logger.warning(
        'TOTP reset via recovery | user_id=%s | svc=%s',
        user.id, svc_number,
        extra={'event': 'totp_recovery_reset'},
    )
    return Response(
        {'message': 'Two-factor authentication has been reset. Please log in again and re-enroll.'},
        status=status.HTTP_200_OK,
    )
