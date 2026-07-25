import logging
from datetime import timedelta

from django.core.cache import cache
from django.utils import timezone
from rest_framework.settings import api_settings

logger = logging.getLogger(__name__)


def get_client_ip(request):

    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    remote_addr = request.META.get('REMOTE_ADDR', 'unknown')
    num_proxies = api_settings.NUM_PROXIES

    if num_proxies is not None:
        if num_proxies == 0 or not x_forwarded_for:
            return remote_addr
        addrs = x_forwarded_for.split(',')
        return addrs[-min(num_proxies, len(addrs))].strip()

    if x_forwarded_for:
        return x_forwarded_for.split(',')[-1].strip()
    return remote_addr


class LockoutGuard:


    def __init__(self, namespace, max_attempts, ip_max_attempts,
                 lockout_duration, attempt_window,
                 log_label, locked_message, locked_message_ip):
        self.namespace = namespace
        self.max_attempts = max_attempts
        self.ip_max_attempts = ip_max_attempts
        self.lockout_duration = lockout_duration
        self.attempt_window = attempt_window
        self.log_label = log_label
        self.locked_message = locked_message
        self.locked_message_ip = locked_message_ip
        self._event_slug = namespace.replace('-', '_')

    def _cache_keys(self, identifier, ip_address=None):
        safe_id = (identifier or 'unknown').replace(' ', '_')
        keys = {
            'acct_failures': f'{self.namespace}:failures:acct:{safe_id}',
            'acct_lockout': f'{self.namespace}:lockout:acct:{safe_id}',
        }
        if ip_address:
            keys['ip_failures'] = f'{self.namespace}:failures:ip:{ip_address}'
            keys['ip_lockout'] = f'{self.namespace}:lockout:ip:{ip_address}'
        return keys

    @staticmethod
    def _minutes_remaining(locked_until):
        remaining = max(0, int((locked_until - timezone.now()).total_seconds()))
        minutes = remaining // 60 + (1 if remaining % 60 else 0)
        return remaining, minutes

    def check(self, identifier, ip_address=None):
        keys = self._cache_keys(identifier, ip_address)

        acct_locked_until = cache.get(keys['acct_lockout'])
        if acct_locked_until:
            remaining, minutes = self._minutes_remaining(acct_locked_until)
            return True, self.locked_message.format(minutes=minutes), remaining

        if ip_address:
            ip_locked_until = cache.get(keys['ip_lockout'])
            if ip_locked_until:
                remaining, minutes = self._minutes_remaining(ip_locked_until)
                return True, self.locked_message_ip.format(minutes=minutes), remaining

        return False, None, 0

    def _increment(self, key, timeout):

        cache.add(key, 0, timeout=timeout)
        try:
            return cache.incr(key)
        except ValueError:
            # Key expired between add() and incr() — reinitialize.
            cache.add(key, 1, timeout=timeout)
            return cache.get(key, 1)

    def record_failure(self, identifier, ip_address=None):
        keys = self._cache_keys(identifier, ip_address)
        locked = False

        acct_count = self._increment(keys['acct_failures'], self.attempt_window)
        if acct_count >= self.max_attempts:
            lockout_until = timezone.now() + timedelta(seconds=self.lockout_duration)
            cache.set(keys['acct_lockout'], lockout_until, timeout=self.lockout_duration)
            locked = True
            logger.warning(
                '%s lockout triggered | key=%s | attempts=%d',
                self.log_label, keys['acct_failures'], acct_count,
                extra={'event': f'{self._event_slug}_lockout'},
            )

        if ip_address and 'ip_failures' in keys:
            ip_count = self._increment(keys['ip_failures'], self.attempt_window)
            if ip_count >= self.ip_max_attempts:
                lockout_until = timezone.now() + timedelta(seconds=self.lockout_duration)
                cache.set(keys['ip_lockout'], lockout_until, timeout=self.lockout_duration)
                locked = True
                logger.warning(
                    '%s IP lockout triggered | ip=%s | attempts=%d',
                    self.log_label, ip_address, ip_count,
                    extra={'event': f'{self._event_slug}_ip_lockout'},
                )

        remaining = max(0, self.max_attempts - acct_count)
        return locked, remaining

    def clear(self, identifier, ip_address=None):
        keys = self._cache_keys(identifier, ip_address)
        cache.delete_many(list(keys.values()))
