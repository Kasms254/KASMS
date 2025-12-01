from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import School, User
import secrets

@receiver(post_save, sender=School)
def create_school_admin(sender, instance, created, **kwargs):
    if created:
        username = f"{instance.subdomain}_admin"
        password = secrets.token_urlsafe(10)

        user  = User.objects.create_user(
            username=username,
            password=password,
            role="admin",
            school=instance,
        )
        instance._auto_created_admin ={
            "username": username,
            "password": password,
        }

