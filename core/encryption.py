import base64
import hashlib
import hmac
import logging

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger(__name__)

_FERNET = None
_HASH_KEY = None


def _derive_keys(encryption_key: str):
    master = encryption_key.encode('utf-8')
    fernet_key = base64.urlsafe_b64encode(
        hashlib.sha256(master + b'fernet').digest()
    )
    hash_key = hashlib.sha512(master + b'hmac').digest()
    return fernet_key, hash_key


def _get_fernet() -> Fernet:
    global _FERNET
    if _FERNET is not None:
        return _FERNET

    raw_key = getattr(settings, 'BIOMETRIC_ENCRYPTION_KEY', None)
    if not raw_key:
        raise ImproperlyConfigured(
            'BIOMETRIC_ENCRYPTION_KEY is not set in Django settings. '
            'Add a 32+ character key to your .env file.'
        )
    if len(raw_key) < 32:
        raise ImproperlyConfigured(
            'BIOMETRIC_ENCRYPTION_KEY must be at least 32 characters long.'
        )

    fernet_key, _ = _derive_keys(raw_key)
    _FERNET = Fernet(fernet_key)
    return _FERNET


def _get_hash_key() -> bytes:
    global _HASH_KEY
    if _HASH_KEY is not None:
        return _HASH_KEY

    raw_key = getattr(settings, 'BIOMETRIC_ENCRYPTION_KEY', None)
    if not raw_key:
        raise ImproperlyConfigured(
            'BIOMETRIC_ENCRYPTION_KEY is not set in Django settings.'
        )

    _, _HASH_KEY = _derive_keys(raw_key)
    return _HASH_KEY


def encrypt_value(plaintext: str) -> str:

    if not plaintext:
        return ''
    fernet = _get_fernet()
    return fernet.encrypt(plaintext.encode('utf-8')).decode('utf-8')


def decrypt_value(ciphertext: str) -> str:

    if not ciphertext:
        return ''
    try:
        fernet = _get_fernet()
        return fernet.decrypt(ciphertext.encode('utf-8')).decode('utf-8')
    except InvalidToken:
        logger.error('Failed to decrypt value — invalid token or key mismatch')
        return ''
    except Exception as e:
        logger.error('Unexpected decryption error: %s', e)
        return ''


def deterministic_hash(value: str) -> str:
    if not value:
        return ''
    key = _get_hash_key()
    return hmac.new(
        key, value.encode('utf-8'), hashlib.sha256,
    ).hexdigest()


def generate_encryption_key() -> str:

    return Fernet.generate_key().decode('utf-8')
