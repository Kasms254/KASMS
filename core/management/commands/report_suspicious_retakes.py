"""
READ-ONLY report of component retake attempts that may have been created by
the instructor grading pagination bug (instructor UI read only page 1 of
/api/component-results/, so graded students looked ungraded and re-entering
their marks created attempt N+1).

This command never writes: it runs inside a transaction that is marked READ
ONLY on PostgreSQL and is always rolled back. Output is for human review only.

    python manage.py report_suspicious_retakes
    python manage.py report_suspicious_retakes --since 2026-05-19 --csv /tmp/suspicious.csv
"""
import csv
from collections import defaultdict
from datetime import datetime, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.db.models import Count
from django.utils import timezone

from core.models import Exam, StudentComponentResult

# Commit e3bef68 (2026-05-19) introduced the page-1-only read in AddResults.jsx.
DEFAULT_BUG_WINDOW_START = '2026-05-19'
BATCH_WINDOW = timedelta(minutes=2)
QUICK_RETAKE_WINDOW = timedelta(hours=24)


class _ReadOnlyRollback(Exception):
    pass


def _csv_safe(value):
    """Neutralise spreadsheet formula injection from user-entered names/titles."""
    if isinstance(value, str) and value[:1] in ('=', '+', '-', '@', '\t', '\r'):
        return "'" + value
    return value


