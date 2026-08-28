from django.contrib import admin
from django.contrib.contenttypes.models import ContentType

from .models import AuditLog
from .services import audit_event


class AuditedAdminDeleteMixin:

    audit_delete_action = None
    audit_bulk_id_limit = 50

    def delete_model(self, request, obj):
        self._audit_single_delete(request, obj)
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        self._audit_bulk_delete(request, list(queryset))
        super().delete_queryset(request, queryset)

    def _audit_single_delete(self, request, obj):
        if not self.audit_delete_action:
            return
        audit_event(
            self.audit_delete_action, request=request,
            target_content_type=ContentType.objects.get_for_model(obj),
            target_object_id=str(obj.pk), target_repr=str(obj),
            school=getattr(obj, 'school', None),
            metadata={'source': 'django_admin', 'operation': 'single_delete'},
        )

    def _audit_bulk_delete(self, request, objects):
        if not self.audit_delete_action or not objects:
            return

        model = objects[0].__class__
        content_type = ContentType.objects.get_for_model(model)

        # .school_id reads the already-loaded FK column — no extra query
        # per object, unlike .school which would fetch the related row.
        school_ids = {getattr(obj, 'school_id', None) for obj in objects}
        school_ids.discard(None)
        single_school = getattr(objects[0], 'school', None) if len(school_ids) == 1 else None

        object_ids = [str(obj.pk) for obj in objects]
        truncated_ids = object_ids[:self.audit_bulk_id_limit]

        audit_event(
            self.audit_delete_action, request=request,
            target_content_type=content_type,
            target_repr=f'{len(objects)} {model._meta.verbose_name_plural}',
            school=single_school,
            metadata={
                'source': 'django_admin',
                'operation': 'bulk_delete',
                'model': model.__name__,
                'count': len(objects),
                'object_ids': truncated_ids,
                'object_ids_truncated': len(object_ids) > self.audit_bulk_id_limit,
                'multi_school': len(school_ids) > 1,
            },
        )


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):

    list_display = (
        'created_at', 'action', 'actor_display_name', 'actor_role',
        'school_name', 'target_content_type', 'target_repr', 'success',
    )
    list_filter = ('action', 'success', 'school', 'target_content_type')
    search_fields = (
        'actor_identifier', 'actor_display_name', 'target_repr', 'request_id',
    )
    date_hierarchy = 'created_at'
    readonly_fields = [f.name for f in AuditLog._meta.fields]
    ordering = ('-created_at',)

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            'actor', 'school', 'target_content_type',
        )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_view_permission(self, request, obj=None):
        user = request.user
        return bool(getattr(user, 'is_active', False) and user.is_superuser)

    def has_module_permission(self, request):
        return self.has_view_permission(request)
