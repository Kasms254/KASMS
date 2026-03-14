"""
Meeting Endpoints — Full Integration Tests

Run with:
    python manage.py test test_meetings --verbosity=2

If migration 0064 fails with 'relation "meetings" already exists':
    python manage.py migrate core 0064 --fake
    python manage.py migrate
"""
from datetime import timedelta
from django.utils import timezone
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status as http_status
from core.models import (
    School, SchoolMembership, User, Course, Class, Enrollment,
    Meeting, MeetingParticipant, MeetingNotification,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_school(code='TEST01', name='Test School'):
    return School.objects.create(
        code=code, name=name, email=f'{code.lower()}@test.com',
        phone='0700000000', address='Test Addr', city='Nairobi',
    )


def _create_user(school, role, svc, first_name='Test', last_name='User'):
    user = User.all_objects.create(
        username=svc, svc_number=svc, role=role,
        first_name=first_name, last_name=last_name,
        email=f'{svc}@test.com', phone_number='0700000000',
        must_change_password=False,
    )
    user.set_password('TestPass123!')
    user.save()
    SchoolMembership.objects.create(
        user=user, school=school, role=role,
        status=SchoolMembership.Status.ACTIVE,
    )
    user.clear_membership_cache()
    return user


def _create_class(school, instructor, name='Tactics Alpha', code='TAC101'):
    course = Course.all_objects.create(
        school=school, name='Tactics', code=code, description='Tactics course',
    )
    return Class.all_objects.create(
        school=school, course=course, name=name,
        instructor=instructor,
        start_date=timezone.now().date(),
        end_date=(timezone.now() + timedelta(days=90)).date(),
        capacity=30,
    )


def _enroll_student(school, student, class_obj):
    membership = SchoolMembership.objects.filter(
        user=student, school=school, status='active',
    ).first()
    return Enrollment.all_objects.create(
        school=school, student=student, class_obj=class_obj,
        membership=membership, is_active=True,
    )


def _create_meeting(school, instructor, class_obj, title='Test Meeting'):
    meeting = Meeting.all_objects.create(
        school=school, title=title,
        created_by=instructor,
        scheduled_start=timezone.now() + timedelta(hours=1),
        scheduled_end=timezone.now() + timedelta(hours=2),
        provider='jitsi',
    )
    meeting.classes.set([class_obj])
    return meeting


# ===========================================================================
# TEST 1: Full Jitsi Lifecycle
# ===========================================================================

class MeetingLifecycleTest(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.school = _create_school()
        cls.instructor = _create_user(
            cls.school, 'instructor', 'INST001',
            first_name='John', last_name='Instructor',
        )
        cls.student = _create_user(
            cls.school, 'student', 'STU001',
            first_name='Jane', last_name='Student',
        )
        cls.admin = _create_user(
            cls.school, 'admin', 'ADM001',
            first_name='Admin', last_name='Boss',
        )
        cls.class_obj = _create_class(cls.school, cls.instructor)
        cls.enrollment = _enroll_student(cls.school, cls.student, cls.class_obj)

    def setUp(self):
        self.client = APIClient()

    def test_instructor_creates_jitsi_meeting(self):
        self.client.force_authenticate(user=self.instructor)
        payload = {
            'title': 'Tactics Lecture 1',
            'description': 'Introduction to battlefield tactics',
            'scheduled_start': (timezone.now() + timedelta(hours=1)).isoformat(),
            'scheduled_end': (timezone.now() + timedelta(hours=2)).isoformat(),
            'class_ids': [self.class_obj.id],
        }
        resp = self.client.post('/api/meetings/', payload, format='json')
        self.assertEqual(resp.status_code, http_status.HTTP_201_CREATED, resp.data)

        meeting = Meeting.all_objects.get(id=resp.data['id'])
        self.assertEqual(meeting.provider, 'jitsi')
        self.assertEqual(meeting.status, 'scheduled')
        self.assertEqual(meeting.school, self.school)
        self.assertEqual(meeting.created_by, self.instructor)
        self.assertIn(self.class_obj, meeting.classes.all())
        expected_room = f"{self.school.code}-{meeting.meeting_code}"
        self.assertEqual(meeting.video_room_name, expected_room)

    def test_instructor_starts_meeting(self):
        meeting = _create_meeting(self.school, self.instructor, self.class_obj)
        self.client.force_authenticate(user=self.instructor)
        resp = self.client.post(f'/api/meetings/{meeting.id}/start/')
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data['status'], 'live')
        self.assertIsNotNone(resp.data['actual_start'])
        participant = MeetingParticipant.all_objects.get(meeting=meeting, user=self.instructor)
        self.assertEqual(participant.role, 'host')

    def test_student_joins_and_gets_jitsi_config(self):
        meeting = _create_meeting(self.school, self.instructor, self.class_obj)
        meeting.start()

        self.client.force_authenticate(user=self.student)
        resp = self.client.post('/api/meetings/join/', {
            'join_token': meeting.join_token,
        }, format='json')
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK, resp.data)

        vc = resp.data['video_config']
        self.assertEqual(vc['provider'], 'jitsi')
        self.assertEqual(vc['room_name'], f'{self.school.code}-{meeting.meeting_code}')
        self.assertEqual(vc['display_name'], 'Jane Student')
        self.assertEqual(vc['user_email'], 'STU001@test.com')
        self.assertFalse(vc['is_host'])
        self.assertIn('participant_id', resp.data)
        self.assertIsNone(resp.data['meeting']['join_token'])

        participant = MeetingParticipant.all_objects.get(meeting=meeting, user=self.student)
        self.assertEqual(participant.role, 'participant')
        self.assertIsNone(participant.left_at)

    def test_creator_joins_as_host(self):
        meeting = _create_meeting(self.school, self.instructor, self.class_obj)
        meeting.start()

        self.client.force_authenticate(user=self.instructor)
        resp = self.client.post('/api/meetings/join/', {
            'join_token': meeting.join_token,
        }, format='json')
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK)
        self.assertTrue(resp.data['video_config']['is_host'])
        self.assertEqual(resp.data['meeting']['join_token'], meeting.join_token)

    def test_student_leaves_meeting(self):
        meeting = _create_meeting(self.school, self.instructor, self.class_obj)
        meeting.start()
        MeetingParticipant.objects.get_or_create(
            meeting=meeting, user=self.student, defaults={'role': 'participant'},
        )

        self.client.force_authenticate(user=self.student)
        resp = self.client.post(f'/api/meetings/{meeting.id}/leave/')
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK)
        participant = MeetingParticipant.all_objects.get(meeting=meeting, user=self.student)
        self.assertIsNotNone(participant.left_at)

    def test_instructor_ends_meeting(self):
        meeting = _create_meeting(self.school, self.instructor, self.class_obj)
        meeting.start()
        MeetingParticipant.objects.create(meeting=meeting, user=self.student, role='participant')

        self.client.force_authenticate(user=self.instructor)
        resp = self.client.post(f'/api/meetings/{meeting.id}/end/')
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data['status'], 'ended')
        self.assertIsNotNone(resp.data['actual_end'])
        self.assertEqual(meeting.participants.filter(left_at__isnull=True).count(), 0)


