from django.contrib import admin
from django.core.exceptions import PermissionDenied
from .services import delete_student_with_reports, student_deletion_block_reason, delete_course_report
from .models import (
    User,StudentIndex, Course, Class, Enrollment, Subject, Notice, Exam, 
    ExamReport, Attendance, ExamResult, ClassNotice, School, PersonalNotification, NoticeReadStatus, ClassNoticeReadStatus,
    ExamResultNotificationReadStatus, AttendanceSessionLog, BiometricRecord, AttendanceSession, SessionAttendance, ExamAttachment, SchoolMembership, Certificate, TwoFactorCode,
    Department,CourseReportStageRemark,CourseReportAuditLog, CourseReport, DepartmentMembership, ResultEditRequest, AssessmentComponent, StudentComponentResult,
    UserImportAuditLog,
    )
from django.utils import timezone
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import OICAssignment, OICRemark
from audit.admin import AuditedAdminDeleteMixin
from audit.constants import AuditAction
from audit.services import audit_event

class SchoolAdminFilter(admin.SimpleListFilter):
    title = 'school'
    parameter_name = 'school'

    def lookups(self, request, model_admin):
        schools = School.objects.filter(is_active = True)
        return [(str(s.id), s.name) for s in schools]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(
                school_memberships__school_id=self.value(),
                school_memberships__status='active'
            )
        return queryset

class TenantAdminMixin:
    
    def get_queryset(self, request):
        qs = self.model.all_objects.all()
        ordering = self.get_ordering(request)
        if ordering:
            qs = qs.order_by(*ordering)
        return qs
    
    def save_model(self, request, obj, form, change):
        if not change and hasattr(obj, 'school') and not obj.school:
            admin_school = request.user.school  
            if admin_school:
                obj.school = admin_school
        super().save_model(request, obj, form, change)

