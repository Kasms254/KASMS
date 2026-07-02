from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_biometricdevice_certificatetemplate_department_and_more'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                CREATE TABLE IF NOT EXISTS "course_reports" (
                    "id"             uuid                     NOT NULL PRIMARY KEY,
                    "school_id"      uuid                     NOT NULL,
                    "enrollment_id"  bigint                   NOT NULL,
                    "class_obj_id"   bigint                   NOT NULL,
                    "status"         varchar(30)              NOT NULL DEFAULT 'instructor_draft',
                    "created_by_id"  bigint                   NULL,
                    "report_file"    varchar(100)             NULL,
                    "is_active"      boolean                  NOT NULL DEFAULT TRUE,
                    "created_at"     timestamp with time zone NOT NULL,
                    "updated_at"     timestamp with time zone NOT NULL,
                    CONSTRAINT "course_reports_school_id_fkey"
                        FOREIGN KEY ("school_id") REFERENCES "schools" ("id")
                        DEFERRABLE INITIALLY DEFERRED,
                    CONSTRAINT "course_reports_enrollment_id_fkey"
                        FOREIGN KEY ("enrollment_id") REFERENCES "enrollments" ("id")
                        DEFERRABLE INITIALLY DEFERRED,
                    CONSTRAINT "course_reports_class_obj_id_fkey"
                        FOREIGN KEY ("class_obj_id") REFERENCES "classes" ("id")
                        DEFERRABLE INITIALLY DEFERRED,
                    CONSTRAINT "course_reports_created_by_id_fkey"
                        FOREIGN KEY ("created_by_id") REFERENCES "users" ("id")
                        ON DELETE SET NULL
                        DEFERRABLE INITIALLY DEFERRED
                );

                CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_report_per_enrollment"
                    ON "course_reports" ("enrollment_id")
                    WHERE "is_active" = TRUE;

                CREATE INDEX IF NOT EXISTS "course_repo_school__00c3d8_idx"
                    ON "course_reports" ("school_id", "is_active");
                CREATE INDEX IF NOT EXISTS "course_repo_class_o_4787e7_idx"
                    ON "course_reports" ("class_obj_id", "status");
                CREATE INDEX IF NOT EXISTS "course_repo_class_o_4707ad_idx"
                    ON "course_reports" ("class_obj_id", "is_active");
                CREATE INDEX IF NOT EXISTS "course_repo_enrollm_d42a4a_idx"
                    ON "course_reports" ("enrollment_id", "is_active");
                CREATE INDEX IF NOT EXISTS "course_repo_status_8b0725_idx"
                    ON "course_reports" ("status", "is_active");

                CREATE TABLE IF NOT EXISTS "course_report_stage_remarks" (
                    "id"                          uuid                     NOT NULL PRIMARY KEY,
                    "report_id"                   uuid                     NOT NULL,
                    "stage"                       varchar(20)              NOT NULL,
                    "author_id"                   bigint                   NULL,
                    "content"                     text                     NULL,
                    "character_and_personality"   text                     NULL,
                    "knowledge_and_ability"       text                     NULL,
                    "command_and_leadership"      text                     NULL,
                    "strengths"                   text                     NULL,
                    "weaknesses"                  text                     NULL,
                    "deployment_recommendation"   text                     NULL,
                    "is_submitted"                boolean                  NOT NULL DEFAULT FALSE,
                    "created_at"                  timestamp with time zone NOT NULL,
                    "updated_at"                  timestamp with time zone NOT NULL,
                    CONSTRAINT "course_report_stage_remarks_report_id_fkey"
                        FOREIGN KEY ("report_id") REFERENCES "course_reports" ("id")
                        ON DELETE CASCADE
                        DEFERRABLE INITIALLY DEFERRED,
                    CONSTRAINT "course_report_stage_remarks_author_id_fkey"
                        FOREIGN KEY ("author_id") REFERENCES "users" ("id")
                        ON DELETE SET NULL
                        DEFERRABLE INITIALLY DEFERRED,
                    CONSTRAINT "unique_stage_per_report"
                        UNIQUE ("report_id", "stage")
                );

                CREATE INDEX IF NOT EXISTS "course_report_stage_remarks_stage_idx"
                    ON "course_report_stage_remarks" ("stage");

                CREATE TABLE IF NOT EXISTS "course_report_audit_logs" (
                    "id"             uuid                     NOT NULL PRIMARY KEY,
                    "report_id"      uuid                     NOT NULL,
                    "action"         varchar(30)              NOT NULL,
                    "performed_by_id" bigint                  NULL,
                    "metadata"       jsonb                    NOT NULL DEFAULT '{}',
                    "created_at"     timestamp with time zone NOT NULL,
                    CONSTRAINT "course_report_audit_logs_report_id_fkey"
                        FOREIGN KEY ("report_id") REFERENCES "course_reports" ("id")
                        ON DELETE CASCADE
                        DEFERRABLE INITIALLY DEFERRED,
                    CONSTRAINT "course_report_audit_logs_performed_by_id_fkey"
                        FOREIGN KEY ("performed_by_id") REFERENCES "users" ("id")
                        ON DELETE SET NULL
                        DEFERRABLE INITIALLY DEFERRED
                );

                CREATE INDEX IF NOT EXISTS "course_repo_report__952291_idx"
                    ON "course_report_audit_logs" ("report_id", "action");
                CREATE INDEX IF NOT EXISTS "course_repo_perform_ee5541_idx"
                    ON "course_report_audit_logs" ("performed_by_id", "created_at");
            """,
            reverse_sql="""
                DROP TABLE IF EXISTS "course_report_audit_logs";
                DROP TABLE IF EXISTS "course_report_stage_remarks";
                DROP TABLE IF EXISTS "course_reports";
            """,
        ),
    ]
