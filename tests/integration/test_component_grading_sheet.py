"""
Regression tests for the instructor POLICY (component-based) grading workflow.

Bug: the instructor "Grade Results" page built its grading sheet from the
generic, globally paginated /api/component-results/ list (PAGE_SIZE=10) and
only read page 1. With 21 students, 11 graded students appeared ungraded, and
re-entering their marks created phantom retake attempts.

Fix: GET /api/component-results/grading_sheet/?component=<id> returns one row
per eligible student (roster merged with latest attempt), and bulk_grade now
validates enrolment, mark values, duplicates and stale client state.
"""
import pytest
from datetime import date, timedelta
from rest_framework import status
from rest_framework.test import APIClient

from core.models import (
    AssessmentComponent, Class, Course, Enrollment, Subject, StudentComponentResult,
)
from tests.factories.users import UserFactory, StudentFactory
from tests.factories.schools import SchoolFactory, SchoolMembershipFactory

LIST_URL = '/api/component-results/'
SHEET_URL = '/api/component-results/grading_sheet/'
BULK_URL = '/api/component-results/bulk_grade/'


def _make_user(role, school):
    user = StudentFactory() if role == 'student' else UserFactory(role=role)
    SchoolMembershipFactory(user=user, school=school, role=role)
    user.clear_membership_cache()
    return user


def _client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _make_policy_component(school, instructor, *, name, student_count, total_marks=30, retake_allowed=False):
    course = Course.objects.create(school=school, name=f'{name} Course', code=f'C{name[:6]}', description='d')
    cls = Class.objects.create(
        school=school, course=course, name=f'{name} Class', instructor=instructor,
        start_date=date.today(), end_date=date.today() + timedelta(days=180),
    )
    subject = Subject.objects.create(school=school, class_obj=cls, name=f'{name} Subject', instructor=instructor)
    subject.grading_mode = 'POLICY'
    subject.save(update_fields=['grading_mode'])
    component = AssessmentComponent.objects.create(
        school=school, subject=subject, name='CAT 1', total_marks=total_marks,
        pass_mark=50, retake_allowed=retake_allowed,
    )
    students = []
    for _ in range(student_count):
        student = _make_user('student', school)
        Enrollment.all_objects.create(school=school, student=student, class_obj=cls, is_active=True)
        students.append(student)
    return component, students


def _grade(client, component, students, marks=20, **extra):
    payload = {
        'component_id': str(component.id),
        'results': [{'student_id': s.id, 'marks_obtained': marks, 'remarks': '', **extra} for s in students],
    }
    return client.post(BULK_URL, payload, format='json')


def _sheet(client, component):
    return client.get(SHEET_URL, {'component': str(component.id)})


@pytest.fixture
def school(db):
    return SchoolFactory(code='GSA', name='Grading School A')


@pytest.fixture
def other_school(db):
    return SchoolFactory(code='GSB', name='Grading School B')


@pytest.fixture
def instructor(school):
    return _make_user('instructor', school)


@pytest.fixture
def python_cat(school, instructor):
    """The reported scenario: CAT 1 — Introduction to Python, 30 marks, 21 students."""
    return _make_policy_component(school, instructor, name='Python', student_count=21)


# ---------------------------------------------------------------------------
# Root cause
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestRootCause:

    def test_generic_list_endpoint_only_returns_first_page(self, instructor, python_cat):
        """The endpoint the old UI used is paginated: count=21 but only 10 rows on page 1."""
        component, students = python_cat
        assert _grade(_client(instructor), component, students).status_code == 200

        response = _client(instructor).get(LIST_URL, {'component': str(component.id)})

        assert response.status_code == 200
        assert response.data['count'] == 21
        assert len(response.data['results']) == 10


# ---------------------------------------------------------------------------
# Grading sheet completeness
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestGradingSheet:

    def test_ungraded_exam_lists_every_enrolled_student(self, instructor, python_cat):
        component, students = python_cat
        response = _sheet(_client(instructor), component)

        assert response.status_code == 200, response.data
        assert response.data['count'] == 21
        assert response.data['graded_count'] == 0
        assert response.data['pending_count'] == 21
        assert {row['student_id'] for row in response.data['results']} == {s.id for s in students}
        assert all(row['result'] is None for row in response.data['results'])
        assert response.data['total_marks'] == 30

    def test_fully_graded_exam_shows_all_marks(self, instructor, python_cat):
        component, students = python_cat
        assert _grade(_client(instructor), component, students, marks=25).status_code == 200

        response = _sheet(_client(instructor), component)

        assert response.data['count'] == 21
        assert response.data['graded_count'] == 21
        assert response.data['pending_count'] == 0
        for row in response.data['results']:
            assert row['result'] is not None
            assert float(row['result']['marks_obtained']) == 25.0
            assert row['result']['attempt_number'] == 1

    def test_sheet_returns_latest_attempt_only(self, school, instructor):
        component, students = _make_policy_component(
            school, instructor, name='Retake', student_count=3, retake_allowed=True,
        )
        client = _client(instructor)
        _grade(client, component, students, marks=5)  # all fail (5/30)
        _grade(client, component, students[:1], marks=28, expected_latest_attempt=1)

        rows = {r['student_id']: r for r in _sheet(client, component).data['results']}

        assert len(rows) == 3
        assert rows[students[0].id]['result']['attempt_number'] == 2
        assert float(rows[students[0].id]['result']['marks_obtained']) == 28.0
        assert rows[students[1].id]['result']['attempt_number'] == 1

    def test_inactive_enrolment_is_excluded(self, instructor, python_cat):
        component, students = python_cat
        Enrollment.all_objects.filter(student=students[0]).update(is_active=False)

        response = _sheet(_client(instructor), component)

        assert response.data['count'] == 20
        assert students[0].id not in {r['student_id'] for r in response.data['results']}

    @pytest.mark.slow
    def test_large_class_is_complete_with_bounded_queries(
        self, school, instructor, django_assert_max_num_queries,
    ):
        component, students = _make_policy_component(school, instructor, name='Large', student_count=120)
        _grade(_client(instructor), component, students[:60])
        client = _client(instructor)

        with django_assert_max_num_queries(12):
            response = _sheet(client, component)

        assert response.data['count'] == 120
        assert response.data['graded_count'] == 60
        assert response.data['pending_count'] == 60

    def test_admin_of_same_school_can_view_sheet(self, school, python_cat):
        component, _ = python_cat
        admin = _make_user('admin', school)

        response = _sheet(_client(admin), component)

        assert response.status_code == 200
        assert response.data['count'] == 21

    def test_missing_component_param_is_400(self, instructor):
        assert _client(instructor).get(SHEET_URL).status_code == 400

    def test_malformed_component_id_is_404_not_500(self, instructor):
        assert _client(instructor).get(SHEET_URL, {'component': 'not-a-uuid'}).status_code == 404


# ---------------------------------------------------------------------------
# Saving across UI pages
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestSaveAcrossPages:

    def test_saving_page_by_page_persists_all_21(self, instructor, python_cat):
        """Page 1 (1-10), page 2 (11-20), page 3 (21) saved separately."""
        component, students = python_cat
        client = _client(instructor)

        for page in (students[0:10], students[10:20], students[20:21]):
            response = _grade(client, component, page, expected_latest_attempt=0)
            assert response.status_code == 200
            assert response.data['errors'] == []
            assert response.data['created'] == len(page)

        assert StudentComponentResult.all_objects.filter(component=component).count() == 21
        assert not StudentComponentResult.all_objects.filter(component=component, attempt_number__gt=1).exists()
        assert _sheet(client, component).data['graded_count'] == 21

    def test_single_save_of_all_21_students(self, instructor, python_cat):
        component, students = python_cat
        response = _grade(_client(instructor), component, students, expected_latest_attempt=0)

        assert response.data['created'] == 21
        assert response.data['errors'] == []

    def test_save_with_100_plus_students(self, school, instructor):
        component, students = _make_policy_component(school, instructor, name='Hundred', student_count=105)
        response = _grade(_client(instructor), component, students)

        assert response.data['created'] == 105
        assert StudentComponentResult.all_objects.filter(component=component).count() == 105

    def test_payload_without_expected_attempt_still_works(self, instructor, python_cat):
        """Backward compatibility with clients that do not send expected_latest_attempt."""
        component, students = python_cat
        response = _grade(_client(instructor), component, students[:3])

        assert response.data['created'] == 3