@admin.register(School)
class SchoolAdmin(AuditedAdminDeleteMixin, admin.ModelAdmin):

    audit_delete_action = AuditAction.DELETE
    list_display = ['name', 'code', 'email', 'city', 'is_active', 'student_count', 'instructor_count']
    list_filter = ['is_active', 'city']
    search_fields = ['name', 'code', 'email']
    readonly_fields = ['id', 'created_at', 'updated_at']
    fieldsets = (
        ('Basic Information', {
            'fields': ('id', 'code', 'name', 'short_name', 'email', 'phone')
        }),
        ('Location', {
            'fields': ('address', 'city')
        }),
        ('Branding', {
            'fields': ('logo', 'primary_color', 'secondary_color', 'accent_color', 'theme_config'),
            'classes': ('collapse',)
        }),
        ('Subscription', {
            'fields': ('is_active', 'subscription_start', 'subscription_end', 'max_students', 'max_instructors')
        }),
        ('Metadata', {
            'fields': ('settings', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def student_count(self, obj):
        return obj.current_student_count
    student_count.short_description = 'Students'

    def instructor_count(self, obj):
        return obj.current_instructor_count
    instructor_count.short_description = 'Instructors'
    
class SchoolMembershipInline(admin.TabularInline):
    model = SchoolMembership
    extra = 0
    fields = ['school', 'role', 'status', 'started_at', 'ended_at']
    readonly_fields = ['started_at', 'ended_at']

@admin.register(User)
class UserAdmin(AuditedAdminDeleteMixin, TenantAdminMixin, BaseUserAdmin):
    audit_delete_action = AuditAction.DELETE_USER
    list_display = ['id','username', 'email', 'get_full_name', 'role', 'get_school', 'is_active']
    list_filter = [SchoolAdminFilter, 'role', 'is_active', 'is_staff']
    search_fields = ['username', 'email', 'first_name', 'last_name', 'svc_number']
    ordering = ['-created_at']
    
    def get_inlines(self, request, obj=None):
        if obj is None: 
            return []
        return [SchoolMembershipInline]
    
    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Personal Info', {'fields': ('first_name', 'last_name', 'email', 'phone_number', 'svc_number')}),
        ('Role & Military', {'fields': ('role', 'rank', 'unit')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined', 'created_at', 'updated_at')}),
    )
    
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'email', 'password1', 'password2', 'role', 'svc_number', 'phone_number'),
        }),
    )
    
    readonly_fields = ['created_at', 'updated_at', 'last_login', 'date_joined']

    privilege_fields = ('is_staff', 'is_superuser')

    def get_school(self, obj):
        return obj.school.name if obj.school else 'Unaffiliated'
    get_school.short_description = 'Current School'

    def get_queryset(self, request):
        return User.all_objects.all()

    def get_readonly_fields(self, request, obj=None):
        readonly = list(super().get_readonly_fields(request, obj))
        if not request.user.is_superuser:

            readonly += [f for f in self.privilege_fields if f not in readonly]
        return readonly

    def save_model(self, request, obj, form, change):
        previous = None
        if change:
            previous = {
                field: getattr(User.all_objects.get(pk=obj.pk), field)
                for field in self.privilege_fields
            }

        obj.save()

        if previous:
            changes = {
                field: {'old': previous[field], 'new': getattr(obj, field)}
                for field in self.privilege_fields
                if previous[field] != getattr(obj, field)
            }
            if changes:
                audit_event(
                    AuditAction.PRIVILEGE_CHANGED, request=request, target=obj,
                    changes=changes,
                )

    def response_add(self, request, obj, post_url_continue=None):

        obj.clear_membership_cache()
        return super().response_add(request, obj, post_url_continue)

    def has_delete_permission(self, request, obj=None):
        # A student with an approved course report or an issued certificate
        # must never be deletable — not even through Django admin. This
        # mirrors UserViewSet.destroy()'s student-deletion rule exactly
        # (same shared helper) rather than reimplementing it, and it is
        # enforced by Django itself for both the single-object delete view
        # and the bulk "delete selected" action (both consult
        # has_delete_permission per object before allowing anything to be
        # deleted — see contrib.admin.utils.get_deleted_objects).
        if obj is not None and obj.role == 'student' and student_deletion_block_reason(obj) is not None:
            return False
        return super().has_delete_permission(request, obj)

    def get_deleted_objects(self, objs, request):
        # Django's own delete confirmation page pre-computes what deleting
        # `objs` would cascade into via a generic Collector (NestedObjects),
        # and if that collector hits ANY on_delete=PROTECT relation it
        # marks the whole deletion "protected" and refuses to proceed —
        # unconditionally, before has_delete_permission's actual rule or
        # delete_model ever run. CourseReport.enrollment is PROTECT, so a
        # student with only DRAFT reports (which has_delete_permission
        # above correctly allows) would still get blocked here by the
        # generic collector, which has no concept of "draft vs approved".
        #
        # Only intervene for the single-object case where we've already
        # confirmed (via the same rule has_delete_permission uses) that
        # deletion is genuinely permitted and reports actually exist —
        # otherwise defer entirely to Django's real, accurate collector.
        if len(objs) == 1:
            obj = objs[0]
            if getattr(obj, 'role', None) == 'student' and student_deletion_block_reason(obj) is None:
                reports = list(
                    CourseReport.objects.filter(enrollment__student=obj)
                    .select_related('class_obj')
                )
                if reports:
                    to_delete = [str(obj)] + [f'Course report: {r}' for r in reports]
                    model_count = {'users': 1, 'course reports': len(reports)}
                    return to_delete, model_count, set(), []
        return super().get_deleted_objects(objs, request)

    def delete_model(self, request, obj):
        if obj.role == 'student':
            # Capture the audit snapshot before deletion — delete_student_
            # with_reports() mutates obj.pk to None once student.delete()
            # runs, same reason the base AuditedAdminDeleteMixin captures
            # identity before deleting.
            self._audit_single_delete(request, obj)
            success, error = delete_student_with_reports(obj, request.user)
            if not success:
                # has_delete_permission should already have prevented
                # reaching this point — only a genuine race gets here.
                raise PermissionDenied(error)
            return
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        students = [u for u in queryset if u.role == 'student']
        others = [u for u in queryset if u.role != 'student']

        if students:
            # has_delete_permission already refused the whole bulk action
            # if any selected student were blocked, so every student here
            # is known-deletable — but delete_student_with_reports is still
            # called per-student (rather than a bare bulk cascade) so each
            # one gets its non-approved-report file cleanup and audit trail.
            self._audit_bulk_delete(request, students)
            for student in students:
                success, error = delete_student_with_reports(student, request.user)
                if not success:
                    raise PermissionDenied(error)

        if others:
            self._audit_bulk_delete(request, others)
            User.all_objects.filter(pk__in=[u.pk for u in others]).delete()

@admin.register(Course)
class CourseAdmin(AuditedAdminDeleteMixin, admin.ModelAdmin):
    audit_delete_action = AuditAction.DELETE_COURSE
    list_display = ('name', 'code', 'created_at', 'updated_at')
    list_filter = ('created_at',)
    search_fields = ('name', 'code')
    ordering = ['-created_at']

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_at = timezone.now()
        obj.updated_at = timezone.now()
        super().save_model(request, obj, form, change)
        
@admin.register(Class)
class ClassAdmin(AuditedAdminDeleteMixin, admin.ModelAdmin):
    audit_delete_action = AuditAction.DELETE_CLASS
    list_display = ('id','name', 'course', 'instructor', 'start_date', 'end_date', 'capacity', 'is_active','is_closed', 'current_enrollment', 'enrollment_status')
    list_filter = ('course', 'instructor', 'is_active', 'start_date')
    search_fields = ('name', 'course__name', 'instructor__username')
    ordering = ['-created_at']

    def has_delete_permission(self, request, obj=None):
        # Mirrors ClassViewSet.destroy()'s hard-delete guard exactly — a
        # class with any CourseReport or Certificate must never be
        # deletable through admin either. Checked explicitly here (not left
        # to the accidental protection CourseReport.enrollment=PROTECT
        # happens to provide during cascade collection), so it stays
        # correct even if that FK's on_delete ever changes for unrelated
        # reasons. Django enforces this for both the single-object delete
        # view and the bulk "delete selected" action.
        if obj is not None and (
            CourseReport.objects.filter(class_obj=obj).exists()
            or Certificate.objects.filter(class_obj=obj).exists()
        ):
            return False
        return super().has_delete_permission(request, obj)

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_at = timezone.now()
        obj.updated_at = timezone.now()
        super().save_model(request, obj, form, change)

@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):

    list_display = ('student', 'class_obj', 'enrollment_date', 'is_active')
    list_filter = ('enrollment_date', 'class_obj')
    search_fields = ['student__username']
    ordering = ['-enrollment_date']

    def save_model(self, request, obj, form, change):
        if not change:
            obj.enrollment_date = timezone.now()
        super().save_model(request, obj, form, change)

