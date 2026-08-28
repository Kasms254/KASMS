import datetime
import uuid
from decimal import Decimal

REDACTED = '[REDACTED]'

_SENSITIVE_KEY_MARKERS = (
    'password', 'token', 'secret', 'totp', 'csrf',
    'authorization', 'api_key', 'apikey', 'credential', 'session',
)

_MAX_METADATA_DEPTH = 4
_MAX_STRING_LENGTH = 500


def _is_sensitive_key(key: str) -> bool:
    key_lower = str(key).lower()
    return any(marker in key_lower for marker in _SENSITIVE_KEY_MARKERS)


def sanitize_payload(data, *, _depth: int = 0):

    if _depth >= _MAX_METADATA_DEPTH:
        return '[TRUNCATED]'

    if isinstance(data, dict):
        result = {}
        for key, value in data.items():
            if _is_sensitive_key(key):
                result[key] = REDACTED
            else:
                result[key] = sanitize_payload(value, _depth=_depth + 1)
        return result

    if isinstance(data, (list, tuple)):
        return [sanitize_payload(item, _depth=_depth + 1) for item in data]

    if isinstance(data, str) and len(data) > _MAX_STRING_LENGTH:
        return data[:_MAX_STRING_LENGTH] + '...[truncated]'

    if isinstance(data, (Decimal, uuid.UUID)):
        return str(data)

    if isinstance(data, (datetime.datetime, datetime.date)):
        return data.isoformat()

    return data
