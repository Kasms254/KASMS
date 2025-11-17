from django.contrib import admin
from .models import User, Course, Class, Enrollment, Subject, Notice
from django.utils import timezone
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('username', 'email', 'first_name', 'last_name','svc_number', 'phone_number', 'role', 'is_active', 'is_staff')
    list_filter = ('role', 'is_active', 'is_staff', 'svc_number')
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
    list_display = ('name', 'course', 'instructor', 'start_date', 'end_date', 'capacity', 'is_active')
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

    list_display = ('student', 'class_obj', 'enrollment_date')
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