@admin.register(Subject)
class SubjectAdmin(AuditedAdminDeleteMixin, admin.ModelAdmin):
    audit_delete_action = AuditAction.DELETE
    list_display = ('name', 'created_at', 'updated_at', 'subject_code', 'instructor')
    list_filter = ('created_at',)
    search_fields = ['name']
    readonly_fields = ('created_at', 'updated_at')
    ordering = ['-created_at']

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_at = timezone.now()
        obj.updated_at = timezone.now()
        super().save_model(request, obj, form, change)

@admin.register(Notice)
class NoticeAdmin(admin.ModelAdmin):
    list_display = ('title', 'created_at', 'is_active', 'priority')
    list_filter = ('is_active', 'created_at', 'priority')
    search_fields = ('title', 'content')
    ordering = ['-created_at']

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_at = timezone.now()
        obj.updated_at = timezone.now()
        super().save_model(request, obj, form, change)

@admin.register(Exam)
class ExamAdmin(AuditedAdminDeleteMixin, admin.ModelAdmin):
    audit_delete_action = AuditAction.DELETE_EXAM
    list_display = ('id', 'title', 'subject', 'exam_date', 'created_at', 'exam_type')
    list_filter = ('subject', 'exam_date', 'created_at')
    search_fields = ('name', 'subject__name')
    ordering = ['-created_at']

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_at = timezone.now()
        obj.updated_at = timezone.now()
        super().save_model(request, obj, form, change)

