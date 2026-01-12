from django.contrib import admin
from .models import User, Course, Class, Enrollment, Subject, Notice, Exam, ExamReport, Attendance, ExamResult, ClassNotice
from django.utils import timezone
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('id','username', 'email', 'first_name', 'last_name','svc_number', 'phone_number', 'role', 'is_active', 'is_staff', 'rank')
    list_filter = ('role', 'is_active', 'is_staff', 'svc_number', 'rank')
    search_fields = ('username', 'email', 'svc_number', 'phone_number')
    ordering = ['-created_at']

    fieldsets = BaseUserAdmin.fieldsets + (
        ('Additional Info', {
            'fields': ('role', 'phone_number', 'svc_number'),
        }),)
    
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Additional Info', {  
            'fields': ('role', 'phone_number', 'svc_number'),
        }),)
    

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
    list_display = ('id','name', 'course', 'instructor', 'start_date', 'end_date', 'capacity', 'is_active', 'current_enrollment', 'enrollment_status')
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
    list_display = ('id','title', 'subject', 'exam_date', 'created_at', 'exam_type')
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