# ---------------------------------------------------------------------------
# Data integrity
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestDataIntegrity:

    def test_repeated_save_does_not_create_duplicates(self, instructor, python_cat):
        component, students = python_cat
        client = _client(instructor)
        _grade(client, component, students)

        response = _grade(client, component, students)

        assert response.status_code == 200
        assert response.data['created'] == 0
        assert len(response.data['errors']) == 21
        assert StudentComponentResult.all_objects.filter(component=component).count() == 21

    def test_stale_client_cannot_create_phantom_retake(self, school, instructor):
        """
        Exactly the old bug path: the UI believed a graded student was ungraded
        (expected_latest_attempt=0) and re-submitted. With retakes enabled this
        used to silently create attempt 2; it must now be reported as a conflict.
        """
        component, students = _make_policy_component(
            school, instructor, name='Stale', student_count=2, retake_allowed=True,
        )
        client = _client(instructor)
        _grade(client, component, students, marks=5)

        response = _grade(client, component, students, marks=20, expected_latest_attempt=0)

        assert response.data['created'] == 0
        assert len(response.data['errors']) == 2
        assert all('reload' in e['error'].lower() for e in response.data['errors'])
        assert not StudentComponentResult.all_objects.filter(component=component, attempt_number=2).exists()

    def test_legitimate_retake_is_still_allowed(self, school, instructor):
        component, students = _make_policy_component(
            school, instructor, name='Legit', student_count=1, retake_allowed=True,
        )
        client = _client(instructor)
        _grade(client, component, students, marks=5)

        response = _grade(client, component, students, marks=20, expected_latest_attempt=1)

        assert response.data['created'] == 1
        retake = StudentComponentResult.all_objects.get(component=component, attempt_number=2)
        assert retake.is_retake is True

    def test_duplicate_student_in_one_payload_is_rejected(self, instructor, python_cat):
        component, students = python_cat
        payload = {
            'component_id': str(component.id),
            'results': [
                {'student_id': students[0].id, 'marks_obtained': 10},
                {'student_id': students[0].id, 'marks_obtained': 20},
            ],
        }
        response = _client(instructor).post(BULK_URL, payload, format='json')

        assert response.data['created'] == 1
        assert len(response.data['errors']) == 1
        assert StudentComponentResult.all_objects.filter(component=component, student=students[0]).count() == 1

    @pytest.mark.parametrize('bad_marks', ['abc', -1, 31, None, 'NaN', 'Infinity', [], {}])
    def test_invalid_marks_are_rejected_without_500(self, instructor, python_cat, bad_marks):
        component, students = python_cat
        payload = {
            'component_id': str(component.id),
            'results': [{'student_id': students[0].id, 'marks_obtained': bad_marks}],
        }
        response = _client(instructor).post(BULK_URL, payload, format='json')

        assert response.status_code == 200
        assert response.data['created'] == 0
        assert len(response.data['errors']) == 1
        assert not StudentComponentResult.all_objects.filter(component=component).exists()

    def test_boundary_marks_are_accepted(self, instructor, python_cat):
        component, students = python_cat
        client = _client(instructor)

        assert _grade(client, component, students[:1], marks=0).data['created'] == 1
        assert _grade(client, component, students[1:2], marks=30).data['created'] == 1

    def test_results_must_be_a_list(self, instructor, python_cat):
        component, _ = python_cat
        response = _client(instructor).post(
            BULK_URL, {'component_id': str(component.id), 'results': {'student_id': 1}}, format='json',
        )
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# Authorization / tenant isolation
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.security
class TestAuthorization:

    def test_unrelated_instructor_same_school_is_forbidden(self, school, python_cat):
        component, students = python_cat
        other = _make_user('instructor', school)

        assert _sheet(_client(other), component).status_code == 403
        assert _grade(_client(other), component, students).status_code == 403
        assert not StudentComponentResult.all_objects.filter(component=component).exists()

    @pytest.mark.tenant
    def test_cross_school_instructor_cannot_see_or_grade(self, other_school, python_cat):
        component, students = python_cat
        foreign = _make_user('instructor', other_school)

        assert _sheet(_client(foreign), component).status_code == 404
        assert _grade(_client(foreign), component, students).status_code == 404

    @pytest.mark.tenant
    def test_cross_school_admin_cannot_see_sheet(self, other_school, python_cat):
        component, _ = python_cat
        foreign_admin = _make_user('admin', other_school)

        assert _sheet(_client(foreign_admin), component).status_code == 404

    def test_student_cannot_view_sheet(self, python_cat):
        component, students = python_cat
        assert _sheet(_client(students[0]), component).status_code == 403

    def test_student_from_unrelated_class_cannot_be_graded(self, school, instructor, python_cat):
        """Same school, same instructor, but the student is not enrolled in this component's class."""
        component, _ = python_cat
        _, outsiders = _make_policy_component(school, instructor, name='Other', student_count=1)

        response = _grade(_client(instructor), component, outsiders)

        assert response.data['created'] == 0
        assert len(response.data['errors']) == 1
        assert not StudentComponentResult.all_objects.filter(component=component, student=outsiders[0]).exists()

    @pytest.mark.tenant
    def test_student_from_other_school_cannot_be_graded(self, other_school, instructor, python_cat):
        component, _ = python_cat
        foreign_instructor = _make_user('instructor', other_school)
        _, foreign_students = _make_policy_component(other_school, foreign_instructor, name='Foreign', student_count=1)

        response = _grade(_client(instructor), component, foreign_students)

        assert response.data['created'] == 0
        assert len(response.data['errors']) == 1

    def test_manipulated_component_id_from_unrelated_subject(self, school, instructor, python_cat):
        """Instructor cannot grade a component of a subject taught by someone else."""
        other_instructor = _make_user('instructor', school)
        foreign_component, foreign_students = _make_policy_component(
            school, other_instructor, name='Unrelated', student_count=2,
        )

        assert _grade(_client(instructor), foreign_component, foreign_students).status_code == 403
        assert _sheet(_client(instructor), foreign_component).status_code == 403

    def test_unauthenticated_requests_are_rejected(self, python_cat):
        component, students = python_cat
        anon = APIClient()

        assert _sheet(anon, component).status_code in (401, 403)
        assert _grade(anon, component, students).status_code in (401, 403)

    def test_second_subject_and_class_work_independently(self, school, instructor, python_cat):
        """The fix is systemic, not tied to one exam."""
        component_a, students_a = python_cat
        component_b, students_b = _make_policy_component(school, instructor, name='Networks', student_count=13)
        client = _client(instructor)
        _grade(client, component_a, students_a)
        _grade(client, component_b, students_b)

        sheet_b = _sheet(client, component_b).data

        assert sheet_b['count'] == 13
        assert sheet_b['graded_count'] == 13
        assert {r['student_id'] for r in sheet_b['results']} == {s.id for s in students_b}