@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ('student', 'status', 'class_obj')
    list_filter = ['status']
    search_fields = ['student__username']
    ordering = ['-status']

    def save_model(self, request, obj, form, change):
        
        if not change:
            obj.created_at = timezone.now()
        obj.updated_at = timezone.now()
        super().save_model(request, obj, form, change)

@admin.register(ExamResult)
class ExamResultAdmin(AuditedAdminDeleteMixin, TenantAdminMixin, admin.ModelAdmin):
    audit_delete_action = AuditAction.DELETE
    list_display = ['exam', 'student', 'marks_obtained', 'grade', 'is_submitted', 'school']
    list_filter = [SchoolAdminFilter, 'is_submitted']
    search_fields = ['exam__title', 'student__username']
    raw_id_fields = ['exam', 'student', 'graded_by']
    
    def get_queryset(self, request):
        return ExamResult.all_objects.select_related('exam', 'student', 'school').all()

@admin.register(AttendanceSession)
class AttendanceSessionAdmin(TenantAdminMixin, admin.ModelAdmin):
    list_display = ['title', 'session_type', 'class_obj', 'status', 'scheduled_start', 'school']
    list_filter = [SchoolAdminFilter, 'session_type', 'status', 'is_active']
    search_fields = ['title', 'class_obj__name']
    raw_id_fields = ['class_obj', 'subject', 'created_by']
    date_hierarchy = 'scheduled_start'
    
    def get_queryset(self, request):
        return AttendanceSession.all_objects.select_related('class_obj', 'school').all()

@admin.register(SessionAttendance)
class SessionAttendanceAdmin(TenantAdminMixin, admin.ModelAdmin):
    list_display = ['session', 'student', 'status', 'marking_method', 'marked_at', 'school']
    list_filter = [SchoolAdminFilter, 'status', 'marking_method']
    search_fields = ['student__username', 'session__title']
    raw_id_fields = ['session', 'student', 'marked_by']
    
    def get_queryset(self, request):
        return SessionAttendance.all_objects.select_related('session', 'student', 'school').all()

@admin.register(ClassNotice)
class ClassNoticeAdmin(TenantAdminMixin, admin.ModelAdmin):
    list_display = ['title', 'class_obj', 'priority', 'created_by', 'is_active', 'school']
    list_filter = [SchoolAdminFilter, 'priority', 'is_active']
    search_fields = ['title', 'content', 'class_obj__name']
    raw_id_fields = ['class_obj', 'subject', 'created_by']
    
    def get_queryset(self, request):
        return ClassNotice.all_objects.select_related('class_obj', 'school').all()

@admin.register(PersonalNotification)
class PersonalNotificationAdmin(TenantAdminMixin, admin.ModelAdmin):
    list_display = ['title', 'user', 'notification_type', 'priority', 'is_read', 'created_at', 'school']
    list_filter = [SchoolAdminFilter, 'notification_type', 'priority', 'is_read']
    search_fields = ['title', 'user__username']
    raw_id_fields = ['user', 'exam_result', 'created_by']
    
    def get_queryset(self, request):
        return PersonalNotification.all_objects.select_related('user', 'school').all()

@admin.register(ExamAttachment)
class ExamAttachmentAdmin(TenantAdminMixin, admin.ModelAdmin):
    list_display = ['exam', 'file_name', 'uploaded_by', 'created_at', 'school']
    raw_id_fields = ['exam', 'uploaded_by']
    
    def get_queryset(self, request):
        return ExamAttachment.all_objects.all()

