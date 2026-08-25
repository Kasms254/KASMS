import ipaddress
import logging
import uuid

from django.contrib.contenttypes.models import ContentType
from django.db import transaction

from core.rate_limiting import get_client_ip

from .utils import sanitize_payload

logger = logging.getLogger(__name__)

_USER_AGENT_MAX_LENGTH = 300


def audit_event(
    action, *, request=None, actor=None, target=None,
    target_content_type=None, target_object_id=None, target_repr=None,
    school=None, description='', changes=None, metadata=None, success=True,
):
    try:
        resolved_actor = _resolve_actor(request, actor)
        resolved_school = _resolve_school(school, target, resolved_actor)
        resolved_content_type, resolved_object_id, resolved_repr = _resolve_target(
            target, target_content_type, target_object_id, target_repr,
        )
        request_id, ip_address, user_agent = _resolve_request_context(request)

        fields = dict(
            action=action,
            actor=resolved_actor,
            actor_identifier=_actor_identifier(resolved_actor),
            actor_display_name=resolved_actor.get_full_name() if resolved_actor else '',
            actor_role=resolved_actor.get_role_display() if resolved_actor else '',
            school=resolved_school,
            school_name=resolved_school.name if resolved_school else '',
            target_content_type=resolved_content_type,
            target_object_id=resolved_object_id,
            target_repr=resolved_repr,
            description=description,
            changes=sanitize_payload(changes or {}),
            metadata=sanitize_payload(metadata or {}),
            request_id=request_id,
            ip_address=ip_address,
            user_agent=user_agent,
            success=success,
        )
    except Exception:
        logger.exception("Failed to prepare audit event: %s", action)
        return

    transaction.on_commit(lambda: _write(action, fields))


def _write(action, fields):
    try:
        from .models import AuditLog
        AuditLog.objects.create(**fields)
    except Exception:
        logger.exception("Failed to write audit event: %s", action)


def _resolve_actor(request, actor):
    if actor is not None:
        return actor
    if request is not None and getattr(request, 'user', None) and request.user.is_authenticated:
        return request.user
    return None


def _actor_identifier(actor):
    if not actor:
        return 'system'
    return actor.svc_number or actor.username or f'user:{actor.pk}'


def _resolve_school(school, target, actor):
    if school is not None:
        return school
    target_school = getattr(target, 'school', None)
    if target_school is not None:
        return target_school
    if actor is not None:
        return actor.school
    return None


def _resolve_target(target, content_type, object_id, repr_):
    if target is not None:
        return (
            ContentType.objects.get_for_model(target),
            str(target.pk),
            repr_ if repr_ is not None else str(target),
        )
    return content_type, object_id or '', repr_ or ''


def _resolve_request_context(request):
    if request is None:
        return uuid.uuid4().hex, None, ''
    request_id = getattr(request, 'audit_request_id', None) or uuid.uuid4().hex
    ip_address = _clean_ip(get_client_ip(request))
    user_agent = request.META.get('HTTP_USER_AGENT', '')[:_USER_AGENT_MAX_LENGTH]
    return request_id, ip_address, user_agent


def _clean_ip(raw_ip):

    try:
        ipaddress.ip_address(raw_ip)
        return raw_ip
    except (ValueError, TypeError):
        return None
