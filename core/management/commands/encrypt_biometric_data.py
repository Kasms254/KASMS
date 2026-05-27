"""
Migrate existing plaintext biometric data to encrypted fields.

Run once after deploying the encryption changes:
    python manage.py encrypt_biometric_data

This command is idempotent — it only processes records
that have plaintext data but no encrypted data.
"""
import json
import logging

from django.core.management.base import BaseCommand, CommandError

logger = logging.getLogger('biometric.migration')


class Command(BaseCommand):
    help = 'Encrypt existing plaintext biometric data at rest'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be migrated without making changes',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=500,
            help='Number of records to process per batch (default: 500)',
        )

    def handle(self, *args, **options):
        from core.models import BiometricRecord, BiometricUserMapping
        from core.encryption import encrypt_value, deterministic_hash

        dry_run = options['dry_run']
        batch_size = options['batch_size']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be made'))

        # Migrate BiometricRecord
        self.stdout.write('Migrating BiometricRecord...')
        records_to_migrate = BiometricRecord.all_objects.filter(
            biometric_id__gt='',  # Has plaintext data
            biometric_id_encrypted='',  # Not yet encrypted
        )
        total_records = records_to_migrate.count()
        self.stdout.write(f'  Found {total_records} records to migrate')

        migrated_records = 0
        for record in records_to_migrate.iterator(chunk_size=batch_size):
            if dry_run:
                migrated_records += 1
                continue

            try:
                record.biometric_id_encrypted = encrypt_value(record.biometric_id)
                record.biometric_id_hash = deterministic_hash(record.biometric_id)

                if record.raw_data:
                    record.raw_data_encrypted = encrypt_value(json.dumps(record.raw_data))

                record.save(update_fields=[
                    'biometric_id_encrypted', 'biometric_id_hash',
                    'raw_data_encrypted',
                ])
                migrated_records += 1
            except Exception as e:
                self.stderr.write(f'  ERROR migrating record {record.id}: {e}')
                logger.error('Failed to migrate BiometricRecord %s: %s', record.id, e)

        self.stdout.write(self.style.SUCCESS(
            f'  Migrated {migrated_records}/{total_records} BiometricRecord entries'
        ))

        # Migrate BiometricUserMapping
        self.stdout.write('Migrating BiometricUserMapping...')
        mappings_to_migrate = BiometricUserMapping.all_objects.filter(
            device_user_id__gt='',  # Has plaintext data
            device_user_id_encrypted='',  # Not yet encrypted
        )
        total_mappings = mappings_to_migrate.count()
        self.stdout.write(f'  Found {total_mappings} mappings to migrate')

        migrated_mappings = 0
        for mapping in mappings_to_migrate.iterator(chunk_size=batch_size):
            if dry_run:
                migrated_mappings += 1
                continue

            try:
                mapping.device_user_id_encrypted = encrypt_value(mapping.device_user_id)
                mapping.device_user_id_hash = deterministic_hash(mapping.device_user_id)

                if mapping.device_user_name:
                    mapping.device_user_name_encrypted = encrypt_value(mapping.device_user_name)

                mapping.save(update_fields=[
                    'device_user_id_encrypted', 'device_user_id_hash',
                    'device_user_name_encrypted',
                ])
                migrated_mappings += 1
            except Exception as e:
                self.stderr.write(f'  ERROR migrating mapping {mapping.id}: {e}')
                logger.error('Failed to migrate BiometricUserMapping %s: %s', mapping.id, e)

        self.stdout.write(self.style.SUCCESS(
            f'  Migrated {migrated_mappings}/{total_mappings} BiometricUserMapping entries'
        ))

        # Summary
        total = migrated_records + migrated_mappings
        if dry_run:
            self.stdout.write(self.style.WARNING(
                f'\nDRY RUN complete. {total} records would be encrypted.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f'\nMigration complete. {total} fields encrypted at rest.'
            ))
            self.stdout.write(self.style.WARNING(
                '⚠️  IMPORTANT: Keep BIOMETRIC_ENCRYPTION_KEY safe. '
                'Losing it means losing access to all encrypted data.'
            ))