# ===========================================================================
# TEST 2: Pagination
# ===========================================================================

class MeetingPaginationTest(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.school = _create_school(code='PAG01', name='Pagination School')
        cls.instructor = _create_user(cls.school, 'instructor', 'PAGINST')
        cls.class_obj = _create_class(cls.school, cls.instructor, name='Pag Class', code='PAG101')
        for i in range(15):
            m = Meeting.all_objects.create(
                school=cls.school, title=f'Meeting {i+1}',
                created_by=cls.instructor,
                scheduled_start=timezone.now() + timedelta(hours=i+1),
                provider='jitsi',
            )
            m.classes.set([cls.class_obj])

    def test_list_is_paginated(self):
        client = APIClient()
        client.force_authenticate(user=self.instructor)
        resp = client.get('/api/meetings/')
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK)
        self.assertIn('count', resp.data)
        self.assertIn('results', resp.data)
        self.assertEqual(resp.data['count'], 15)
        self.assertEqual(len(resp.data['results']), 10)

    def test_custom_page_size(self):
        client = APIClient()
        client.force_authenticate(user=self.instructor)
        resp = client.get('/api/meetings/?page_size=5')
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK)
        self.assertEqual(len(resp.data['results']), 5)
        self.assertIsNotNone(resp.data['next'])

    def test_page_2(self):
        client = APIClient()
        client.force_authenticate(user=self.instructor)
        resp = client.get('/api/meetings/?page=2')
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK)
        self.assertEqual(len(resp.data['results']), 5)


# ===========================================================================
# TEST 3: Cancel Flow
# ===========================================================================

