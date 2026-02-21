from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings
from .services import get_class_completion_status
from .models import PersonalNotification, User, Enrollment
from core.models import Enrollment as Enroll, StudentIndex
from django.db import transaction as tx
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

    if not created:
        return

    def _assign():


        try:
            enrollment = Enroll.all_objects.select_related(
                'class_obj', 'school'
            ).get(pk=instance.pk)
        except Enroll.DoesNotExist:
            return

        if StudentIndex.all_objects.filter(enrollment=enrollment).exists():
            return

        class_obj = enrollment.class_obj

        try:
            with tx.atomic():
                existing = (
                    StudentIndex.all_objects
                    .select_for_update()
                    .filter(class_obj=class_obj)
                    .order_by("-index_number")
                )
                if existing.exists():
                    last_num = int(existing.first().index_number)
                    next_number = last_num + 1
                else:
                    next_number = 1

                StudentIndex.objects.create(
                    enrollment=enrollment,
                    class_obj=class_obj,
                    index_number=next_index,
                    school=enrollment.school,
                )
                logger.info(
                    "StudentIndex '%s' assigned to enrollment %s in class '%s'",
                    next_index, enrollment.id, class_obj.name,
                )
        except Exception as e:
            logger.error(
                "Failed to assign StudentIndex for enrollment %s: %s",
                instance.pk, e, exc_info=True,
            )

    transaction.on_commit(_assign)