# ---------------------------------------------------------------------------
# Pre-deployment audit additions
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestAuditRegressions:

    @pytest.mark.parametrize('student_count', [11, 21, 37])
    def test_grading_sheet_covers_every_row_the_paginated_list_splits(self, school, instructor, student_count):
        """
        Pins the original bug: the generic list caps a page at 10, the grading
        sheet must return every graded student; page-sized saves create no attempt 2.
        """
        component, students = _make_policy_component(
            school, instructor, name=f'Pin{student_count}', student_count=student_count,
        )
        client = _client(instructor)
        for start in range(0, student_count, 10):
            response = _grade(client, component, students[start:start + 10], expected_latest_attempt=0)
            assert response.data['errors'] == []

        listed = client.get(LIST_URL, {'component': str(component.id)}).data
        sheet = _sheet(client, component).data

        assert listed['count'] == student_count
        assert len(listed['results']) == 10
        assert sheet['count'] == student_count
        assert sheet['graded_count'] == student_count
        assert all(row['result'] is not None for row in sheet['results'])
        assert not StudentComponentResult.all_objects.filter(component=component, attempt_number__gt=1).exists()

    @pytest.mark.parametrize('confused_id', ['float', 'bool'])
    def test_non_integer_student_id_does_not_grade_another_student(self, instructor, python_cat, confused_id):
        component, students = python_cat
        target = students[0]
        student_id = target.id + 0.9 if confused_id == 'float' else True
        payload = {'component_id': str(component.id), 'results': [{'student_id': student_id, 'marks_obtained': 10}]}

        response = _client(instructor).post(BULK_URL, payload, format='json')

        assert response.status_code == 200
        assert response.data['created'] == 0
        assert not StudentComponentResult.all_objects.filter(component=component).exists()

    def test_non_object_body_is_400_not_500(self, instructor):
        response = _client(instructor).post(BULK_URL, [{'component_id': 'x'}], format='json')
        assert response.status_code == 400

    def test_malformed_json_is_400(self, instructor):
        response = _client(instructor).post(BULK_URL, '{"component_id": ', content_type='application/json')
        assert response.status_code == 400

    def test_sheet_rows_are_unique_and_ordered_deterministically(self, instructor, python_cat):
        component, _ = python_cat
        first = _sheet(_client(instructor), component).data['results']
        second = _sheet(_client(instructor), component).data['results']

        ids = [row['student_id'] for row in first]
        assert len(ids) == len(set(ids))
        assert ids == [row['student_id'] for row in second]

    def test_concurrent_submit_of_same_pending_attempt_is_conflict_not_retake(self, school, instructor):
        """
        A and B both load a student whose attempt 1 exists but has no marks.
        B grades it. A's stale submit must be rejected, not turned into attempt 2.
        """
        component, students = _make_policy_component(
            school, instructor, name='SameAttempt', student_count=1, retake_allowed=True,
        )
        StudentComponentResult.all_objects.create(
            school=school, component=component, student=students[0], attempt_number=1,
        )
        client = _client(instructor)
        stale_row = _sheet(client, component).data['results'][0]
        assert stale_row['result']['marks_obtained'] is None

        _grade(client, component, students, marks=5, expected_version=stale_row['result']['version'])
        response = _grade(
            client, component, students, marks=20,
            expected_latest_attempt=1, expected_version=stale_row['result']['version'],
        )

        assert response.data['created'] == 0
        assert 'reload' in response.data['errors'][0]['error'].lower()
        assert not StudentComponentResult.all_objects.filter(component=component, attempt_number=2).exists()

    def test_retake_against_a_regraded_attempt_is_conflict(self, school, instructor):
        """A loads a failed attempt 1; an admin corrects it to a pass; A's retake must be rejected."""
        component, students = _make_policy_component(
            school, instructor, name='Regraded', student_count=1, retake_allowed=True,
        )
        client = _client(instructor)
        _grade(client, component, students, marks=5)
        stale_row = _sheet(client, component).data['results'][0]

        attempt = StudentComponentResult.all_objects.get(component=component, student=students[0])
        admin = _client(_make_user('admin', school))  # graded results are corrected by admin/HOD, not the instructor
        assert admin.patch(f'{LIST_URL}{attempt.id}/', {'marks_obtained': 25}, format='json').status_code == 200

        response = _grade(
            client, component, students, marks=20,
            expected_latest_attempt=1, expected_version=stale_row['result']['version'],
        )

        assert response.data['created'] == 0
        assert not StudentComponentResult.all_objects.filter(component=component, attempt_number=2).exists()

    def test_retake_with_current_version_is_allowed(self, school, instructor):
        component, students = _make_policy_component(
            school, instructor, name='FreshRetake', student_count=1, retake_allowed=True,
        )
        client = _client(instructor)
        _grade(client, component, students, marks=5)
        row = _sheet(client, component).data['results'][0]

        response = _grade(
            client, component, students, marks=20,
            expected_latest_attempt=row['result']['attempt_number'], expected_version=row['result']['version'],
        )

        assert response.data['created'] == 1

    def test_ungraded_student_uses_empty_version(self, instructor, python_cat):
        component, students = python_cat
        response = _grade(_client(instructor), component, students[:1], expected_version='')
        assert response.data['created'] == 1


@pytest.mark.django_db
class TestSuspiciousRetakeReport:

    def test_report_flags_phantom_retake_and_modifies_nothing(self, school, instructor):
        from io import StringIO
        from django.core.management import call_command

        component, students = _make_policy_component(
            school, instructor, name='Report', student_count=2, retake_allowed=True,
        )
        passed, failed = students
        StudentComponentResult.all_objects.create(
            school=school, component=component, student=passed, attempt_number=1,
            marks_obtained=20, status='PASS', is_submitted=True, graded_by=instructor,
        )
        StudentComponentResult.all_objects.create(  # the bug's fingerprint: same marks, previous passed
            school=school, component=component, student=passed, attempt_number=2, is_retake=True,
            marks_obtained=20, status='PASS', is_submitted=True, graded_by=instructor,
        )
        StudentComponentResult.all_objects.create(
            school=school, component=component, student=failed, attempt_number=1,
            marks_obtained=5, status='FAIL', is_submitted=True, graded_by=instructor,
        )
        before = list(StudentComponentResult.all_objects.order_by('pk').values())

        out = StringIO()
        call_command('report_suspicious_retakes', '--since', '2000-01-01', stdout=out)

        assert 'Retake rows (attempt_number > 1, is_retake=True): 1' in out.getvalue()
        assert 'HIGH=1' in out.getvalue()
        assert list(StudentComponentResult.all_objects.order_by('pk').values()) == before


# ---------------------------------------------------------------------------
# Generic PATCH /api/component-results/{id}/ hardening
# ---------------------------------------------------------------------------

def _detail_url(result):
    return f'{LIST_URL}{result.pk}/'


def _make_result(component, student, *, marks=None, attempt=1, graded_by=None):
    return StudentComponentResult.all_objects.create(
        school=component.school, component=component, student=student, attempt_number=attempt,
        is_retake=attempt > 1, marks_obtained=marks, is_submitted=marks is not None, graded_by=graded_by,
    )


