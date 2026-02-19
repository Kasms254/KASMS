from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings
from .services import get_class_completion_status
from .models import PersonalNotification, User, Enrollment
import logging

logger = logging.getLogger(__name__)

@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_user_profile(sender, instance, created, **kwargs):
    if not created:
        return

    def _create_profile():
        from core.models import Profile
        Profile.all_objects.get_or_create(
            user=instance,
            defaults={"school": instance.school},
        )

    transaction.on_commit(_create_profile)

@receiver(post_save, sender='core.ExamResult')
def check_academic_completion_on_grade(sender, instance, **kwargs):
    if not instance.is_submitted or instance.marks_obtained is None:
        return

    exam = instance.exam
    if exam.exam_type != 'final':
        return

    def _check():
        class_obj = exam.subject.class_obj
        student = instance.student
        status = get_class_completion_status(class_obj, student)

        if status['is_academically_complete']:
            admin_memberships = class_obj.school.memberships.filter(
                role__in=['admin', 'commandant'],
                status='active',
            ).select_related('user')

            for membership in admin_memberships:
                PersonalNotification.objects.create(
                    school=class_obj.school,
                    user=membership.user,
                    notification_type='alert',
                    priority='medium',
                    title=f"Student Academically Complete: {student.get_full_name()}",
                    content=(
                        f"{student.svc_number} - {student.get_full_name()} "
                        f"has completed all subjects in {class_obj.name}. "
                        f"Class closure and certificate issuance can proceed "
                        f"when all students are ready."
                    ),
                    created_by=instance.graded_by,
                )

    transaction.on_commit(_check)
    
@receiver(post_save, sender=Enrollment)
def auto_assign_student_index(sender, instance, created, **kwargs):

    if created and not hasattr(instance, "student_index"):
        try:
            idx = assign_student_index(instance)
            logger.info(
                f"Assigned index {idx.index_number} to student "
                f"{instance.student_id} in class {instance.class_obj.name}"
            )
        except Exception as e:
            logger.error(
                f"Failed to assign index for enrollment {instance.id}: {e}"
            )






