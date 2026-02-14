from django.utils import timezone
from django.db.models import Q, Exists, OuterRef, Subquery
from .models import (
    Subject, Enrollment, Exam, ExamResult, Class, Certificate, SchoolMembership
)

def get_subject_completion_status(subject, student):
    
    final_exam = Exam.all_objects.filter(
        subject=subject,
        exam_type='final',
        is_active=True
    ).first()

    if not final_exam:
        return {
            'subject_id': subject.id,
            'subject_name': subject.name,
            'is_complete':False,
            'reason': 'no_final_exam',
            'final_exam': None,
            'result': None
        }


    result = ExamResult.all_objects.filter(
        exam=final_exam,
        student=student,
        is_submitted=True,
        marks_obtained__isnull = False,
    ).first()

    return {
        'subject_id': subject.id,
        'subject_name': subject.name,
        'is_complete': result is not None,
        'reason': 'graded' if result else 'not_graded',
        'final_exam_id': final_exam.id,
        'final_exam_title': final_exam.title,
        'result': {
            'marks': float(result.marks_obtained),
            'total': final_exam.total_marks,
            'percentage':result.percentage,
            'grade': result.grade,
            'graded_at':result.graded_at,
        } if result else None

    }


def get_class_completion_status(class_obj, student):

    subjects = Subject.all_objects.filter(
        class_obj= class_obj,
        is_active=True
    )

    if not subjects.exists():
        return {
            'class_id': class_obj.id,
            'class_name': class_obj.name,
            'is_academically_complete': False,
            'is_closed':class_obj.is_closed,
            'reason': 'no_subjects',
            'subjects':[],
            'total_subjects': 0,
            'completed_subjects': 0
        }

    subject_statuses = []
    for subject in subjects:
        status = get_subject_completion_status(subject, student)
        subject_statuses.append(status)

    completed_count = sum(1 for s in subject_statuses if s ['is_complete'])
    total_count = len(subject_statuses)
    all_complete = completed_count == total_count

    return {
        'class_id': class_obj.id,
        'class_name': class_obj.name,
        'is_academically_complete': all_complete,
        'is_closed': class_obj.is_closed,
        'total_subjects': total_count,
        'completed_subjects':completed_count,
        'subjects': subject_statuses,
    }

def check_class_completion_for_all_students(class_obj):

    enrollments = Enrollment.all_objects.filter(
        class_obj=class_obj,
        is_active=True
    ).select_related('student')

    results = []

    for enrollment in enrollments:
        status = get_class_completion_status(class_obj, enrollment.student)
        status['student_id'] = enrollment.student.id
        status['student_name'] = enrollment.student.get_full_name()
        status['svc_number'] = enrollment.student.svc_number
        status['enrollment_id'] = enrollment.id
        results.append(status)


    return results


def issue_certificate(enrollment, issued_by):

    if hasattr(enrollment, 'certificate'):
        return None, 'Certificate already issued for this enrollment.'

    class_obj = enrollment.class_obj


    status = get_class_completion_status(class_obj, enrollment.student)
    if not status['is_academically_complete']:
        incomplete = [
            s['subject_name'] for s in status['subjects'] if not s['is_complete']
        ]
        return None, f"Student has incomplete subjects: {','.join(incomplete)}"


    certificate = Certificate.objects.create(
        student=enrollment.student,
        enrollment = enrollment,
        class_obj = class_obj,
        school = enrollment.school,
        issued_by = issued_by,
    )

    enrollment.completion_date = timezone.now().date()
    enrollment.is_active = False
    enrollment.completed_via = 'certificate'
    enrollment.save(update_fields=[
        'completion_date', 'is_active', 'completed_via'
    ])

    _try_complete_membership(enrollment)

    return certificate, None


def close_class(class_obj, closed_by):

    if class_obj.is_closed:
        return False, 'Class is already closed.'

    active_without_cert = Enrollment.all_objects.filter(
        class_obj=class_obj,
        is_active=True
    ).exclude(
        certificate__isnull=False
    ).count()

    if active_without_cert > 0:
        return False, (
            f'{active_without_cert} student(s) still have active enrollments without certificates. '
            'Issue certificates to all eligible students before closing the class.'
        )

    class_obj.is_closed = True
    class_obj.closed_at = timezone.now()
    class_obj.closed_by = closed_by
    class_obj.save(update_fields = ['is_closed', 'closed_at', 'closed_by'])

    return True, None

def bulk_issue_certificates(class_obj, issued_by):


    enrollments = Enrollment.all_objects.filter(
        class_obj=class_obj,
        is_active=True
    ).select_related('student')

    issued = []
    skipped = []
    failed = []

    for enrollment in enrollments:
        if hasattr(enrollment, 'certificate'):
            skipped.append({
                'student': enrollment.student.svc_number,
                'reason': 'already_issued'
            })
            continue

        certificate, error = issue_certificate(enrollment, issued_by)
        if certificate:
            issued.append({
                'student': enrollment.student.svc_number,
                'certificate_number': certificate.certificate_number,
            })
        else:
            failed.append({
                'student': enrollment.student.svc_number,
                'reason': error,
            })

    return {
        'issued_count': len(issued),
        'skipped_count': len(skipped),
        'failed_count': len(failed),
        'issued': issued,
        'skipped': skipped,
        'failed': failed,
    }

def _try_complete_membership(enrollment):

    membership = enrollment.membership
    if membership and membership.status == 'active':
        has_active = Enrollment.all_objects.filter(
            membership=membership, is_active=True
        ).exists()

        if not has_active:
            membership.complete()
    elif not membership and enrollment.school:

        has_other_active = Enrollment.all_objects.filter(
            student = enrollment.student,
            school=enrollment.school,
            is_active=True
        ).exclude(pk=enrollment.pk).exists()
        if not has_other_active:
            active_membership = SchoolMembership.all_objects.filter(
                user = enrollment.student,
                school = enrollment.school,
                status = 'active'
            ).first()
            if active_membership:
                active_membership.complete()
