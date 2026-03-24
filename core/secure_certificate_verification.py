import hashlib
import hmac
import logging
import time
import uuid

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from .models import Certificate

verification_logger = logging.getLogger("certificate.verification")

class CertificateVerificationSustainedThrottle(AnonRateThrottle):
    scope = "certificate_verify_sustained"
    rate = "50/hour"

class CertificateVerificationBurstThrottle(AnonRateThrottle):

    scope = "certificate_verify_burst"
    rate = "10/min"


def get_client_ip(request):
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


LOCKOUT_THRESHOLD = getattr(settings, "CERT_VERIFY_LOCKOUT_THRESHOLD", 20)
LOCKOUT_WINDOW = getattr(settings, "CERT_VERIFY_LOCKOUT_WINDOW", 900)
LOCKOUT_DURATION = getattr(settings, "CERT_VERIFY_LOCKOUT_DURATION", 1800)

def check_ip_lockout(ip_address):

    lockout_key = f"cert_verify:lockout:{ip_address}"
    return cache.get(lockout_key) is not None


def record_failed_attempt(ip_address):

    counter_key = f"cert_verify:failures:{ip_address}"
    lockout_key = f"cert_verify:lockout:{ip_address}"

    count = cache.get(counter_key, 0) + 1
    cache.set(counter_key, count, timeout=LOCKOUT_WINDOW)

    if count >= LOCKOUT_THRESHOLD:
        cache.set(lockout_key, True, timeout=LOCKOUT_DURATION)
        verification_logger.warning(
            "IP locked out after %d failed verification attempts", 
            count,
            extra={"ip_address": ip_address, "event": "ip_lockout"},
        )

    
VERIFICATION_CODE_LENGTH = 32
VALID_CODE_CHARS = set("ABCDEF0123456789")

def is_valid_code_format(code):

    if not code or len(code) != VERIFICATION_CODE_LENGTH:
        return False
    return all(c in VALID_CODE_CHARS for c in code.upper())


def apply_constant_time_delay(start_time, target_ms=150):

    elapsed_ms = (time.monotonic() - start_time) *1000
    remaining_ms = max(0, target_ms -elapsed_ms)
    if remaining_ms > 0:
        time.sleep(remaining_ms / 1000)


GENERIC_VERIFICATION_FAILURE = {
    "is_valid": False,
    "message": "Certificate could not be verified. Please check the code and try again",
}


class SecureCertificatePublicVerificationView(APIView):

    permission_classes = [AllowAny]
    throttle_classes = [
        CertificateVerificationBurstThrottle,
        CertificateVerificationSustainedThrottle,
    ]

    def post(self, request):
        start_time = time.monotonic()
        ip_address = get_client_ip(request)
        request_id = uuid.uuid4().hex[:12]
        raw_code = request.data.get("verification_code")
        verification_code = str(raw_code).strip() if raw_code is not None else ""


        if check_ip_lockout(ip_address):
            verification_logger.warning(
                "Blocked request from locked-out IP",
                extra={
                    "request_id": request_id,
                    "ip_address": ip_address,
                    "event": "blocked_lockout"
                },
            )

            apply_constant_time_delay(start_time)
            return Response(
                {
                    "is_valid":False,
                    "message": "Too many failed attempts. Please try again later.",
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        if not is_valid_code_format(verification_code):
            record_failed_attempt(ip_address)
            self._log_attempt(
                request_id=request_id,
                ip_address=ip_address,
                code_prefix = verification_code[:6] if verification_code else "empty",
                success = False,
                reason = "invalid_format"
            )

            apply_constant_time_delay(start_time)
            return Response(
                GENERIC_VERIFICATION_FAILURE,
                status=status.HTTP_200_OK
            )

        normalized_code = verification_code.upper()
        try:
            certificate = Certificate.all_objects.select_related("school").get(
                verification_code=normalized_code,
            )

        except Certificate.DoesNotExist:
            record_failed_attempt(ip_address)
            self._log_attempt(
                request_id= request_id,
                ip_address = ip_address,
                code_prefix = normalized_code[:6],
                success = False,
                reason= "not_found"
            )

            apply_constant_time_delay(start_time)
            return Response(
                GENERIC_VERIFICATION_FAILURE,
                status=status.HTTP_200_OK
            )


        self._log_attempt(
            request_id = request_id,
            ip_address = ip_address,
            code_prefix = normalized_code[:6],
            success = True,
            reason = "verified",
            certificate_id = str(certificate.id)
        )

        response_data = {
            "is_valid": certificate.is_valid,
            "certificate_number": certificate.certificate_number,
            "student_name":certificate.student_name,
            "course_name":certificate.course_name,
            "school_name":certificate.school.name if certificate.school else "",
            "status": certificate.status,
            "status_display": certificate.get_status_display(), 
        }


        try:
            certificate.record_view()
        except Exception:
            pass

        apply_constant_time_delay(start_time)
        return Response(response_data, status=status.HTTP_200_OK)


    def _log_attempt(self, *, request_id, ip_address, code_prefix, success, reason, certificate_id=None):

        log_data = {
            "request_id": request_id,
            "ip_address": ip_address,
            "code_prefix": code_prefix,
            "success": success,
            "reason": reason,
            "timestamp": timezone.now().isoformat(),
            "event": "certificate_verification",
        }

        if certificate_id:
            log_data["certificate_id"] = certificate_id

        if success:
            verification_logger.info("Certificate verified", extra=log_data)
        else:
            verification_logger.warning("Certificate verification failed", extra=log_data)