@pytest.mark.django_db
@pytest.mark.security
class TestGenericPatchSecurity:

    # -- A: student outside the class ------------------------------------------------
    def test_a_instructor_cannot_edit_result_of_student_no_longer_enrolled(self, instructor, python_cat):
        component, students = python_cat
        result = _make_result(component, students[0])
        Enrollment.all_objects.filter(student=students[0]).update(is_active=False)

        response = _client(instructor).patch(_detail_url(result), {'marks_obtained': 10}, format='json')

        assert response.status_code == 403
        result.refresh_from_db()
        assert result.marks_obtained is None

    def test_a_instructor_cannot_reassign_result_to_student_of_another_class(self, school, instructor, python_cat):
        component, students = python_cat
        _, outsiders = _make_policy_component(school, instructor, name='OtherCls', student_count=1)
        result = _make_result(component, students[0])

        response = _client(instructor).patch(_detail_url(result), {'student': outsiders[0].id}, format='json')

        assert response.status_code == 400
        result.refresh_from_db()
        assert result.student_id == students[0].id

    # -- B: different component -------------------------------------------------------
    def test_b_instructor_cannot_move_result_to_another_component(self, school, instructor, python_cat):
        component, students = python_cat
        other_component, _ = _make_policy_component(
            school, _make_user('instructor', school), name='Foreign', student_count=1,
        )
        result = _make_result(component, students[0])

        response = _client(instructor).patch(
            _detail_url(result), {'component': str(other_component.id)}, format='json',
        )

        assert response.status_code == 400
        result.refresh_from_db()
        assert result.component_id == component.id

    # -- C / D / E: scoping -----------------------------------------------------------
    def test_c_instructor_cannot_edit_result_of_subject_they_do_not_teach(self, school, instructor):
        other = _make_user('instructor', school)
        component, students = _make_policy_component(school, other, name='NotMine', student_count=1)
        result = _make_result(component, students[0])

        response = _client(instructor).patch(_detail_url(result), {'marks_obtained': 10}, format='json')

        assert response.status_code == 404

    @pytest.mark.tenant
    def test_d_instructor_cannot_edit_result_from_another_school(self, other_school, instructor):
        foreign_instructor = _make_user('instructor', other_school)
        component, students = _make_policy_component(other_school, foreign_instructor, name='Abroad', student_count=1)
        result = _make_result(component, students[0])

        response = _client(instructor).patch(_detail_url(result), {'marks_obtained': 10}, format='json')

        assert response.status_code == 404

    @pytest.mark.parametrize('bad_id', ['00000000-0000-0000-0000-000000000000', 'not-a-uuid', '1'])
    def test_e_manipulated_result_id_is_404(self, instructor, bad_id):
        response = _client(instructor).patch(f'{LIST_URL}{bad_id}/', {'marks_obtained': 10}, format='json')
        assert response.status_code == 404

    # -- F: stale ---------------------------------------------------------------------
    def test_f_stale_version_is_rejected_with_409(self, school, python_cat):
        component, students = python_cat
        result = _make_result(component, students[0], marks=10)
        admin = _make_user('admin', school)
        stale_version = _sheet(_client(admin), component).data['results'][0]['result']['version']
        assert _client(admin).patch(_detail_url(result), {'marks_obtained': 12}, format='json').status_code == 200

        response = _client(admin).patch(
            _detail_url(result), {'marks_obtained': 25, 'expected_version': stale_version}, format='json',
        )

        assert response.status_code == 409
        result.refresh_from_db()
        assert float(result.marks_obtained) == 12.0

    # -- G / H: roles -----------------------------------------------------------------
    def test_g_student_cannot_patch(self, python_cat):
        component, students = python_cat
        result = _make_result(component, students[0], marks=10)

        response = _client(students[0]).patch(_detail_url(result), {'marks_obtained': 30}, format='json')

        assert response.status_code == 403

    def test_h_anonymous_cannot_patch(self, python_cat):
        component, students = python_cat
        result = _make_result(component, students[0], marks=10)

        response = APIClient().patch(_detail_url(result), {'marks_obtained': 30}, format='json')

        assert response.status_code in (401, 403)

    # -- Edit-request workflow, mass assignment, retakes ------------------------------
    def test_instructor_cannot_directly_edit_submitted_marks(self, instructor, python_cat):
        """Graded component results are changed through a ResultEditRequest approved by an HOD/admin."""
        component, students = python_cat
        result = _make_result(component, students[0], marks=10, graded_by=instructor)

        response = _client(instructor).patch(_detail_url(result), {'marks_obtained': 30}, format='json')

        assert response.status_code == 403
        result.refresh_from_db()
        assert float(result.marks_obtained) == 10.0

    def test_instructor_can_enter_marks_on_ungraded_attempt(self, instructor, python_cat):
        component, students = python_cat
        result = _make_result(component, students[0])

        response = _client(instructor).patch(
            _detail_url(result), {'marks_obtained': 18, 'remarks': 'ok'}, format='json',
        )

        assert response.status_code == 200, response.data
        result.refresh_from_db()
        assert float(result.marks_obtained) == 18.0
        assert result.is_submitted is True
        assert result.graded_by_id == instructor.id
        assert result.status == 'PASS'

    @pytest.mark.parametrize('field,value', [
        ('attempt_number', 2), ('is_retake', True), ('is_submitted', False),
        ('submitted_at', '2020-01-01T00:00:00Z'), ('graded_at', '2020-01-01T00:00:00Z'),
    ])
    def test_immutable_fields_cannot_be_changed(self, school, python_cat, field, value):
        component, students = python_cat
        result = _make_result(component, students[0], marks=10)
        admin = _make_user('admin', school)

        response = _client(admin).patch(_detail_url(result), {field: value}, format='json')

        assert response.status_code == 400
        assert field in response.data
        assert not StudentComponentResult.all_objects.filter(component=component, attempt_number=2).exists()

    def test_graded_by_cannot_be_forged(self, school, instructor, python_cat):
        component, students = python_cat
        result = _make_result(component, students[0])
        someone_else = _make_user('admin', school)

        response = _client(instructor).patch(
            _detail_url(result), {'marks_obtained': 15, 'graded_by': someone_else.id}, format='json',
        )

        assert response.status_code == 400
        result.refresh_from_db()
        assert result.graded_by_id is None

    @pytest.mark.parametrize('bad_marks', [31, -1, 'abc', 'NaN', 12.345])
    def test_invalid_marks_rejected(self, school, python_cat, bad_marks):
        component, students = python_cat
        result = _make_result(component, students[0], marks=10)
        admin = _make_user('admin', school)

        response = _client(admin).patch(_detail_url(result), {'marks_obtained': bad_marks}, format='json')

        assert response.status_code == 400
        result.refresh_from_db()
        assert float(result.marks_obtained) == 10.0

    def test_admin_can_edit_existing_result_and_status_is_recomputed(self, school, python_cat):
        component, students = python_cat
        result = _make_result(component, students[0], marks=5)
        admin = _make_user('admin', school)
        version = _sheet(_client(admin), component).data['results'][0]['result']['version']

        response = _client(admin).patch(
            _detail_url(result), {'marks_obtained': 24, 'expected_version': version}, format='json',
        )

        assert response.status_code == 200, response.data
        result.refresh_from_db()
        assert float(result.marks_obtained) == 24.0
        assert result.status == 'PASS'
        assert result.attempt_number == 1
        assert StudentComponentResult.all_objects.filter(component=component, student=students[0]).count() == 1

    def test_put_is_guarded_the_same_way(self, instructor, python_cat):
        component, students = python_cat
        result = _make_result(component, students[0], marks=10, graded_by=instructor)
        payload = {
            'component': str(component.id), 'student': students[0].id, 'attempt_number': 1, 'marks_obtained': 30,
        }

        response = _client(instructor).put(_detail_url(result), payload, format='json')

        assert response.status_code == 403
        result.refresh_from_db()
        assert float(result.marks_obtained) == 10.0

    def test_marks_change_is_audited(self, school, python_cat, django_capture_on_commit_callbacks):
        from audit.models import AuditLog
        from audit.constants import AuditAction

        component, students = python_cat
        result = _make_result(component, students[0], marks=5)
        admin = _make_user('admin', school)

        with django_capture_on_commit_callbacks(execute=True):
            _client(admin).patch(_detail_url(result), {'marks_obtained': 20}, format='json')

        assert AuditLog.objects.filter(
            action=AuditAction.MARKS_CHANGED, target_object_id=str(result.pk),
        ).exists()

    def test_legitimate_retake_flow_still_works(self, school, instructor):
        component, students = _make_policy_component(
            school, instructor, name='RetakeOK', student_count=1, retake_allowed=True,
        )
        client = _client(instructor)
        _grade(client, component, students, marks=5)
        row = _sheet(client, component).data['results'][0]

        response = _grade(client, component, students, marks=22, expected_version=row['result']['version'])

        assert response.data['created'] == 1
        assert StudentComponentResult.all_objects.get(component=component, attempt_number=2).is_retake


@pytest.mark.django_db
class TestGenericPatchRetakeSafety:

    def test_marks_cannot_be_cleared_on_graded_result(self, school, python_cat):
        """A submitted attempt without marks would make bulk_grade treat the next entry as a retake."""
        component, students = python_cat
        result = _make_result(component, students[0], marks=10)
        admin = _make_user('admin', school)

        response = _client(admin).patch(_detail_url(result), {'marks_obtained': None}, format='json')

        assert response.status_code == 400
        result.refresh_from_db()
        assert float(result.marks_obtained) == 10.0

    def test_non_object_body_is_400(self, school, python_cat):
        component, students = python_cat
        result = _make_result(component, students[0], marks=10)
        admin = _make_user('admin', school)

        response = _client(admin).patch(_detail_url(result), [1, 2], format='json')

        assert response.status_code == 400


@pytest.mark.django_db
def test_suspicious_retake_csv_neutralises_formulas(school, instructor, tmp_path):
    import csv as csv_module
    from io import StringIO
    from django.core.management import call_command

    component, students = _make_policy_component(
        school, instructor, name='Csv', student_count=1, retake_allowed=True,
    )
    component.name = '=HYPERLINK("http://evil")'
    component.save(update_fields=['name'])
    _make_result(component, students[0], marks=20, graded_by=instructor)
    _make_result(component, students[0], marks=20, attempt=2, graded_by=instructor)
    out_file = tmp_path / 'report.csv'

    call_command('report_suspicious_retakes', '--since', '2000-01-01', '--csv', str(out_file), stdout=StringIO())

    row = next(csv_module.DictReader(out_file.open()))
    assert row['component'].startswith("'=")
    assert row['risk'] == 'HIGH'


# ---------------------------------------------------------------------------
# DELETE / POST / retake / oversight-role hardening
# ---------------------------------------------------------------------------

def _post(client, component, student, **extra):
    return client.post(LIST_URL, {'component': str(component.id), 'student': student.id, **extra}, format='json')


def _version(client, component, student):
    rows = _sheet(client, component).data['results']
    return next(r for r in rows if r['student_id'] == student.id)['result']['version']


@pytest.mark.django_db
@pytest.mark.security
class TestDeleteHardening:

    def test_instructor_cannot_delete_graded_result(self, instructor, python_cat):
        component, students = python_cat
        result = _make_result(component, students[0], marks=10, graded_by=instructor)

        assert _client(instructor).delete(_detail_url(result)).status_code == 403
        assert StudentComponentResult.all_objects.filter(pk=result.pk).exists()

    def test_instructor_cannot_delete_ungraded_result(self, instructor, python_cat):
        """No UI or workflow deletes results; instructors are denied outright."""
        component, students = python_cat
        result = _make_result(component, students[0])

        assert _client(instructor).delete(_detail_url(result)).status_code == 403
        assert StudentComponentResult.all_objects.filter(pk=result.pk).exists()

    def test_instructor_cannot_delete_result_in_another_class(self, school, instructor):
        other = _make_user('instructor', school)
        component, students = _make_policy_component(school, other, name='DelOther', student_count=1)
        result = _make_result(component, students[0], marks=10)

        assert _client(instructor).delete(_detail_url(result)).status_code in (403, 404)
        assert StudentComponentResult.all_objects.filter(pk=result.pk).exists()

    def test_admin_can_delete_and_it_is_audited(self, school, python_cat, django_capture_on_commit_callbacks):
        from audit.models import AuditLog
        from audit.constants import AuditAction

        component, students = python_cat
        result = _make_result(component, students[0], marks=10)
        admin = _make_user('admin', school)

        with django_capture_on_commit_callbacks(execute=True):
            response = _client(admin).delete(_detail_url(result))

        assert response.status_code == 204
        assert not StudentComponentResult.all_objects.filter(pk=result.pk).exists()
        assert AuditLog.objects.filter(action=AuditAction.DELETE, target_object_id=str(result.pk)).exists()

    def test_admin_stale_delete_is_409(self, school, python_cat):
        component, students = python_cat
        result = _make_result(component, students[0], marks=10)
        admin = _make_user('admin', school)
        stale = _version(_client(admin), component, students[0])
        assert _client(admin).patch(_detail_url(result), {'marks_obtained': 12}, format='json').status_code == 200

        response = _client(admin).delete(f'{_detail_url(result)}?expected_version={stale}')

        assert response.status_code == 409
        assert StudentComponentResult.all_objects.filter(pk=result.pk).exists()

    @pytest.mark.tenant
    def test_cross_school_admin_cannot_delete(self, other_school, python_cat):
        component, students = python_cat
        result = _make_result(component, students[0], marks=10)

        assert _client(_make_user('admin', other_school)).delete(_detail_url(result)).status_code == 404
        assert StudentComponentResult.all_objects.filter(pk=result.pk).exists()

    def test_student_and_anonymous_cannot_delete(self, python_cat):
        component, students = python_cat
        result = _make_result(component, students[0], marks=10)

        assert _client(students[0]).delete(_detail_url(result)).status_code == 403
        assert APIClient().delete(_detail_url(result)).status_code in (401, 403)
        assert StudentComponentResult.all_objects.filter(pk=result.pk).exists()


