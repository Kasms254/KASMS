from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings

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






