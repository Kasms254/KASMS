"""
Academic section of course reports: one calculation used by the report detail,
the report list (average sort), class positions, the approval snapshot and the
PDF.

Policy (approved 2026-10-17):
- Each subject is expressed as a percentage. Exam-graded (LEGACY) subjects:
  submitted marks / maximum of the exams sat. POLICY subjects: the weighted
  component percentage from core.services (same retake rule and formula as
  evaluate_subject_pass_fail).
- Every active subject is required. A subject is complete under the existing
  completion rules (get_subject_completion_status_v2): LEGACY once its active
  final exam has a submitted mark; POLICY once every active component has a
  submitted attempt. A subject with no assessment configured is incomplete.
- Incomplete subjects show no score; marks recorded so far on an exam-graded
  subject are returned separately as partial_score / partial_hps.
- The report average is the mean of complete subjects' percentages, every
  subject weighted equally. A report with any incomplete subject is
  provisional: it shows that average but gets no overall grade or position.
- Class positions rank non-provisional students by average using competition
  ranking (1, 1, 3).
- Subject and overall grades use the system grade scale
  (core.services.grade_for_percentage), the same one the exam reports use.
  The overall grade comes from the unrounded mean of unrounded subject
  percentages (decided 2026-10-23); mean_score is rounded to 2 dp for display.
- Once approved, a report's figures come from the snapshot taken at approval.
"""
from collections import defaultdict

from django.db.models import Sum
from django.utils import timezone

from .models import (
    AssessmentComponent, Enrollment, Exam, ExamResult, StudentComponentResult, Subject,
)
from .services import grade_for_percentage, select_effective_attempt, weighted_component_percentage

# Exam results that count towards an exam-graded subject.
ELIGIBLE_RESULT_FILTER = {
    'is_submitted': True,
    'marks_obtained__isnull': False,
    'exam__is_active': True,
    'exam__subject__is_active': True,
}

ROW_COMPLETE = 'complete'
ROW_INCOMPLETE = 'incomplete'
ROW_NOT_GRADED = 'not_graded'
ROW_NOT_CONFIGURED = 'not_configured'


def pdf_grade(score, hps):
    if hps == 0:
        return 'N/A'
    return grade_for_percentage((score / hps) * 100)


def grade_descriptor(grade):
    if grade in ('A', 'A-'):
        return 'Outstanding'
    if grade in ('B+', 'B', 'B-'):
        return 'Above Average'
    if grade in ('C+', 'C', 'C-'):
        return 'Average'
    return 'Fail'


def _display_number(value):
    value = float(value)
    return int(value) if value == int(value) else round(value, 2)


def _load_class_data(class_ids):
    """Everything needed to grade the given classes, in a fixed number of queries."""
    subjects = list(
        Subject.all_objects.filter(class_obj_id__in=class_ids, is_active=True).order_by('name', 'id')
    )
    legacy_ids = [s.id for s in subjects if s.grading_mode != 'POLICY']
    policy_ids = [s.id for s in subjects if s.grading_mode == 'POLICY']

    legacy_with_exams = set()
    final_exam_by_subject = {}
    for exam in Exam.all_objects.filter(subject_id__in=legacy_ids, is_active=True).order_by('created_at', 'id'):
        legacy_with_exams.add(exam.subject_id)
        if exam.exam_type == 'final' and exam.component_id is None:
            final_exam_by_subject.setdefault(exam.subject_id, exam.id)

    exam_totals = {
        (row['student_id'], row['exam__subject_id']): row
        for row in ExamResult.all_objects.filter(
            exam__subject_id__in=legacy_ids, **ELIGIBLE_RESULT_FILTER,
        ).values('student_id', 'exam__subject_id').annotate(
            total_marks=Sum('marks_obtained'),
            total_possible=Sum('exam__total_marks'),
        )
    }
    finals_sat = set(
        ExamResult.all_objects.filter(
            exam_id__in=list(final_exam_by_subject.values()), **ELIGIBLE_RESULT_FILTER,
        ).values_list('student_id', 'exam_id')
    )

    components_by_subject = defaultdict(list)
    for comp in AssessmentComponent.all_objects.filter(
        subject_id__in=policy_ids, is_active=True,
    ).order_by('sort_order', 'name'):
        components_by_subject[comp.subject_id].append(comp)

    attempts = defaultdict(list)
    for attempt in StudentComponentResult.all_objects.filter(
        component__subject_id__in=policy_ids,
        component__is_active=True,
        is_submitted=True,
        marks_obtained__isnull=False,
    ):
        attempts[(attempt.student_id, attempt.component_id)].append(attempt)

    subjects_by_class = defaultdict(list)
    for subject in subjects:
        subjects_by_class[subject.class_obj_id].append(subject)

    return {
        'subjects_by_class': subjects_by_class,
        'legacy_with_exams': legacy_with_exams,
        'final_exam_by_subject': final_exam_by_subject,
        'exam_totals': exam_totals,
        'finals_sat': finals_sat,
        'components_by_subject': components_by_subject,
        'attempts': attempts,
    }