class Command(BaseCommand):
    help = 'Read-only report of retake attempts possibly created by the grading pagination bug.'

    def add_arguments(self, parser):
        parser.add_argument('--since', default=DEFAULT_BUG_WINDOW_START,
                            help='Start of the suspected bug window (YYYY-MM-DD).')
        parser.add_argument('--school', help='Limit to one school id.')
        parser.add_argument('--csv', dest='csv_path', help='Write per-record details to this CSV file.')

    def handle(self, *args, **options):
        try:
            since = timezone.make_aware(datetime.strptime(options['since'], '%Y-%m-%d'))
        except ValueError as exc:
            raise CommandError('--since must be YYYY-MM-DD') from exc

        try:
            with transaction.atomic():
                if connection.vendor == 'postgresql':
                    with connection.cursor() as cursor:
                        cursor.execute('SET TRANSACTION READ ONLY')
                self._report(since, options.get('school'), options.get('csv_path'))
                raise _ReadOnlyRollback
        except _ReadOnlyRollback:
            pass

    def _report(self, since, school_id, csv_path):
        retakes = StudentComponentResult.all_objects.filter(attempt_number__gt=1, is_retake=True)
        if school_id:
            retakes = retakes.filter(school_id=school_id)
        retakes = list(retakes.select_related(
            'school', 'component', 'component__subject', 'student', 'graded_by',
        ).order_by('component_id', 'created_at', 'pk'))

        self.stdout.write(f'Retake rows (attempt_number > 1, is_retake=True): {len(retakes)}')
        self._report_constraint_health()
        if not retakes:
            return

        previous_by_key = {
            (r.student_id, r.component_id, r.attempt_number): r
            for r in StudentComponentResult.all_objects.filter(
                component_id__in={r.component_id for r in retakes},
                student_id__in={r.student_id for r in retakes},
            )
        }
        exams_by_component = defaultdict(list)
        for exam in Exam.all_objects.filter(component_id__in={r.component_id for r in retakes}).order_by('id'):
            exams_by_component[exam.component_id].append(f'{exam.id}:{exam.title}')

        # Retakes saved by the same grader on the same component within a short window
        # indicate one bulk "Save All Grades" request.
        batch_sizes = {}
        by_group = defaultdict(list)
        for r in retakes:
            by_group[(r.component_id, r.graded_by_id)].append(r)
        for group in by_group.values():
            for r in group:
                batch_sizes[r.pk] = sum(1 for o in group if abs(o.created_at - r.created_at) <= BATCH_WINDOW)

        rows = []
        for r in retakes:
            prev = previous_by_key.get((r.student_id, r.component_id, r.attempt_number - 1))
            flags = []
            if prev is None:
                flags.append('NO_PREVIOUS_ATTEMPT')
            else:
                prev_passed = prev.status == 'PASS' or (
                    prev.percentage is not None and prev.percentage >= r.component.pass_mark
                )
                if prev_passed:
                    flags.append('PREVIOUS_ATTEMPT_PASSED')
                if prev.marks_obtained is not None and prev.marks_obtained == r.marks_obtained:
                    flags.append('SAME_MARKS_AS_PREVIOUS')
                if r.created_at - prev.created_at <= QUICK_RETAKE_WINDOW:
                    flags.append('WITHIN_24H_OF_PREVIOUS')
            if r.created_at >= since:
                flags.append('IN_BUG_WINDOW')
            if batch_sizes[r.pk] >= 3:
                flags.append(f'BULK_BATCH_{batch_sizes[r.pk]}')
            if r.graded_by and r.graded_by.role == 'instructor':
                flags.append('GRADED_BY_INSTRUCTOR')

            if {'NO_PREVIOUS_ATTEMPT', 'PREVIOUS_ATTEMPT_PASSED', 'SAME_MARKS_AS_PREVIOUS'} & set(flags):
                risk = 'HIGH'
            elif 'IN_BUG_WINDOW' in flags and (
                'WITHIN_24H_OF_PREVIOUS' in flags or any(f.startswith('BULK_BATCH_') for f in flags)
            ):
                risk = 'MEDIUM'
            else:
                risk = 'LOW'

            rows.append({
                'risk': risk,
                'result_id': r.pk,
                'school': r.school.code if r.school else '',
                'component_id': r.component_id,
                'component': r.component.name,
                'subject': r.component.subject.name,
                'exams': '; '.join(exams_by_component.get(r.component_id, [])),
                'student_id': r.student_id,
                'student_svc_number': r.student.svc_number,
                'attempt_number': r.attempt_number,
                'marks': r.marks_obtained,
                'status': r.status,
                'previous_marks': prev.marks_obtained if prev else '',
                'previous_status': prev.status if prev else '',
                'previous_created_at': prev.created_at.isoformat() if prev else '',
                'created_at': r.created_at.isoformat(),
                'graded_by': r.graded_by.svc_number if r.graded_by else '',
                'flags': ','.join(flags),
            })

        by_risk = defaultdict(int)
        for row in rows:
            by_risk[row['risk']] += 1
        self.stdout.write(
            f"By risk: HIGH={by_risk['HIGH']} MEDIUM={by_risk['MEDIUM']} LOW={by_risk['LOW']}"
        )
        self.stdout.write(f'In bug window (since {since.date()}): '
                          f"{sum('IN_BUG_WINDOW' in row['flags'] for row in rows)}")
        self.stdout.write(f"Affected students: {len({row['student_id'] for row in rows})}")

        self.stdout.write('\nPer component (HIGH/MEDIUM/LOW, first..last created):')
        per_component = defaultdict(list)
        for row in rows:
            per_component[row['component_id']].append(row)
        for component_rows in per_component.values():
            first = component_rows[0]
            counts = defaultdict(int)
            for row in component_rows:
                counts[row['risk']] += 1
            self.stdout.write(
                f"  [{first['school']}] {first['subject']} / {first['component']} "
                f"(exams: {first['exams'] or 'none'}): "
                f"{counts['HIGH']}/{counts['MEDIUM']}/{counts['LOW']}, "
                f"{component_rows[0]['created_at'][:16]} .. {component_rows[-1]['created_at'][:16]}"
            )

        if csv_path:
            with open(csv_path, 'w', newline='') as handle:
                writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows({key: _csv_safe(value) for key, value in row.items()} for row in rows)
            self.stdout.write(f'\nWrote {len(rows)} rows to {csv_path}')

        self.stdout.write('\nNo data was modified. Review HIGH rows first; do not delete without sign-off.')

    def _report_constraint_health(self):
        duplicates = (
            StudentComponentResult.all_objects
            .values('student_id', 'component_id', 'attempt_number')
            .order_by()
            .annotate(n=Count('id'))
            .filter(n__gt=1)
            .count()
        )
        self.stdout.write(f'Duplicate (student, component, attempt) groups: {duplicates}')
        pending_with_marks = StudentComponentResult.all_objects.filter(
            status='PENDING', marks_obtained__isnull=False,
        ).count()
        self.stdout.write(
            f'PENDING rows with marks (never produced by Model.save(); not retake-eligible): {pending_with_marks}'
        )
        if connection.vendor == 'postgresql':
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT 1 FROM pg_constraint WHERE conname = 'unique_attempt_per_student_component'"
                )
                present = cursor.fetchone() is not None
            self.stdout.write(f'unique_attempt_per_student_component constraint present: {present}')
