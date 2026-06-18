from django.core.management.base import BaseCommand
from django.utils import timezone
from core.models import BiometricRecord, AttendanceSession
import sys

class Command(BaseCommand):
    help = 'Sync attendance from biometric devices and process pending records'

    def add_arguments(self, parser):
        parser.add_argument(
            '--device-id',
            type=str,
            help='Specific device ID to sync'
        )
        parser.add_argument(
            '--ip-address',
            type=str,
            help = 'IP address of the device'
        )
        parser.add_argument(
            '--port',
            type=int,
            default=4370,
            help='Port of the device (default=4370)'
        )
        parser.add_argument(
            '--process-pending',
            action='store_true',
            help = 'Process pending biometric records'
        )
        parser.add_argument(
            '--auto-mark-absent',
            action = 'store_true',
            help = 'Automatically mark absent students for completed sessions'
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting biometric sync...'))

        if options['device_id'] and options['ip_address']:
            self.sync_device(
                options['device_id'],
                options['ip_address'],
                option['port']
            )

        if options['process_pending']:
            self.process_pending_records()

        if options['auto_mark_absent']:
            self.auto_mark_absent()

        self.stdout.write(self.style.SUCCESS('Biometric sync completed'))

    def sync_device(self, device_id, ip_address, port):
        self.stdout.write(f'Connecting to device {device_id} at {ip_address}:{port}')

        try:
            from core.utils.zkteco_intergration import sync_zkteco_device

            result =sync_zkteco_device(device_id, ip_address, port)

            if result['success']:
                self.stdout.write(self.style.SUCCESS(
                    f" Created {result['created']} new records"
                ))

                if result.get('errors'):
                    self.stdout.write(self.style.WARNING(
                        f" {len(result['errors'])} errors occurred:"
                    ))
                    for error in result ['errors'][:5]:
                        self.stdout.write(f" -{error}")

            else:
                self.stdout.write(self.style.ERROR(
                    f" Sync failed: {result['error']}"
                ))
        except ImportError:
            self.stdout.write(self.style.ERROR(
                " ZKTeco intergration not available. Install required packages"
            ))
        except Exception as e:
            self.stdout.write(self.style.ERROR(
                f"Error during sync: {str(e)}"
            ))

    def process_pending_records(self):
        self.stdout.write('Processing pending biometric records..')

        pending = BiometricRecord.objects.filter(processed=False)
        pending_count =pending.count()

        if pending_count ==0:
            self.stdout.write(self.style.WARNING('No pending records to process'))
            return

        self.stdout.write(f'Found {pending_count} pending records')

        processed_count = 0
        failed_count = 0
        errors = []

        for record in pending:
            try:
                attendance = record.process_to_attendance()
                if attendance:
                    processed_count += 1
                    self.stdout.write(f'   Processed: {record.student.get_full_name()}')
                else:
                    failed_count += 1
                    error_msg = record.error_message or 'Unknown error'
                    errors.append(f'{record.id}: {error_msg}')
                    self.stdout.write(self.style.WARNING(
                        f' failed: {record.student.get_full_name()} - {error_msg}'
                    ))
            except Exception as e:
                failed_count += 1
                errors.append(f'{record.id}: {str(e)}')
                self.stdout.write(self.style.ERROR(
                    f' Error: {record.id} - {str(e)}'
                ))

        self.stdout.write(self.style.SUCCESS(
            f'\nProcessing complete: {processed_count} processed, {failed_count} failed'
        ))

        if errors:
            self.stdout.write(self.style.WARNING(
                f'\nErrors encountered:'
            ))
            for error in errors[:10]:
                self.stdout.write(f' - {error}')


    def auto_mark_absent(self):

        self.stdout.write('Auto-marking absent students...')
        from core.models import SessionAttendance, User, Enrollment

        from datetime import timedelta
        cutoff_date = timezone.now() - timedelta(days=7)

        completed_sessions = AttendanceSession.objects.filter(
            status='completed',
            actual_end__gte=cutoff_date
        )

        total_marked = 0

        for session in completed_sessions:
            marked_student_ids = session.sessio_attendances.values_list('student_id', flat=True)

            unmarked_students = User.objects.filter(
                enrollments__class_obj = session.class_obj,
                enrollments__is_active = True,
                role = 'student',
                is_active=True
            ).exclude(id__in=marked_student_ids)

            if unmarked_students.exists():

                absent_records = []
                for student in unmarked_students:
                    absent_records.append(SessionAttendance(
                        session=session,
                        student = student,
                        status='absent',
                        marking_method='admin',
                        remarks='Auto-marked  absent by system'
                    ))
                SessionAttendance.objects.bulk_create(absent_records)
                total_marked +=len(absent_records)


                self_stdout.write(
                    f' Session{session.id}: Marked{len(absent_records)} students as absent'
                )

        if total_marked == 0:
            self.stdout.write(self.style.WARNING('No students to mark as absent'))
        else:
            self.stdout.write(self.style.SUCCESS(
                f'\nTotal students marked as absent: {total_marked}'
            ))

            