@admin.register(BiometricRecord)
class BiometricRecordAdmin(TenantAdminMixin, admin.ModelAdmin):
    list_display = ['student', 'device_id', 'device_type', 'scan_time', 'processed', 'school']
    list_filter = [SchoolAdminFilter, 'device_type', 'processed']
    raw_id_fields = ['student', 'session', 'session_attendance']
    
    def get_queryset(self, request):
        return BiometricRecord.all_objects.all()

@admin.register(ExamReport)
class ExamReportAdmin(TenantAdminMixin, admin.ModelAdmin):
    list_display = ['title', 'subject', 'class_obj', 'report_date', 'school']
    raw_id_fields = ['subject', 'class_obj', 'created_by']

    def get_queryset(self, request):
        return ExamReport.all_objects.select_related('subject', 'class_obj', 'school')

@admin.register(Certificate)
class CertificateAdmin(AuditedAdminDeleteMixin, TenantAdminMixin, admin.ModelAdmin):
    audit_delete_action = AuditAction.DELETE_CERTIFICATE
    list_display = ['id', 'school', 'student', 'certificate_number', 'issued_by']
    search_fields = ['school__name', 'student__first_name', 'student__last_name', 'certificate_number', 'student__svc_number']
    list_filter = ['issued_by', 'school']
    ordering = ['-school', 'certificate_number']
    raw_id_fields = ['school', 'student', 'issued_by']

    def has_delete_permission(self, request, obj=None):
        # Certificates are permanent institutional records — never
        # admin-deletable, full stop. This is deliberately unconditional
        # (not just "not revoked") because there is no supported "undo an
        # issued certificate" flow other than the existing revoke action,
        # which changes status rather than removing the row.
        #
        # This also acts as a project-wide backstop for every OTHER admin
        # deletion path whose cascade could reach a Certificate (Class,
        # User, Enrollment, and anything above them) — Django's own
        # get_deleted_objects() checks has_delete_permission() on every
        # object collected into a cascade, not just the one being directly
        # deleted, so a single guard here protects all of them at once.
        if obj is not None:
            return False
        return super().has_delete_permission(request, obj)

@admin.register(StudentIndex)
class StudentIndexAdmin(admin.ModelAdmin):
    list_display = [
        "index_number", "class_obj", "get_student_name",
        "get_svc_number"
    ]
    list_filter = ["class_obj", "school"]
    search_fields = [
        "index_number",
        "enrollment__student__first_name",
        "enrollment__student__last_name",
        "enrollment__student__svc_number",
    ]

    ordering = ["class_obj", "index_number"]

    def get_student_name(self, obj):
        return obj.enrollment.student.get_full_name()
    get_student_name.short_description = "Student Name"

    def get_svc_number(self, obj):
        return obj.enrollment.student.svc_number
    get_svc_number.short_description = "Svc Number"

@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'school', 'is_active', 'hod']
    list_filter = ['school', 'is_active']
    search_fields = ['name', 'code', 'school__code']

@admin.register(DepartmentMembership)
class DepartmentMembershipAdmin(AuditedAdminDeleteMixin, admin.ModelAdmin):
    audit_delete_action = AuditAction.DELETE
    list_display = ['user', 'department', 'role', 'is_active', 'assigned_at']
    list_filter = ['role', 'is_active', 'department__school']
    search_fields = ['user__svc_number', 'department__name']

@admin.register(ResultEditRequest)
class ResultEditRequestAdmin(AuditedAdminDeleteMixin, admin.ModelAdmin):
    audit_delete_action = AuditAction.DELETE
    list_display = ['requested_by', 'exam_result', 'status', 'reviewed_by', 'created_at']
    list_filter = ['status', 'school']
    search_fields = ['requested_by__svc_number', 'exam_result__id']
    readonly_fields = ['created_at', 'updated_at']