def _pending_row(subject, grading_mode, status, remarks, **extra):
    return {
        'subject_name': subject.name.upper(), 'grading_mode': grading_mode,
        'hps': '—', 'score': '—', 'grade': '—', 'remarks': remarks,
        'status': status, 'percentage': None, **extra,
    }


def _legacy_row(subject, student_id, data):
    if subject.id not in data['legacy_with_exams']:
        return _pending_row(subject, 'LEGACY', ROW_NOT_CONFIGURED, 'No assessment configured'), None

    totals = data['exam_totals'].get((student_id, subject.id))
    final_exam_id = data['final_exam_by_subject'].get(subject.id)
    row = {'subject_name': subject.name.upper(), 'grading_mode': 'LEGACY'}

    if not totals or not totals['total_possible']:
        return _pending_row(subject, 'LEGACY', ROW_NOT_GRADED, 'Not graded'), None

    hps = int(totals['total_possible'])
    score = float(totals['total_marks'] or 0)
    if final_exam_id is None or (student_id, final_exam_id) not in data['finals_sat']:
        return _pending_row(
            subject, 'LEGACY', ROW_INCOMPLETE, 'Incomplete: final exam not graded',
            partial_score=_display_number(score), partial_hps=hps,
        ), None

    pct = score / hps * 100
    grade = pdf_grade(score, hps)
    return {**row, 'hps': hps, 'score': _display_number(score), 'grade': grade,
            'remarks': grade_descriptor(grade), 'status': ROW_COMPLETE,
            'percentage': round(pct, 2)}, pct


def _policy_row(subject, student_id, data):
    components = data['components_by_subject'].get(subject.id)
    if not components:
        return _pending_row(subject, 'POLICY', ROW_NOT_CONFIGURED, 'No assessment configured'), None
    component_scores = []
    for comp in components:
        effective = select_effective_attempt(
            data['attempts'].get((student_id, comp.id), ()), comp.retake_evaluation,
        )
        pct = float(effective.percentage or 0) if effective else None
        component_scores.append((pct, float(comp.weight)))

    graded = sum(1 for pct, _ in component_scores if pct is not None)
    row = {'subject_name': subject.name.upper(), 'grading_mode': 'POLICY', 'hps': 100}

    if graded == 0:
        return _pending_row(subject, 'POLICY', ROW_NOT_GRADED, 'Not graded'), None
    if graded < len(components):
        return _pending_row(
            subject, 'POLICY', ROW_INCOMPLETE, f'Incomplete ({graded} of {len(components)} components)',
        ), None

    pct = weighted_component_percentage(component_scores)
    grade = pdf_grade(pct, 100)
    return {**row, 'score': _display_number(round(pct, 2)), 'grade': grade,
            'remarks': grade_descriptor(grade), 'status': ROW_COMPLETE,
            'percentage': round(pct, 2)}, pct


def _student_summary(subjects, student_id, data, class_size):
    rows, percentages = [], []
    for subject in subjects:
        build = _policy_row if subject.grading_mode == 'POLICY' else _legacy_row
        row, pct = build(subject, student_id, data)
        rows.append(row)
        if pct is not None:
            percentages.append(pct)

    complete_rows = [r for r in rows if r['status'] == ROW_COMPLETE]
    is_provisional = len(complete_rows) < len(rows)
    raw_mean = sum(percentages) / len(percentages) if percentages else None
    mean_score = round(raw_mean, 2) if raw_mean is not None else None

    if raw_mean is not None and not is_provisional:
        overall_grade = grade_for_percentage(raw_mean)
        descriptor = grade_descriptor(overall_grade)
    else:
        overall_grade = '—'
        descriptor = 'Provisional' if is_provisional else '—'

    return {
        'rows': rows,
        'total_hps': sum(r['hps'] for r in complete_rows),
        'total_score': _display_number(sum(float(r['score']) for r in complete_rows)),
        'mean_score': mean_score,
        'overall_grade': overall_grade,
        'grade_descriptor': descriptor,
        'class_position': '—',
        'class_size': class_size,
        'subject_count': len(rows),
        'complete_subject_count': len(complete_rows),
        'is_provisional': is_provisional,
    }


