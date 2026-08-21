import re

import django.db.models.manager
from django.db import migrations, models
import django.db.models.deletion
from django.utils import timezone


SUFFIX_RE = re.compile(r'/(\d+)$')


def backfill_certificate_sequences(apps, schema_editor):

    Certificate = apps.get_model('core', 'Certificate')
    CertificateSequence = apps.get_model('core', 'CertificateSequence')
    db = schema_editor.connection.alias

    max_by_key = {}
    malformed_ids = []

    rows = (
        Certificate.objects.using(db)
        .values('id', 'school_id', 'certificate_number', 'issued_at')
        .iterator()
    )
    for row in rows:
        number = row['certificate_number'] or ''
        issued_at = row['issued_at']
        match = SUFFIX_RE.search(number)
        if not match or issued_at is None:
            malformed_ids.append(row['id'])
            continue
        year = timezone.localtime(issued_at).year
        seq = int(match.group(1))
        key = (row['school_id'], year)
        if seq > max_by_key.get(key, 0):
            max_by_key[key] = seq

    for (school_id, year), max_seq in max_by_key.items():
        CertificateSequence.all_objects.using(db).update_or_create(
            school_id=school_id, year=year,
            defaults={'next_number': max_seq + 1},
        )

    if malformed_ids:
        print(
            f"[0037_certificate_sequence] {len(malformed_ids)} certificate(s) had a "
            f"certificate_number that didn't match the expected '.../NNNN' suffix and "
            f"were excluded from sequence backfill (ids: {malformed_ids[:20]}"
            f"{', ...' if len(malformed_ids) > 20 else ''}). They were NOT modified — "
            f"review manually if the numbering for their school/year looks off."
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0036_coursereportauditlog_photo_actions'),
    ]

    operations = [
        migrations.CreateModel(
            name='CertificateSequence',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('year', models.PositiveIntegerField()),
                ('next_number', models.PositiveIntegerField(default=1)),
                ('school', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='certificate_sequences', to='core.school')),
            ],
            options={
                'db_table': 'certificate_sequences',
            },
        ),
        migrations.AddConstraint(
            model_name='certificatesequence',
            constraint=models.UniqueConstraint(fields=('school', 'year'), name='unique_certificate_sequence_per_school_year'),
        ),
        migrations.AlterModelManagers(
            name='certificatesequence',
            managers=[
                ('all_objects', django.db.models.manager.Manager()),
            ],
        ),
        migrations.RunPython(backfill_certificate_sequences, noop_reverse),
    ]