@pytest.mark.django_db
@pytest.mark.security
class TestCreateHardening:

    def test_instructor_cannot_create_for_student_of_another_class(self, school, instructor, python_cat):
        component, _ = python_cat
        _, outsiders = _make_policy_component(school, instructor, name='PostOther', student_count=1)

        response = _post(_client(instructor), component, outsiders[0], marks_obtained=10)

        assert response.status_code == 400
        assert not StudentComponentResult.all_objects.filter(component=component).exists()

    def test_instructor_cannot_create_for_inactive_enrolment(self, instructor, python_cat):
        component, students = python_cat
        Enrollment.all_objects.filter(student=students[0]).update(is_active=False)

        assert _post(_client(instructor), component, students[0], marks_obtained=10).status_code == 400
        assert not StudentComponentResult.all_objects.filter(component=component).exists()

    @pytest.mark.tenant
    def test_instructor_cannot_create_for_student_of_another_school(self, other_school, instructor, python_cat):
        component, _ = python_cat
        _, foreign = _make_policy_component(other_school, _make_user('instructor', other_school), name='PostAbroad', student_count=1)

        assert _post(_client(instructor), component, foreign[0], marks_obtained=10).status_code == 400
        assert not StudentComponentResult.all_objects.filter(component=component).exists()

    @pytest.mark.tenant
    def test_instructor_cannot_create_on_component_of_another_school(self, other_school, instructor, python_cat):
        _, students = python_cat
        foreign_component, _ = _make_policy_component(other_school, _make_user('instructor', other_school), name='CompAbroad', student_count=1)

        assert _post(_client(instructor), foreign_component, students[0], marks_obtained=10).status_code == 400
        assert not StudentComponentResult.all_objects.filter(component=foreign_component).exists()

    def test_instructor_cannot_create_on_component_they_do_not_teach(self, school, instructor):
        other = _make_user('instructor', school)
        component, students = _make_policy_component(school, other, name='PostNotMine', student_count=1)

        assert _post(_client(instructor), component, students[0], marks_obtained=10).status_code == 400
        assert not StudentComponentResult.all_objects.filter(component=component).exists()

    def test_enrolled_student_create_derives_server_fields(self, school, instructor, python_cat):
        component, students = python_cat
        someone_else = _make_user('admin', school)

        response = _post(
            _client(instructor), component, students[0], marks_obtained=20,
            attempt_number=5, is_retake=True, graded_by=someone_else.id, is_submitted=False,
        )

        assert response.status_code == 201, response.data
        result = StudentComponentResult.all_objects.get(component=component, student=students[0])
        assert result.attempt_number == 1
        assert result.is_retake is False
        assert result.graded_by_id == instructor.id
        assert result.is_submitted is True
        assert result.status == 'PASS'

    def test_create_with_marks_is_audited(self, instructor, python_cat, django_capture_on_commit_callbacks):
        from audit.models import AuditLog
        from audit.constants import AuditAction

        component, students = python_cat
        with django_capture_on_commit_callbacks(execute=True):
            response = _post(_client(instructor), component, students[0], marks_obtained=20)

        assert AuditLog.objects.filter(action=AuditAction.MARKS_CHANGED, target_object_id=str(response.data['id'])).exists()

    def test_create_over_ungraded_placeholder_is_rejected_not_a_retake(self, school, instructor):
        """generate_results creates empty attempt-1 rows; POST must not stack attempt 2 on them."""
        component, students = _make_policy_component(school, instructor, name='Placeholder', student_count=1, retake_allowed=True)
        _make_result(component, students[0])

        assert _post(_client(instructor), component, students[0], marks_obtained=10).status_code == 400
        assert not StudentComponentResult.all_objects.filter(component=component, attempt_number=2).exists()

    @pytest.mark.parametrize('bad_marks', [31, -1, 'abc'])
    def test_invalid_marks_rejected(self, instructor, python_cat, bad_marks):
        component, students = python_cat
        assert _post(_client(instructor), component, students[0], marks_obtained=bad_marks).status_code == 400
        assert not StudentComponentResult.all_objects.filter(component=component).exists()

    def test_database_conflict_is_409_not_500(self, instructor, python_cat):
        from unittest import mock
        from django.db import IntegrityError
        from core.serializers import StudentComponentResultSerializer

        component, students = python_cat
        with mock.patch.object(StudentComponentResultSerializer, 'save', side_effect=IntegrityError('dup')):
            response = _post(_client(instructor), component, students[0], marks_obtained=10)

        assert response.status_code == 409


@pytest.mark.django_db
@pytest.mark.security
class TestRetakePolicy:

    @pytest.fixture
    def retake_component(self, school, instructor):
        return _make_policy_component(school, instructor, name='RetakePol', student_count=2, retake_allowed=True)

    def test_post_retake_after_pass_is_rejected(self, instructor, retake_component):
        component, students = retake_component
        _grade(_client(instructor), component, students[:1], marks=25)

        assert _post(_client(instructor), component, students[0], marks_obtained=10).status_code == 400
        assert not StudentComponentResult.all_objects.filter(component=component, attempt_number=2).exists()

    def test_post_forged_attempt_number_cannot_retake_a_pass(self, instructor, retake_component):
        """Before the fix, sending attempt_number=2 slipped past the serializer and created a retake."""
        component, students = retake_component
        _grade(_client(instructor), component, students[:1], marks=25)

        response = _post(_client(instructor), component, students[0], marks_obtained=10, attempt_number=2, is_retake=True)

        assert response.status_code == 400
        assert not StudentComponentResult.all_objects.filter(component=component, attempt_number=2).exists()

    def test_bulk_retake_after_pass_is_rejected(self, instructor, retake_component):
        component, students = retake_component
        client = _client(instructor)
        _grade(client, component, students[:1], marks=25)

        response = _grade(client, component, students[:1], marks=10, expected_version=_version(client, component, students[0]))

        assert response.data['created'] == 0
        assert 'passed' in response.data['errors'][0]['error'].lower()

    def test_post_retake_after_fail_is_allowed(self, instructor, retake_component):
        component, students = retake_component
        client = _client(instructor)
        _grade(client, component, students[:1], marks=5)

        response = _post(client, component, students[0], marks_obtained=22, expected_version=_version(client, component, students[0]))

        assert response.status_code == 201, response.data
        retake = StudentComponentResult.all_objects.get(component=component, attempt_number=2)
        assert retake.is_retake is True

    def test_post_stale_retake_is_409(self, school, instructor, retake_component):
        component, students = retake_component
        client = _client(instructor)
        _grade(client, component, students[:1], marks=5)
        stale = _version(client, component, students[0])
        attempt = StudentComponentResult.all_objects.get(component=component, student=students[0])
        _client(_make_user('admin', school)).patch(_detail_url(attempt), {'marks_obtained': 6}, format='json')

        response = _post(client, component, students[0], marks_obtained=22, expected_version=stale)

        assert response.status_code == 409
        assert not StudentComponentResult.all_objects.filter(component=component, attempt_number=2).exists()

    def test_retake_blocked_when_best_attempt_passed(self, instructor, retake_component):
        """retake_evaluation='best': an earlier pass is the effective result, so no further retake."""
        component, students = retake_component
        component.retake_evaluation = 'best'
        component.save(update_fields=['retake_evaluation'])
        _make_result(component, students[0], marks=25, attempt=1)
        _make_result(component, students[0], marks=5, attempt=2)
        StudentComponentResult.all_objects.filter(component=component, attempt_number=2).update(status='FAIL')

        assert _post(_client(instructor), component, students[0], marks_obtained=10).status_code == 400

    def test_max_attempts_still_enforced(self, instructor, retake_component):
        component, students = retake_component
        component.max_retake_attempts = 1
        component.save(update_fields=['max_retake_attempts'])
        _grade(_client(instructor), component, students[:1], marks=5)

        assert _post(_client(instructor), component, students[0], marks_obtained=22).status_code == 400

    def test_retake_disallowed_component(self, instructor, python_cat):
        component, students = python_cat
        _grade(_client(instructor), component, students[:1], marks=5)

        assert _post(_client(instructor), component, students[0], marks_obtained=22).status_code == 400