def _assign_positions(summaries):
    """Competition ranking (1, 1, 3) over non-provisional summaries with an average."""
    ranked = sorted(
        (s for s in summaries if s['mean_score'] is not None and not s['is_provisional']),
        key=lambda s: -s['mean_score'],
    )
    previous_score, previous_position = None, 0
    for index, summary in enumerate(ranked, start=1):
        if summary['mean_score'] != previous_score:
            previous_score, previous_position = summary['mean_score'], index
        summary['class_position'] = str(previous_position)


def live_summaries(pairs):
    """
    Live academic summaries for (class_id, student_id) pairs, each ranked
    against the class's actively enrolled students. Query count does not
    depend on the number of classes or students.
    """
    pairs = set(pairs)
    if not pairs:
        return {}
    class_ids = {class_id for class_id, _ in pairs}
    data = _load_class_data(class_ids)

    active = defaultdict(set)
    for class_id, student_id in Enrollment.all_objects.filter(
        class_obj_id__in=class_ids, is_active=True,
    ).values_list('class_obj_id', 'student_id'):
        active[class_id].add(student_id)

    summaries = {}
    for class_id in class_ids:
        peers = active[class_id]
        wanted = peers | {sid for cid, sid in pairs if cid == class_id}
        class_summaries = {
            student_id: _student_summary(
                data['subjects_by_class'][class_id], student_id, data, len(peers),
            )
            for student_id in wanted
        }
        _assign_positions([class_summaries[sid] for sid in peers])
        for student_id, summary in class_summaries.items():
            summaries[(class_id, student_id)] = summary
    return {pair: summaries[pair] for pair in pairs}


def report_summaries(reports):
    """
    Academic summary per report id: the approval snapshot for approved reports
    that have one, otherwise computed live. Adds 'source' and 'captured_at'.
    """
    result, needs_live = {}, []
    for report in reports:
        if report.status == 'approved' and report.academic_snapshot:
            result[report.id] = {**report.academic_snapshot, 'source': 'snapshot'}
        else:
            needs_live.append(report)

    live = live_summaries({(r.class_obj_id, r.enrollment.student_id) for r in needs_live})
    for report in needs_live:
        summary = live[(report.class_obj_id, report.enrollment.student_id)]
        result[report.id] = {**summary, 'source': 'live', 'captured_at': None}
    return result


def report_summary(report):
    return report_summaries([report])[report.id]


def final_result(class_obj, student):
    """
    The student's final academic result for the class, as a completion
    certificate records it: the approved course report's snapshot if there is
    one, otherwise the live calculation. Grade and percentage are only given
    when every subject is complete.
    """
    from .models import CourseReport

    report = CourseReport.all_objects.filter(
        class_obj=class_obj, enrollment__student=student, is_active=True, status='approved',
    ).exclude(academic_snapshot__isnull=True).first()
    if report is not None:
        summary = report.academic_snapshot
    else:
        summary = live_summaries({(class_obj.id, student.id)})[(class_obj.id, student.id)]

    if summary['is_provisional'] or summary['mean_score'] is None:
        return {'grade': '', 'percentage': None}
    return {'grade': summary['overall_grade'], 'percentage': summary['mean_score']}


def build_snapshot(summary):
    """The figures frozen onto a report at approval."""
    snapshot = {k: v for k, v in summary.items() if k not in ('source', 'captured_at')}
    snapshot['captured_at'] = timezone.now().isoformat()
    return snapshot


def ranking_key(summary, descending):
    """Complete reports first, then provisional, then those with no average."""
    mean = summary['mean_score']
    if mean is None:
        return (2, 0)
    bucket = 1 if summary['is_provisional'] else 0
    return (bucket, -mean if descending else mean)