@admin.register(TwoFactorCode)
class TwoFactorCodeAdmin(admin.ModelAdmin):
    list_display = ('user', 'code', 'is_used', 'attempts', 'expires_at', 'created_at')
    list_filter = ('is_used',)
    search_fields = ('user__svc_number', 'user__email')
    readonly_fields = ('id', 'code', 'created_at')
    ordering = ('-created_at',)

# oic
class OICAssignmentAdmin(AuditedAdminDeleteMixin, TenantAdminMixin, admin.ModelAdmin):
    audit_delete_action = AuditAction.DELETE
    list_display = ('oic', 'class_obj', 'is_active', 'assigned_by', 'assigned_at')
    list_filter = ('is_active', 'school')
    search_fields = (
        'oic__svc_number', 'oic__first_name', 'oic__last_name',
        'class_obj__name', 'class_obj__course__name',
    )
    raw_id_fields = ('oic', 'class_obj', 'assigned_by')
    readonly_fields = ('id', 'assigned_at', 'updated_at')
    list_select_related = ('oic', 'class_obj', 'assigned_by', 'school')
 
class OICRemarkAdmin(TenantAdminMixin, admin.ModelAdmin):
    list_display = ('oic', 'class_obj', 'subject', 'remark_type', 'created_at')
    list_filter = ('remark_type', 'school')
    search_fields = (
        'oic__svc_number', 'oic__first_name', 'oic__last_name',
        'class_obj__name', 'remark',
    )
    raw_id_fields = ('oic', 'class_obj', 'subject')
    readonly_fields = ('id', 'created_at', 'updated_at')
    list_select_related = ('oic', 'class_obj', 'subject', 'school')
 
admin.site.register(OICAssignment, OICAssignmentAdmin)
admin.site.register(OICRemark, OICRemarkAdmin)