@pytest.mark.django_db(transaction=True)
@pytest.mark.slow
class TestConcurrentRetakes:
    """Real parallel requests; only meaningful on PostgreSQL (SQLite has no row locks)."""

    def _race(self, send):
        import threading
        from django.db import connection, connections

        if connection.vendor != 'postgresql':
            pytest.skip('row-level locking requires PostgreSQL')
        barrier = threading.Barrier(2)
        responses = []

        def worker():
            try:
                barrier.wait()
                responses.append(send())
            finally:
                connections.close_all()

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        return responses

    def test_two_concurrent_bulk_retakes_create_one_attempt(self, school, instructor):
        component, students = _make_policy_component(school, instructor, name='RaceBulk', student_count=1, retake_allowed=True)
        client = _client(instructor)
        _grade(client, component, students, marks=5)
        version = _version(client, component, students[0])

        responses = self._race(lambda: _grade(_client(instructor), component, students, marks=20, expected_version=version))

        assert sorted(r.status_code for r in responses) == [200, 200]
        assert sum(r.data['created'] for r in responses) == 1
        assert StudentComponentResult.all_objects.filter(component=component, attempt_number=2).count() == 1

    def test_two_concurrent_post_retakes_create_one_attempt(self, school, instructor):
        component, students = _make_policy_component(school, instructor, name='RacePost', student_count=1, retake_allowed=True)
        client = _client(instructor)
        _grade(client, component, students, marks=5)
        version = _version(client, component, students[0])

        responses = self._race(lambda: _post(_client(instructor), component, students[0], marks_obtained=20, expected_version=version))

        codes = sorted(r.status_code for r in responses)
        assert codes[0] == 201 and codes[1] in (400, 409), codes
        assert StudentComponentResult.all_objects.filter(component=component, attempt_number=2).count() == 1


@pytest.mark.django_db
@pytest.mark.security
class TestOversightRolesReadOnly:

    @pytest.fixture(params=['commandant', 'chief_instructor'])
    def oversight(self, request, school):
        return _make_user(request.param, school)

    def test_can_read(self, oversight, python_cat):
        component, students = python_cat
        result = _make_result(component, students[0], marks=10)
        client = _client(oversight)

        assert client.get(LIST_URL, {'component': str(component.id)}).status_code == 200
        assert client.get(_detail_url(result)).status_code == 200
        assert _sheet(client, component).status_code == 200

    def test_cannot_mutate(self, oversight, python_cat):
        component, students = python_cat
        result = _make_result(component, students[0], marks=10)
        client = _client(oversight)
        before = list(StudentComponentResult.all_objects.order_by('pk').values())

        assert _post(client, component, students[1], marks_obtained=10).status_code == 403
        assert client.patch(_detail_url(result), {'marks_obtained': 20}, format='json').status_code == 403
        assert client.put(_detail_url(result), {'component': str(component.id), 'student': students[0].id, 'marks_obtained': 20}, format='json').status_code == 403
        assert client.delete(_detail_url(result)).status_code == 403
        assert _grade(client, component, students[1:2]).status_code == 403
        assert list(StudentComponentResult.all_objects.order_by('pk').values()) == before

    def test_admin_mutations_preserved(self, school, python_cat):
        component, students = python_cat
        admin = _client(_make_user('admin', school))

        assert _post(admin, component, students[0], marks_obtained=10).status_code == 201
        assert _grade(admin, component, students[1:2]).data['created'] == 1


# ---------------------------------------------------------------------------
# Final review: oversight write paths, edit approval, HOD matrix, PENDING, parity
# ---------------------------------------------------------------------------

EDIT_REQUESTS_URL = '/api/result-edit-requests/'


def _make_exam(component, title='CAT'):
    from core.models import Exam
    return Exam.objects.create(
        school=component.school, subject=component.subject, component=component,
        title=title, exam_type='cat', total_marks=component.total_marks, exam_date=date.today(),
    )


def _audit_count(action):
    from audit.models import AuditLog
    return AuditLog.objects.filter(action=action).count()


@pytest.mark.django_db
@pytest.mark.security
class TestOversightCannotWriteViaOtherEndpoints:

    @pytest.fixture(params=['commandant', 'chief_instructor'])
    def oversight(self, request, school):
        return _make_user(request.param, school)

    def test_generate_results_cannot_create_component_rows(self, oversight, python_cat):
        component, _ = python_cat
        exam = _make_exam(component)

        response = _client(oversight).post(f'/api/exams/{exam.id}/generate_results/')

        assert response.status_code == 403
        assert not StudentComponentResult.all_objects.filter(component=component).exists()

    def test_cannot_delete_component_and_cascade_results(self, oversight, python_cat):
        component, students = python_cat
        _make_result(component, students[0], marks=10)

        response = _client(oversight).delete(f'/api/assessment-components/{component.id}/')

        assert response.status_code == 403
        assert AssessmentComponent.all_objects.filter(pk=component.pk).exists()
        assert StudentComponentResult.all_objects.filter(component=component).count() == 1

    def test_can_still_read_exams_and_components(self, oversight, python_cat):
        component, _ = python_cat
        exam = _make_exam(component)
        client = _client(oversight)

        assert client.get(f'/api/exams/{exam.id}/').status_code == 200
        assert client.get(f'/api/assessment-components/{component.id}/').status_code == 200

    def test_instructor_generate_results_preserved(self, instructor, python_cat):
        component, _ = python_cat
        exam = _make_exam(component)

        response = _client(instructor).post(f'/api/exams/{exam.id}/generate_results/')

        assert response.status_code == 200
        assert StudentComponentResult.all_objects.filter(component=component, attempt_number=1).count() == 21
        assert not StudentComponentResult.all_objects.filter(component=component, marks_obtained__isnull=False).exists()

    def test_admin_component_delete_preserved(self, school, python_cat):
        component, _ = python_cat
        assert _client(_make_user('admin', school)).delete(f'/api/assessment-components/{component.id}/').status_code == 204


def _department(school, name='Signals'):
    from core.models import Department
    return Department.objects.create(school=school, name=name, code=name[:6].upper())


def _make_hod(school, department):
    from core.models import DepartmentMembership
    hod = _make_user('instructor', school)
    DepartmentMembership.objects.create(
        department=department, user=hod, role=DepartmentMembership.Role.HOD, is_active=True,
    )
    return hod


def _request_edit(instructor, result, proposed=20):
    response = _client(instructor).post(
        EDIT_REQUESTS_URL,
        {'component_result': str(result.pk), 'reason': 'typo', 'proposed_marks': proposed},
        format='json',
    )
    assert response.status_code == 201, response.data
    return response.data['id']


def _review(user, request_id, action='approve'):
    return _client(user).post(f'{EDIT_REQUESTS_URL}{request_id}/review/', {'action': action}, format='json')


@pytest.mark.django_db
@pytest.mark.security
class TestEditApprovalConcurrency:

    @pytest.fixture
    def graded(self, instructor, python_cat):
        component, students = python_cat
        return _make_result(component, students[0], marks=10, graded_by=instructor)

    def test_approval_applies_marks_when_result_unchanged(self, school, instructor, graded):
        request_id = _request_edit(instructor, graded, proposed=20)

        response = _review(_make_user('admin', school), request_id)

        assert response.status_code == 200, response.data
        graded.refresh_from_db()
        assert float(graded.marks_obtained) == 20.0

    def test_stale_approval_cannot_overwrite_newer_result(self, school, instructor, graded):
        from core.models import ResultEditRequest

        request_id = _request_edit(instructor, graded, proposed=20)
        admin = _make_user('admin', school)
        assert _client(admin).patch(_detail_url(graded), {'marks_obtained': 15}, format='json').status_code == 200

        response = _review(admin, request_id)

        assert response.status_code == 409
        graded.refresh_from_db()
        assert float(graded.marks_obtained) == 15.0
        assert ResultEditRequest.all_objects.get(pk=request_id).status == ResultEditRequest.Status.PENDING

    def test_stale_request_can_still_be_rejected(self, school, instructor, graded):
        request_id = _request_edit(instructor, graded)
        admin = _make_user('admin', school)
        _client(admin).patch(_detail_url(graded), {'marks_obtained': 15}, format='json')

        assert _review(admin, request_id, action='reject').status_code == 200

    def test_approval_is_atomic(self, school, instructor, graded):
        from unittest import mock
        from core.models import ResultEditRequest

        request_id = _request_edit(instructor, graded)
        client = _client(_make_user('admin', school))
        client.raise_request_exception = False
        with mock.patch.object(StudentComponentResult, 'save', side_effect=RuntimeError('boom')):
            response = client.post(f'{EDIT_REQUESTS_URL}{request_id}/review/', {'action': 'approve'}, format='json')

        assert response.status_code == 500
        assert ResultEditRequest.all_objects.get(pk=request_id).status == ResultEditRequest.Status.PENDING
        graded.refresh_from_db()
        assert float(graded.marks_obtained) == 10.0

    def test_second_approval_is_rejected(self, school, instructor, graded):
        request_id = _request_edit(instructor, graded)
        admin = _make_user('admin', school)
        assert _review(admin, request_id).status_code == 200
        assert _review(admin, request_id).status_code == 400


