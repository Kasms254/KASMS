from django.contrib.contenttypes.models import ContentType

from .services import audit_event


class AuditedDestroyMixin:


    audit_delete_action = None

    def perform_destroy(self, instance):
        content_type = ContentType.objects.get_for_model(instance)
        object_id = str(instance.pk)
        repr_ = str(instance)
        school = getattr(instance, 'school', None)

        instance.delete()

        if self.audit_delete_action:
            audit_event(
                self.audit_delete_action, request=getattr(self, 'request', None),
                target_content_type=content_type, target_object_id=object_id,
                target_repr=repr_, school=school,
            )


class AuditedUpdateMixin:

    audit_update_action = None
    audit_tracked_fields = ()

    def perform_update(self, serializer):
        instance = serializer.instance
        previous = {f: getattr(instance, f) for f in self.audit_tracked_fields}

        updated = serializer.save()

        changes = {
            field: {'old': previous[field], 'new': getattr(updated, field)}
            for field in self.audit_tracked_fields
            if previous[field] != getattr(updated, field)
        }

        if changes and self.audit_update_action:
            audit_event(
                self.audit_update_action, request=getattr(self, 'request', None),
                target=updated, changes=changes,
            )
