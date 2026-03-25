import logging
from datetime import timedelta
from django.utils import timezone
from django.db import transaction
from zk import ZK

from core.models import(
    BiometricDevice, BiometricUserMapping, BiometricRecord, 
    AttendanceSessionLog, SessionAttendance, AttendanceSession, User
)

logger = logging.getLogger('biometric.sync')

class ZKTecoSyncService:

    def __init__(self, device: BiometricDevice):
        self.device = device
        self.zk = ZK(
            device.ip_address,
            port=device.port,
            timeout=device.connection_timeout
        )
        self.conn = None

    def connect(self):
        try:
            self.conn = self.zk.connect()
            self.conn.disable_device()
            logger.info(f'Connected to {self.device.name} at {self.device.ip_address}')
            return True
        except Exception as e:
            logger.error (f'Failed to connect to {self.device.name}: {e}')
            self.device.last_sync_status= f'connection_failed: {str(e)[:200]}'

        self.device.save(update_fields=['last_sync_status'])
        return False

    def disconnect(self):
        if self.conn:
            try:
                self.conn.enable_device()
                self.conn.disconnect()
            except Exception as e:
                logger.warning(f'Error disconnecting from {self.device.name}: {e}')

    
    def fetch_and_store_logs(self):
        if not self.connect():
            return {'status': 'error', 'message': 'Connection failed'}

        try:
            raw_logs = self.conn.get_attendance()
            if not raw_logs:
                self._update_sync_status('success', 0)
                return {'status': 'success', 'created': 0, 'processed': 0}

                if self.device.last_sync_at:
                    cutoff = self.device.last_sync_at = timedelta(minutes=5)
                    raw_logs = [l for l in raw_logs if l.timestamp >= cutoff.replace(tzinfo=None)]
                    created = 0
                    processed = 0
                    errors = []

                    for log in raw_logs:
                        try:
                            result = self._process_single_log(log)
                            if result == 'created':
                                created += 1
                            elif result == 'processed':
                                created += 1
                                processed += 1
                        except Exception as e:
                            errors.append(f'UserID {log.user_id}: {str(e)}')
                            logger.error(f'Error processing log: {e}', exc_info=True)

                    self._update_sync_status('success', created)

                    return {
                        'status': 'success',
                        'created': 'created',
                        'processed': 'processed',
                        'errors': 'errors',
                        'total_fetched': len(raw_logs),
                    }
        except Exception as e:
            logger.error(f'Sync failed for {self.device.name}: {e}', exc_info=True)
            self._update_sync_status(f'error: {str(e)[:200]}', 0)
            return {'status': 'error', 'message': str(e)}
        finally:
            self.disconnect()
        
    
    def _process_single_log(self, log):
        scan_time = timezone.make_aware(log.timestamp)
        if self.device.time_offset_seconds:
            scan_time += timedelta(seconds=self.device.time_offset_seconds)

        student = self._resolve_student(str(log.user_id))
        if not student:
            return 'skipped'

        exists = BiometricRecord.objects.filter(
            device_id = str(self.device.id),
            biometric_id=str(log.user_id),
            scan_time=scan_time

        ).exists()

        if exists:
            return 'duplicate'

        with transaction.atomic():
            record = BiometricRecord.objects.create(
                school = self.device.school,
                device_id = str(self.device.id),
                device_type = 'zkteco',
                device_name = self.device.name,
                student =student,
                biometric_id = str(log.user_id),
                scan_time = scan_time,
                verification_type = self._get_verification_type(log.punch),
                raw_data = {
                    'user_id': str(log.user_id),
                    'timestamp': str(log.timestamp),
                    'status': log.status,
                    'punch': log.punch,
                    'device_ip': self.device.ip_address,
                }

            )

            attendance = record.process_to_attendance()
            if attendance:
                return 'processed'
            return 'created'

    
    def _resolve_student(self, device_user_id):
        mapping = BiometricUserMapping.objects.filter(
            device = self.device,
            device_user_id=device_user_id,
            is_active=True
        ).select_related('student').first()

        if mapping:
            return mapping.student

        student = User.objects.filter(
            svc_number = device_user_id,
            role = 'student', 
            is_active=True,
            school = self.device.school
        ).first()

        if student:
            BiometricUserMapping.objects.get_or_create(
                device = self.device,
                device_user_id = device_user_id,
                defaults={
                    'school': self.device.school,
                    'student': student
                }
            )
            return student
            logger.warning(
                f'No student found for device user_id={device_user_id} '
                f'on device {self.device.name}'
            )
            return None

    def _get_verification_type(self, punch):
        types = {0: 'password', 1: 'fingerprint', 2: 'card'}
        return types.get(punch, f'unknown_{punch}')

    def _update_sync_status(self, status, count):
        self.device.last_sync_at = timezone.now()
        self.device.last_sync_status = status
        self.device.last_sync_records = count
        self.device.total_synced_records += count
        self.device.save(update_fields=[
            'last_sync_at', 'last_sync_status', 
            'last_sync_records', 'total_synced_records'
        ])
    
    def fetch_device_users(self):
        if not self.connect():
            return []
        try:
            users = self.conn.get_users()
            return [
                {
                    'uid': u.uid,
                    'user_id': u.user_id,
                    'name': u.name,
                    'privilege': u.privilege,
                }
                for u in users
            ]
        finally:
            self.disconnect()

    def get_device_info(self):
        if not self.connect():
            return None
        try:
            return {
                'firmware': self.conn.get_firmware_version(),
                'serial': self.conn.get_serialnumber(),
                'device_name': self.conn.get_device_name(),
                'platform': self.conn.get_platform(),
            }
        finally:
            self.disconnect()

    def sync_device_time(self):
        if not self.connect():
            return False
        try:
            self.conn.set_time(timezone.now())
            logger.info(f'Time synced for {self.device.name}')
            return True
        finally:
            self.disconnect()