@admin.register(AssessmentComponent)
class AssessmentComponentAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'subject', 'component_type', 'is_critical',
        'pass_mark', 'weight', 'retake_allowed', 'is_active',
    ]
    list_filter = ['component_type', 'is_critical', 'retake_allowed', 'is_active', 'school']
    search_fields = ['name', 'subject__name']
    readonly_fields = ['id', 'created_at', 'updated_at']
    raw_id_fields = ['subject', 'school']
    ordering = ['subject', 'sort_order', 'name']
 
    fieldsets = (
        (None, {
            'fields': ('school', 'subject', 'name', 'component_type', 'description'),
        }),
        ('Scoring', {
            'fields': ('total_marks', 'weight', 'pass_mark'),
        }),
        ('Rules', {
            'fields': ('is_critical', 'retake_allowed', 'max_retake_attempts', 'retake_evaluation'),
        }),
        ('Display', {
            'fields': ('sort_order', 'is_active'),
        }),
        ('Metadata', {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )

@admin.register(StudentComponentResult)
class StudentComponentResultAdmin(AuditedAdminDeleteMixin, admin.ModelAdmin):
    audit_delete_action = AuditAction.DELETE
    list_display = [
        'student', 'component', 'attempt_number', 'marks_obtained',
        'percentage', 'status', 'is_retake', 'is_submitted',
    ]
    list_filter = ['status', 'is_retake', 'is_submitted', 'school']
    search_fields = [
        'student__svc_number', 'student__first_name', 'student__last_name',
        'component__name', 'component__subject__name',
    ]
    readonly_fields = ['id', 'percentage', 'status', 'created_at', 'updated_at']
    raw_id_fields = ['student', 'component', 'school', 'graded_by']
    ordering = ['-created_at']
 
    fieldsets = (
        (None, {
            'fields': ('school', 'component', 'student'),
        }),
        ('Attempt', {
            'fields': ('attempt_number', 'is_retake'),
        }),
        ('Scoring', {
            'fields': ('marks_obtained', 'percentage', 'status'),
        }),
        ('Grading Metadata', {
            'fields': ('graded_by', 'graded_at', 'remarks', 'is_submitted', 'submitted_at'),
        }),
        ('System', {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )

# course report
class CourseReportStageRemarkInline(admin.TabularInline):
    model = CourseReportStageRemark
    extra = 0
    readonly_fields = ('id', 'stage', 'author', 'content', 'is_submitted', 'created_at', 'updated_at')
    can_delete = False
 
    def has_add_permission(self, request, obj=None):
        return False
 
class CourseReportAuditLogInline(admin.TabularInline):
    model = CourseReportAuditLog
    extra = 0
    readonly_fields = ('id', 'action', 'performed_by', 'metadata', 'created_at')
    can_delete = False
 
    def has_add_permission(self, request, obj=None):
        return False
 
@admin.register(CourseReport)
class CourseReportAdmin(admin.ModelAdmin):
    # Deletion is NOT routed through AuditedAdminDeleteMixin here: it would
    # only call obj.delete()/queryset.delete() directly, skipping file
    # cleanup and writing a thinner audit event than the shared service
    # produces. delete_model/delete_queryset below call
    # core.services.delete_course_report() instead — the same function the
    # DRF-adjacent student-deletion path uses — so there is exactly one
    # audit event and one file-cleanup implementation for a CourseReport
    # deletion, not two.
    list_display = (
        'id', 'get_student_name', 'get_class_name',
        'status', 'is_active', 'created_at',
    )
    list_filter = ('status', 'is_active', 'school', 'class_obj')
    search_fields = (
        'enrollment__student__username',
        'enrollment__student__first_name',
        'enrollment__student__last_name',
        'enrollment__student__svc_number',
        'class_obj__name',
        'class_obj__course__name',
    )
    readonly_fields = ('id', 'created_at', 'updated_at')
    raw_id_fields = ('enrollment', 'class_obj', 'school', 'created_by')
    inlines = [CourseReportStageRemarkInline, CourseReportAuditLogInline]

    def has_delete_permission(self, request, obj=None):
        # An approved report is a signed institutional record — it must
        # never be deletable through admin, even by staff with delete perms.
        if obj is not None and obj.status == 'approved':
            return False
        return super().has_delete_permission(request, obj)

    def delete_model(self, request, obj):
        delete_course_report(obj, request.user, reason='admin_deleted')

    def delete_queryset(self, request, queryset):
        # has_delete_permission already refused the whole bulk action if
        # any selected report were approved, so every report here is
        # known-deletable.
        for report in queryset:
            delete_course_report(report, request.user, reason='admin_deleted')

    def get_student_name(self, obj):
        student = obj.enrollment.student
        return f"{student.first_name} {student.last_name}".strip() or student.username
    get_student_name.short_description = 'Student'
 
    def get_class_name(self, obj):
        return str(obj.class_obj)
    get_class_name.short_description = 'Class'
 
@admin.register(CourseReportStageRemark)
class CourseReportStageRemarkAdmin(admin.ModelAdmin):
    list_display = ('id', 'report', 'stage', 'author', 'is_submitted', 'created_at')
    list_filter = ('stage', 'is_submitted')
    readonly_fields = ('id', 'created_at', 'updated_at')
    raw_id_fields = ('report', 'author')
 
@admin.register(CourseReportAuditLog)
class CourseReportAuditLogAdmin(admin.ModelAdmin):
    list_display = ('id', 'report', 'action', 'performed_by', 'created_at')
    list_filter = ('action',)
    readonly_fields = ('id', 'report', 'action', 'performed_by', 'metadata', 'created_at')

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

@admin.register(UserImportAuditLog)
class UserImportAuditLogAdmin(admin.ModelAdmin):
    list_display = ('id', 'school', 'action', 'performed_by', 'created_at')
    list_filter = ('action', 'school')
    readonly_fields = ('id', 'school', 'action', 'performed_by', 'metadata', 'created_at')

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False