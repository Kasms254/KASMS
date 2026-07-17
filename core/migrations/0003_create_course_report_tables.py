# This migration originally created course_reports, course_report_stage_remarks,
# and course_report_audit_logs directly via raw SQL (CREATE TABLE IF NOT EXISTS).
#
# On production this migration was fake-applied, so that SQL never actually ran —
# those three tables were created for real later, by
# 0029_add_course_reports_and_reconcile_state. Kept as a no-op here (rather than
# deleted) because later migrations depend on this name and production's
# django_migrations table already has it recorded as applied.
#
# If the original RunSQL ran for real on a from-scratch replay (any environment
# migrating zero-to-head, not just production's actual fake-applied path),
# 0029's CreateModel for those same three tables would fail with
# "relation already exists". Neutering the SQL here keeps a fresh replay
# consistent with what already happened on production.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_biometricdevice_certificatetemplate_department_and_more'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[],
        ),
    ]
