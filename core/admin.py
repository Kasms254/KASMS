from django.contrib import admin
from .models import (
    User, Course, Class, Enrollment, Subject, Notice, Exam, 
    ExamReport, Attendance, ExamResult, ClassNotice, School, PersonalNotification, NoticeReadStatus, ClassNoticeReadStatus,
    ExamResultNotificationReadStatus, AttendanceSessionLog, BiometricRecord, AttendanceSession, SessionAttendance, ExamAttachment, SchoolMembership, Certificate
    )
from django.utils import timezone
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

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
class SchoolAdmin(admin.ModelAdmin):
    
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
class UserAdmin(TenantAdminMixin, BaseUserAdmin):
    list_display = ['username', 'email', 'get_full_name', 'role', 'get_school', 'is_active']
    list_filter = [SchoolAdminFilter, 'role', 'is_active', 'is_staff']
    search_fields = ['username', 'email', 'first_name', 'last_name', 'svc_number']
    ordering = ['-created_at']
    inlines = [SchoolMembershipInline]
    
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

    def get_school(self, obj):
        return obj.school.name if obj.school else 'Unaffiliated'
    get_school.short_description = 'Current School'

    def get_queryset(self, request):
        return User.all_objects.all()

@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
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
class ClassAdmin(admin.ModelAdmin):
    list_display = ('id','name', 'course', 'instructor', 'start_date', 'end_date', 'capacity', 'is_active','is_closed', 'current_enrollment', 'enrollment_status')
    list_filter = ('course', 'instructor', 'is_active', 'start_date')
    search_fields = ('name', 'course__name', 'instructor__username')
    ordering = ['-created_at']

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
class SubjectAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at', 'updated_at')
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
class ExamAdmin(admin.ModelAdmin):
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
class ExamResultAdmin(TenantAdminMixin, admin.ModelAdmin):
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
        list_display = ('id', 'name', 'short_name', 'short_name', 'max_students', 'max_instructors')
        list_filter = ['is_active']
        search_fields = ['name']
        ordering = ['-name']


@admin.register(Certificate)
class CertificateAdmin(TenantAdminMixin, admin.ModelAdmin):
    list_display = ['id', 'school', 'student', 'certificate_number', 'issued_by']
    search_fields = ['school__name', 'student__first_name', 'student__last_name', 'certificate_number']
    list_filter = ['issued_by', 'school']
    ordering = ['-school', 'certificate_number']
    raw_id_fields = ['school', 'student', 'issued_by']