import uuid
from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from core.models import School
from .constants import AuditAction

class AuditLog(models.Model):

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    action = models.CharField(max_length=40, choices=AuditAction.choices)

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='audit_events',
    )
    actor_identifier = models.CharField(
        max_length=150, blank=True,
        help_text="svc_number/username snapshot, or 'system' — survives actor deletion.",
    )
    actor_display_name = models.CharField(max_length=300, blank=True)
    actor_role = models.CharField(
        max_length=100, blank=True,
        help_text="Role label at the time of the event, not the actor's current role.",
    )

    school = models.ForeignKey(
        School, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='audit_events',
    )
    school_name = models.CharField(max_length=150, blank=True)

    target_content_type = models.ForeignKey(
        ContentType, on_delete=models.SET_NULL, null=True, blank=True,
    )
    target_object_id = models.CharField(
        max_length=64, blank=True,
        help_text='str(pk) — CharField because target PKs vary (int, UUID, ...).',
    )
    target_repr = models.CharField(
        max_length=300, blank=True,
        help_text='Human-readable snapshot of the target, captured before deletion where relevant.',
    )
    target = GenericForeignKey('target_content_type', 'target_object_id')

    description = models.TextField(blank=True)
    changes = models.JSONField(default=dict, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    request_id = models.CharField(max_length=36, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)

    success = models.BooleanField(default=True)

    objects = models.Manager()

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at'], name='audit_created_idx'),
            models.Index(fields=['school', 'created_at'], name='audit_school_created_idx'),
            models.Index(fields=['actor', 'created_at'], name='audit_actor_created_idx'),
            models.Index(fields=['action', 'created_at'], name='audit_action_created_idx'),
            models.Index(fields=['target_content_type', 'target_object_id'], name='audit_target_idx'),
            models.Index(fields=['request_id'], name='audit_request_id_idx'),
        ]

    def __str__(self):
        return f"{self.action} by {self.actor_identifier or 'system'} at {self.created_at}"

    def save(self, *args, **kwargs):
        if self.pk and AuditLog.objects.filter(pk=self.pk).exists():
            raise ValueError('Audit logs cannot be modified.')
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError('Audit logs cannot be deleted.')