@pytest.mark.django_db
@pytest.mark.security
class TestHodApprovalMatrix:

    def _graded_request(self, school, *, class_dept=None, subject_dept=None):
        teacher = _make_user('instructor', school)
        component, students = _make_policy_component(school, teacher, name=f'H{class_dept}{subject_dept}', student_count=1)
        cls = component.subject.class_obj
        cls.department = class_dept
        cls.save(update_fields=['department'])
        component.subject.department = subject_dept
        component.subject.save(update_fields=['department'])
        result = _make_result(component, students[0], marks=10, graded_by=teacher)
        return _request_edit(teacher, result), result

    def test_a_hod_of_class_department_can_approve(self, school):
        dept = _department(school)
        request_id, _ = self._graded_request(school, class_dept=dept)
        assert _review(_make_hod(school, dept), request_id).status_code == 200

    def test_d_hod_of_another_department_cannot_see_request(self, school):
        dept, other = _department(school, 'Signals'), _department(school, 'Armour')
        request_id, result = self._graded_request(school, class_dept=dept)
        assert _review(_make_hod(school, other), request_id).status_code == 404
        result.refresh_from_db()
        assert float(result.marks_obtained) == 10.0

    @pytest.mark.tenant
    def test_e_hod_from_another_school_cannot_see_request(self, school, other_school):
        dept = _department(school)
        request_id, _ = self._graded_request(school, class_dept=dept)
        foreign_hod = _make_hod(other_school, _department(other_school, 'Signals'))
        assert _review(foreign_hod, request_id).status_code == 404

    def test_b_no_department_anywhere_only_admin_can_approve(self, school):
        request_id, _ = self._graded_request(school)
        some_hod = _make_hod(school, _department(school))
        assert _review(some_hod, request_id).status_code == 404
        assert _review(_make_user('admin', school), request_id).status_code == 200

    def test_c_class_without_department_uses_subject_department_hod(self, school):
        """Existing queryset semantics: an HOD of the subject's department sees and may approve."""
        dept = _department(school)
        request_id, _ = self._graded_request(school, subject_dept=dept)
        assert _review(_make_hod(school, dept), request_id).status_code == 200

    def test_class_and_subject_in_different_departments_class_hod_decides(self, school):
        """Documented current behaviour: subject-department HOD can see but not approve."""
        class_dept, subject_dept = _department(school, 'Signals'), _department(school, 'Armour')
        request_id, _ = self._graded_request(school, class_dept=class_dept, subject_dept=subject_dept)
        assert _review(_make_hod(school, subject_dept), request_id).status_code == 403
        assert _review(_make_hod(school, class_dept), request_id).status_code == 200

    def test_f_admin_same_school_approves_and_other_school_cannot(self, school, other_school):
        request_id, _ = self._graded_request(school, class_dept=_department(school))
        assert _review(_make_user('admin', other_school), request_id).status_code == 404
        assert _review(_make_user('admin', school), request_id).status_code == 200

    def test_g_superadmin_approves(self, school):
        from tests.factories.users import SuperAdminFactory
        request_id, _ = self._graded_request(school, class_dept=_department(school))
        assert _review(SuperAdminFactory(), request_id).status_code == 200

    @pytest.mark.parametrize('role', ['instructor', 'commandant', 'chief_instructor', 'student'])
    def test_non_hod_roles_cannot_approve(self, school, role):
        request_id, result = self._graded_request(school, class_dept=_department(school))
        assert _review(_make_user(role, school), request_id).status_code == 403
        result.refresh_from_db()
        assert float(result.marks_obtained) == 10.0


@pytest.mark.django_db
class TestPendingWithMarksFollowsServicesRule:
    """
    Model.save() always sets PASS/FAIL/RETAKE_REQUIRED when marks exist (since d9670e9), so a
    PENDING row with marks only arises from writes that bypass save(). The authoritative server
    rule, core.services.determine_retake_requirements, only offers a retake for FAIL or
    RETAKE_REQUIRED; both creation paths follow it.
    """

    @pytest.fixture
    def pending_failing(self, school, instructor):
        component, students = _make_policy_component(school, instructor, name='Pending', student_count=1, retake_allowed=True)
        result = _make_result(component, students[0], marks=5)
        StudentComponentResult.all_objects.filter(pk=result.pk).update(status='PENDING', percentage=16.67)
        return component, students

    def test_services_rule_does_not_offer_retake(self, pending_failing):
        from core.services import determine_retake_requirements
        component, students = pending_failing
        assert determine_retake_requirements(component.subject, students[0]) == []

    @pytest.mark.parametrize('path', ['post', 'bulk'])
    def test_retake_rejected_on_both_paths(self, instructor, pending_failing, path):
        component, students = pending_failing
        client = _client(instructor)
        if path == 'post':
            assert _post(client, component, students[0], marks_obtained=20).status_code == 400
        else:
            assert _grade(client, component, students, marks=20).data['created'] == 0
        assert not StudentComponentResult.all_objects.filter(component=component, attempt_number=2).exists()


def _try_retake(path, client, component, student, **extra):
    """Returns True when a new attempt was created through the given creation path."""
    marks = extra.pop('marks_obtained', 20)
    if path == 'post':
        return _post(client, component, student, marks_obtained=marks, **extra).status_code == 201
    return _grade(client, component, [student], marks=marks, **extra).data['created'] == 1


@pytest.mark.django_db
@pytest.mark.security
@pytest.mark.parametrize('path', ['post', 'bulk'])
class TestRetakePolicyParity:

    def _setup(self, school, instructor, first_marks, **component_kwargs):
        component, students = _make_policy_component(
            school, instructor, name='Parity', student_count=1, retake_allowed=True,
        )
        for field, value in component_kwargs.items():
            setattr(component, field, value)
        component.save()
        _grade(_client(instructor), component, students, marks=first_marks)
        return component, students[0]

    def test_pass_then_retake_rejected(self, school, instructor, path):
        component, student = self._setup(school, instructor, 25)
        assert not _try_retake(path, _client(instructor), component, student)

    def test_fail_then_retake_allowed(self, school, instructor, path):
        component, student = self._setup(school, instructor, 5)
        assert _try_retake(path, _client(instructor), component, student)
        assert StudentComponentResult.all_objects.get(component=component, attempt_number=2).is_retake

    def test_fail_but_retakes_disabled_rejected(self, school, instructor, path):
        component, student = self._setup(school, instructor, 5, retake_allowed=False)
        assert not _try_retake(path, _client(instructor), component, student)

    def test_attempt_limit_reached_rejected(self, school, instructor, path):
        component, student = self._setup(school, instructor, 5, max_retake_attempts=1)
        assert not _try_retake(path, _client(instructor), component, student)

    @pytest.mark.parametrize('forged', [{'attempt_number': 2}, {'is_retake': True}, {'attempt_number': 1}])
    def test_forged_fields_cannot_bypass_a_pass(self, school, instructor, path, forged):
        component, student = self._setup(school, instructor, 25)
        assert not _try_retake(path, _client(instructor), component, student, **forged)
        assert StudentComponentResult.all_objects.filter(component=component).count() == 1

    def test_placeholder_is_never_stacked(self, school, instructor, path):
        component, students = _make_policy_component(school, instructor, name='Stack', student_count=1, retake_allowed=True)
        _make_result(component, students[0])
        _try_retake(path, _client(instructor), component, students[0])
        assert not StudentComponentResult.all_objects.filter(component=component, attempt_number=2).exists()


@pytest.mark.django_db(transaction=True)
@pytest.mark.slow
def test_concurrent_retakes_for_a_passed_student_all_fail(school, instructor):
    import threading
    from django.db import connection, connections

    if connection.vendor != 'postgresql':
        pytest.skip('row-level locking requires PostgreSQL')
    component, students = _make_policy_component(school, instructor, name='RacePass', student_count=1, retake_allowed=True)
    _grade(_client(instructor), component, students, marks=25)
    barrier = threading.Barrier(4)

    def worker(path):
        try:
            barrier.wait()
            _try_retake(path, _client(instructor), component, students[0])
        finally:
            connections.close_all()

    threads = [threading.Thread(target=worker, args=(p,)) for p in ('post', 'bulk', 'post', 'bulk')]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert StudentComponentResult.all_objects.filter(component=component).count() == 1