class MeetingCancelTest(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.school = _create_school(code='CAN01', name='Cancel School')
        cls.instructor = _create_user(cls.school, 'instructor', 'CANINST')
        cls.class_obj = _create_class(cls.school, cls.instructor, name='Cancel Class', code='CAN101')

    def test_cancel_scheduled(self):
        meeting = _create_meeting(self.school, self.instructor, self.class_obj, 'To Cancel')
        client = APIClient()
        client.force_authenticate(user=self.instructor)
        resp = client.post(f'/api/meetings/{meeting.id}/cancel/')
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK)
        self.assertEqual(resp.data['status'], 'cancelled')

    def test_cannot_cancel_live(self):
        meeting = _create_meeting(self.school, self.instructor, self.class_obj, 'Live')
        meeting.start()
        client = APIClient()
        client.force_authenticate(user=self.instructor)
        resp = client.post(f'/api/meetings/{meeting.id}/cancel/')
        self.assertEqual(resp.status_code, http_status.HTTP_400_BAD_REQUEST)

    def test_cannot_cancel_ended(self):
        meeting = _create_meeting(self.school, self.instructor, self.class_obj, 'Ended')
        meeting.start()
        meeting.end()
        client = APIClient()
        client.force_authenticate(user=self.instructor)
        resp = client.post(f'/api/meetings/{meeting.id}/cancel/')
        self.assertEqual(resp.status_code, http_status.HTTP_400_BAD_REQUEST)


# ===========================================================================
# TEST 4: Security
# ===========================================================================

class MeetingSecurityTest(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.school_a = _create_school(code='SECA', name='School A')
        cls.instructor_a = _create_user(cls.school_a, 'instructor', 'SECA_INST')
        cls.student_a = _create_user(cls.school_a, 'student', 'SECA_STU', first_name='Alice', last_name='Alpha')
        cls.admin_a = _create_user(cls.school_a, 'admin', 'SECA_ADM')
        cls.class_a = _create_class(cls.school_a, cls.instructor_a, name='Class A', code='SECA101')
        cls.enrollment_a = _enroll_student(cls.school_a, cls.student_a, cls.class_a)
        cls.meeting_a = _create_meeting(cls.school_a, cls.instructor_a, cls.class_a, 'School A Meeting')

        cls.school_b = _create_school(code='SECB', name='School B')
        cls.student_b = _create_user(cls.school_b, 'student', 'SECB_STU')
        cls.instructor_b = _create_user(cls.school_b, 'instructor', 'SECB_INST')

    def test_student_cannot_create(self):
        client = APIClient()
        client.force_authenticate(user=self.student_a)
        resp = client.post('/api/meetings/', {
            'title': 'Nope',
            'scheduled_start': (timezone.now() + timedelta(hours=1)).isoformat(),
            'class_ids': [self.class_a.id],
        }, format='json')
        self.assertEqual(resp.status_code, http_status.HTTP_403_FORBIDDEN)

    def test_cross_school_join_blocked(self):
        self.meeting_a.status = 'live'
        self.meeting_a.actual_start = timezone.now()
        self.meeting_a.save(update_fields=['status', 'actual_start', 'updated_at'])

        client = APIClient()
        client.force_authenticate(user=self.student_b)
        resp = client.post('/api/meetings/join/', {
            'join_token': self.meeting_a.join_token,
        }, format='json')
        self.assertEqual(resp.status_code, http_status.HTTP_403_FORBIDDEN)

    def test_cross_school_manage_blocked(self):
        client = APIClient()
        client.force_authenticate(user=self.instructor_b)
        resp = client.post(f'/api/meetings/{self.meeting_a.id}/start/')
        self.assertIn(resp.status_code, [http_status.HTTP_404_NOT_FOUND, http_status.HTTP_403_FORBIDDEN])

    def test_token_hidden_from_student(self):
        client = APIClient()
        client.force_authenticate(user=self.student_a)
        resp = client.get(f'/api/meetings/{self.meeting_a.id}/')
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK)
        self.assertIsNone(resp.data['join_token'])

    def test_token_visible_to_creator(self):
        client = APIClient()
        client.force_authenticate(user=self.instructor_a)
        resp = client.get(f'/api/meetings/{self.meeting_a.id}/')
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK)
        self.assertEqual(resp.data['join_token'], self.meeting_a.join_token)

    def test_token_visible_to_admin(self):
        client = APIClient()
        client.force_authenticate(user=self.admin_a)
        resp = client.get(f'/api/meetings/{self.meeting_a.id}/')
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK)
        self.assertEqual(resp.data['join_token'], self.meeting_a.join_token)

    def test_list_hides_token(self):
        client = APIClient()
        client.force_authenticate(user=self.instructor_a)
        resp = client.get('/api/meetings/')
        self.assertEqual(resp.status_code, http_status.HTTP_200_OK)
        results = resp.data.get('results', resp.data)
        if isinstance(results, list) and results:
            self.assertNotIn('join_token', results[0])
            self.assertNotIn('join_url', results[0])