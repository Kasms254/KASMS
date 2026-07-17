# Hand-written migration: migration 0019 was recorded as applied but the DDL
# never executed against the database.  This migration applies only the missing
# SQL without touching Django's projected model state (state_operations=[]).

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0021_instructor_remark_subfields'),
    ]

    # state_operations=[] tells Django the model state is already correct
    # (migration 0019 is marked applied), so only the raw SQL runs.
    operations = [
        migrations.RunSQL(
            sql="""
                -- 1. Add the missing FK column
                ALTER TABLE result_edit_requests
                    ADD COLUMN IF NOT EXISTS component_result_id uuid
                    REFERENCES student_component_results(id)
                    DEFERRABLE INITIALLY DEFERRED;

                -- 2. Add index on (component_result_id, status)
                CREATE INDEX IF NOT EXISTS result_edit_compone_c2dca8_idx
                    ON result_edit_requests (component_result_id, status);

                -- 3. Drop the old single-column unique constraint that 0019 was meant to remove
                ALTER TABLE result_edit_requests
                    DROP CONSTRAINT IF EXISTS unique_pending_edit_request_per_result;

                -- 4. Add the two replacement partial-unique constraints (partial indexes)
                DROP INDEX IF EXISTS unique_pending_edit_request_per_exam_result;
                CREATE UNIQUE INDEX unique_pending_edit_request_per_exam_result
                    ON result_edit_requests (exam_result_id)
                    WHERE (exam_result_id IS NOT NULL AND status = 'pending');

                DROP INDEX IF EXISTS unique_pending_edit_request_per_component_result;
                CREATE UNIQUE INDEX unique_pending_edit_request_per_component_result
                    ON result_edit_requests (component_result_id)
                    WHERE (component_result_id IS NOT NULL AND status = 'pending');
            """,
            reverse_sql=migrations.RunSQL.noop,
            state_operations=[],
        ),
    ]