@pytest.mark.django_db
@pytest.mark.security
class TestAdminDeleteBoundaryAndAudit:

    def test_admin_can_delete_ungraded_result(self, school, python_cat):
        component, students = python_cat
        result = _make_result(component, students[0])
        assert _client(_make_user('admin', school)).delete(_detail_url(result)).status_code == 204

    def test_superadmin_can_delete(self, python_cat):
        from tests.factories.users import SuperAdminFactory
        component, students = python_cat
        result = _make_result(component, students[0], marks=10)
        assert _client(SuperAdminFactory()).delete(_detail_url(result)).status_code == 204

    def test_nonexistent_result_is_404(self, school):
        import uuid
        response = _client(_make_user('admin', school)).delete(f'{LIST_URL}{uuid.uuid4()}/')
        assert response.status_code == 404

    def test_denied_mutations_write_no_audit(self, instructor, python_cat, django_capture_on_commit_callbacks):
        from audit.constants import AuditAction

        component, students = python_cat
        result = _make_result(component, students[0], marks=10, graded_by=instructor)
        before = (_audit_count(AuditAction.DELETE), _audit_count(AuditAction.MARKS_CHANGED))
        with django_capture_on_commit_callbacks(execute=True):
            assert _client(instructor).delete(_detail_url(result)).status_code == 403
            assert _client(instructor).patch(_detail_url(result), {'marks_obtained': 30}, format='json').status_code == 403
        assert (_audit_count(AuditAction.DELETE), _audit_count(AuditAction.MARKS_CHANGED)) == before

    def test_bulk_grade_with_only_rejected_rows_writes_no_marks_changed_audit(
        self, instructor, python_cat, django_capture_on_commit_callbacks,
    ):
        from audit.constants import AuditAction

        component, students = python_cat
        before = _audit_count(AuditAction.BULK_MARKS_CHANGED)
        with django_capture_on_commit_callbacks(execute=True):
            response = _grade(_client(instructor), component, students[:2], marks=999)
        assert response.data['created'] == 0
        assert _audit_count(AuditAction.BULK_MARKS_CHANGED) == before

    def test_successful_bulk_grade_is_audited(self, instructor, python_cat, django_capture_on_commit_callbacks):
        from audit.constants import AuditAction

        component, students = python_cat
        before = _audit_count(AuditAction.BULK_MARKS_CHANGED)
        with django_capture_on_commit_callbacks(execute=True):
            _grade(_client(instructor), component, students[:2])
        assert _audit_count(AuditAction.BULK_MARKS_CHANGED) == before + 1


@pytest.mark.django_db
@pytest.mark.security
def test_post_ignores_every_non_authoritative_field(school, other_school, instructor, python_cat):
    component, students = python_cat
    someone_else = _make_user('admin', school)

    response = _post(
        _client(instructor), component, students[0], marks_obtained=20,
        school=other_school.id, attempt_number=3, is_retake=True, graded_by=someone_else.id,
        graded_at='2020-01-01T00:00:00Z', is_submitted=False, submitted_at='2020-01-01T00:00:00Z',
        percentage=99, status='FAIL',
    )

    assert response.status_code == 201, response.data
    result = StudentComponentResult.all_objects.get(component=component, student=students[0])
    assert result.school_id == school.id
    assert (result.attempt_number, result.is_retake) == (1, False)
    assert result.graded_by_id == instructor.id
    assert result.is_submitted is True
    assert result.graded_at.year != 2020 and result.submitted_at.year != 2020
    assert result.status == 'PASS' and float(result.percentage) == pytest.approx(66.67)


# ---------------------------------------------------------------------------
# Component DELETE and indirect (cascade) result deletion
# ---------------------------------------------------------------------------

def _component_url(component):
    return f'/api/assessment-components/{component.pk}/'


@pytest.fixture
def graded_component(instructor, python_cat):
    """CAT 1 with one graded and one ungraded (placeholder) result."""
    component, students = python_cat
    _make_result(component, students[0], marks=20, graded_by=instructor)
    _make_result(component, students[1])
    return component


def _assert_component_intact(component, expected_results=2):
    assert AssessmentComponent.all_objects.filter(pk=component.pk).exists()
    assert StudentComponentResult.all_objects.filter(component_id=component.pk).count() == expected_results


@pytest.mark.django_db
@pytest.mark.security
class TestComponentDeleteAuthorization:

    def test_instructor_cannot_delete_own_component_with_results(
        self, instructor, graded_component, django_capture_on_commit_callbacks,
    ):
        from audit.constants import AuditAction

        before = _audit_count(AuditAction.DELETE)
        with django_capture_on_commit_callbacks(execute=True):
            response = _client(instructor).delete(_component_url(graded_component))

        assert response.status_code == 403
        _assert_component_intact(graded_component)
        assert _audit_count(AuditAction.DELETE) == before

    def test_instructor_cannot_delete_own_empty_component(self, instructor, python_cat):
        component, _ = python_cat
        assert _client(instructor).delete(_component_url(component)).status_code == 403
        _assert_component_intact(component, expected_results=0)

    def test_instructor_cannot_delete_component_of_another_subject(self, school, instructor):
        other = _make_user('instructor', school)
        component, students = _make_policy_component(school, other, name='DelCompOther', student_count=1)
        _make_result(component, students[0], marks=10)

        assert _client(instructor).delete(_component_url(component)).status_code in (403, 404)
        _assert_component_intact(component, expected_results=1)

    @pytest.mark.tenant
    def test_instructor_cannot_delete_component_of_another_school(self, other_school, instructor):
        component, students = _make_policy_component(
            other_school, _make_user('instructor', other_school), name='DelCompAbroad', student_count=1,
        )
        _make_result(component, students[0], marks=10)

        assert _client(instructor).delete(_component_url(component)).status_code in (403, 404)
        _assert_component_intact(component, expected_results=1)

    @pytest.mark.parametrize('role', ['commandant', 'chief_instructor', 'student'])
    def test_other_roles_cannot_delete_component(self, school, graded_component, role):
        assert _client(_make_user(role, school)).delete(_component_url(graded_component)).status_code == 403
        _assert_component_intact(graded_component)

    def test_anonymous_cannot_delete_component(self, graded_component):
        assert APIClient().delete(_component_url(graded_component)).status_code in (401, 403)
        _assert_component_intact(graded_component)

    def test_admin_deletes_component_and_it_is_audited(self, school, graded_component, django_capture_on_commit_callbacks):
        from audit.models import AuditLog
        from audit.constants import AuditAction

        with django_capture_on_commit_callbacks(execute=True):
            response = _client(_make_user('admin', school)).delete(_component_url(graded_component))

        assert response.status_code == 204
        assert not AssessmentComponent.all_objects.filter(pk=graded_component.pk).exists()
        assert AuditLog.objects.filter(action=AuditAction.DELETE, target_object_id=str(graded_component.pk)).exists()

    def test_superadmin_deletes_component(self, graded_component):
        from tests.factories.users import SuperAdminFactory
        assert _client(SuperAdminFactory()).delete(_component_url(graded_component)).status_code == 204

    def test_instructor_component_create_and_update_unchanged(self, instructor, python_cat):
        """Only deletion is restricted; instructors keep the component create/update they had."""
        component, _ = python_cat
        client = _client(instructor)
        assert client.patch(_component_url(component), {'description': 'updated'}, format='json').status_code == 200


@pytest.mark.django_db
@pytest.mark.security
class TestNoNonAdminCascadeDeletesResults:
    """
    Invariant: no non-admin role can make a StudentComponentResult disappear by deleting any
    parent whose deletion cascades to it (component, subject, class, course, student, the
    subject's instructor, school).
    """

    @pytest.mark.parametrize('role', [
        'owner_instructor', 'instructor', 'commandant', 'chief_instructor', 'oic',
        'chief_of_training', 'student', 'anonymous',
    ])
    def test_parent_deletes_are_denied(self, school, instructor, python_cat, role):
        component, students = python_cat
        _make_result(component, students[0], marks=20, graded_by=instructor)
        subject = component.subject
        cls = subject.class_obj
        targets = {
            'component': _component_url(component),
            'subject': f'/api/subjects/{subject.pk}/',
            'class': f'/api/classes/{cls.pk}/',
            'course': f'/api/courses/{cls.course_id}/',
            'student user': f'/api/users/{students[0].pk}/',
            'instructor user': f'/api/users/{instructor.pk}/',
            'school': f'/api/schools/{school.pk}/',
        }
        if role == 'anonymous':
            client = APIClient()
        elif role == 'owner_instructor':
            client = _client(instructor)
        elif role == 'student':
            client = _client(students[1])
        else:
            client = _client(_make_user(role, school))

        outcomes = {name: client.delete(url).status_code for name, url in targets.items()}

        allowed = {name: code for name, code in outcomes.items() if code < 400}
        assert not allowed, f'{role} deleted: {allowed}'
        assert StudentComponentResult.all_objects.filter(component_id=component.pk).count() == 1
