"""
Migration: Scope class_code uniqueness from global → per-course.

Safety strategy for existing duplicates
----------------------------------------
We scan for (course_id, class_code) pairs that appear more than once and
ABORT the migration with a descriptive error listing the offending rows.

Rationale: silently auto-renaming codes could silently break enrolment
look-ups, QR codes, or printed certificates that already reference those
codes.  It is safer to surface the problem and let an admin resolve it
manually (e.g. python manage.py shell → update the offending rows) before
running the migration.

To list duplicates without running the migration:
    python manage.py shell -c "
    from django.db import connection
    with connection.cursor() as c:
        c.execute('''
            SELECT course_id, class_code, COUNT(*) n
            FROM classes
            WHERE class_code IS NOT NULL
            GROUP BY course_id, class_code
            HAVING COUNT(*) > 1
        ''')
        for row in c.fetchall():
            print(row)
    "
"""

from django.db import migrations, models


def check_for_duplicates(apps, schema_editor):
    """Abort if duplicate (course, class_code) pairs exist."""
    db_alias = schema_editor.connection.alias
    Class = apps.get_model('core', 'Class')

    from django.db.models import Count
    duplicates = (
        Class.objects.using(db_alias)
        .filter(class_code__isnull=False)
        .values('course_id', 'class_code')
        .annotate(n=Count('id'))
        .filter(n__gt=1)
    )

    if duplicates.exists():
        rows = list(duplicates.values_list('course_id', 'class_code', 'n'))
        detail = '\n'.join(
            f"  course_id={c}  class_code={code!r}  ({n} rows)"
            for c, code, n in rows
        )
        raise Exception(
            "Migration aborted: duplicate class_code values exist within the same course.\n"
            "Resolve these duplicates manually before re-running the migration:\n"
            + detail
        )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0007_alter_biometricdevice_unique_together_and_more'),
    ]

    operations = [
        # 1. Guard: fail fast if data would violate the new constraint.
        migrations.RunPython(check_for_duplicates, migrations.RunPython.noop),

        # 2. Drop the old global unique constraint that lives on the column itself.
        migrations.AlterField(
            model_name='class',
            name='class_code',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),

        # 3. Add composite unique constraint (course + class_code), NULL-safe.
        migrations.AddConstraint(
            model_name='class',
            constraint=models.UniqueConstraint(
                condition=models.Q(class_code__isnull=False),
                fields=['course', 'class_code'],
                name='unique_class_code_per_course',
            ),
        ),

    ]
