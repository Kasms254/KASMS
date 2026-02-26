from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from django.core.validators import FileExtensionValidator
import os
import uuid
import hashlib
from datetime import timedelta
from .managers import TenantAwareUserManager, TenantAwareManager, SimpleTenantAwareManager, DepartmentMembershipManager
from django.core.validators import RegexValidator
from django.db import models, transaction

def school_logo_upload_path(instance, filename):
        ext = filename.split('.')[-1]
        return f"school_logos/{instance.slug}/{uuid.uuid4().hex}.{ext}"
      
class School(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(
        max_length=20, unique=True,
        validators=[RegexValidator(regex='^[A-Z0-9_]+$', message='School code must be uppercase letters, numbers and underscores only')],
        help_text="Unique school code (e.g., 'KACEME')"
    )
    name = models.CharField(max_length=200)
    short_name = models.CharField(max_length=50, blank=True)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20)
    address = models.TextField()
    city = models.CharField(max_length=100)
    logo = models.ImageField(upload_to="school_logos/", null=True, blank=True)
    primary_color = models.CharField(max_length=7, default="#1976D2")
    secondary_color = models.CharField(max_length=7, default='#424242')
    accent_color = models.CharField(max_length=7, default='#FFC107')
    theme_config = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    subscription_start = models.DateField(null=True, blank=True)
    subscription_end = models.DateField(null=True, blank=True)
    max_students = models.IntegerField(default=5000)
    max_instructors = models.IntegerField(default=500)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    settings = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'schools'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.code})"

    @property
    def current_student_count(self):
        return self.memberships.filter(role='student', status='active').count()

    @property
    def current_instructor_count(self):
        return self.memberships.filter(role='instructor', status='active').count()
        
    @property
    def is_within_limits(self):
        return self.current_student_count <= self.max_students and self.current_instructor_count <= self.max_instructors

    @property
    def get_theme(self):
        return {
            'primary_color': self.primary_color,
            'secondary_color': self.secondary_color,
            'accent_color': self.accent_color,
            'logo_url': self.logo.url if self.logo else None,
            'school_name': self.name,
            'school_short_name': self.short_name or '',
            **self.theme_config
        }
#    school membership
class SchoolMembership(models.Model):

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        COMPLETED = 'completed', 'Completed'
        INACTIVE = 'inactive', 'Inactive'
        TRANSFERRED = 'transferred', 'Transferred'
        WITHDRAWN = 'withdrawn', 'Withdrawn'

    class Role(models.TextChoices):
        STUDENT = 'student', 'Student'
        INSTRUCTOR = 'instructor', 'Instructor'
        ADMIN = 'admin', 'Admin'
        COMMANDANT = 'commandant', 'Commandant'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        'User', on_delete=models.CASCADE, related_name='school_memberships'
    )
    school = models.ForeignKey(
        School, on_delete=models.CASCADE, related_name='memberships'
    )
    role = models.CharField(max_length=20, choices=Role.choices)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE
    )
    started_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True, blank=True)
    completion_date = models.DateField(null=True, blank=True)
    transfer_to = models.ForeignKey(
        School, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='inbound_transfers'
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'school_memberships'
        ordering = ['-started_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'school'],
                condition=models.Q(status='active'),
                name='unique_active_membership_per_school'
            ),
        ]
        indexes = [
            models.Index(fields=['user', 'status']),
            models.Index(fields=['school', 'status']),
            models.Index(fields=['user', 'school', 'status']),
        ]

    def __str__(self):
        return f"{self.user.svc_number} @ {self.school.code} ({self.status})"

    def complete(self):
        self.status = self.Status.COMPLETED
        self.ended_at = timezone.now()
        self.completion_date = timezone.now().date()
        self.save(update_fields=['status', 'ended_at', 'completion_date', 'updated_at'])
        Enrollment.all_objects.filter(
            membership=self, is_active=True
        ).update(is_active=False, completion_date=timezone.now().date())

    def transfer(self, to_school):
        self.status = self.Status.TRANSFERRED
        self.ended_at = timezone.now()
        self.transfer_to = to_school
        self.save()
        return SchoolMembership.objects.create(
            user=self.user, school=to_school,
            role=self.role, status=self.Status.ACTIVE
        )

    def reactivate(self):
        if SchoolMembership.all_objects.filter(
            user=self.user, status=self.Status.ACTIVE
        ).exclude(pk=self.pk).exists():
            raise ValidationError(
                'User already has an active membership at another school.'
            )
        self.status = self.Status.ACTIVE
        self.ended_at = None
        self.save(update_fields=['status', 'ended_at', 'updated_at'])

#departments of schools
class Department(models.Model):

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey(
        'School', on_delete=models.CASCADE, related_name='departments'
    )
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=20)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = SimpleTenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'departments'
        unique_together = [('school', 'code')]
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.code}) — {self.school.code}"

    @property
    def hod(self):
        membership = self.department_memberships.filter(
            role=DepartmentMembership.Role.HOD,
            is_active=True
        ).select_related('user').first()
        return membership.user if membership else None

class DepartmentMembership(models.Model):
    class Role(models.TextChoices):
        HOD    = 'hod',    'Head of Department'
        MEMBER = 'member', 'Member'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    department = models.ForeignKey(
        Department, on_delete=models.CASCADE, related_name='department_memberships'
    )
    user = models.ForeignKey(
        'User', on_delete=models.CASCADE, related_name='department_memberships'
    )
    role = models.CharField(
        max_length=10, choices=Role.choices, default=Role.MEMBER
    )
    is_active = models.BooleanField(default=True)
    assigned_by = models.ForeignKey(
        'User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='department_assignments_made'
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = DepartmentMembershipManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'department_memberships'
        constraints = [
            models.UniqueConstraint(
                fields=['department'],
                condition=models.Q(role='hod', is_active=True),
                name='unique_active_hod_per_department'
            ),
            models.UniqueConstraint(
                fields=['department', 'user'],
                condition=models.Q(is_active=True),
                name='unique_active_user_per_department'
            ),
        ]
        indexes = [
            models.Index(fields=['user', 'role', 'is_active']),
            models.Index(fields=['department', 'role', 'is_active']),
        ]

    def __str__(self):
        return f"{self.user.svc_number} — {self.get_role_display()} of {self.department}"

class ResultEditRequest(models.Model):
    class Status(models.TextChoices):
        PENDING  = 'pending',  'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey(
        'School', on_delete=models.CASCADE, related_name='result_edit_requests'
    )
    exam_result = models.ForeignKey(
        'ExamResult', on_delete=models.CASCADE, related_name='edit_requests'
    )
    requested_by = models.ForeignKey(
        'User', on_delete=models.CASCADE, related_name='result_edit_requests_made'
    )
    reason = models.TextField(
        help_text='Instructor must explain why the result needs to be changed.'
    )
    proposed_marks = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    proposed_remarks = models.TextField(blank=True)

    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING
    )
    reviewed_by = models.ForeignKey(
        'User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='result_edit_requests_reviewed'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.TextField(
        blank=True,
        help_text='HOD feedback on the decision.'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'result_edit_requests'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['exam_result', 'status']),
            models.Index(fields=['requested_by', 'status']),
            models.Index(fields=['school', 'status']),
        ]
        constraints = [

            models.UniqueConstraint(
                fields=['exam_result'],
                condition=models.Q(status='pending'),
                name='unique_pending_edit_request_per_result'
            )
        ]

    def __str__(self):
        return (
            f"EditRequest({self.status}) by {self.requested_by.svc_number} "
            f"for Result#{self.exam_result_id}"
        )

    def approve(self, hod_user, note=''):

        self.status = self.Status.APPROVED
        self.reviewed_by = hod_user
        self.reviewed_at = timezone.now()
        self.review_note = note
        self.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'review_note', 'updated_at'])

        # Unlock the result
        self.exam_result.is_locked = False
        self.exam_result.save(update_fields=['is_locked', 'updated_at'])

    def reject(self, hod_user, note=''):
        self.status = self.Status.REJECTED
        self.reviewed_by = hod_user
        self.reviewed_at = timezone.now()
        self.review_note = note
        self.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'review_note', 'updated_at'])

class SchoolAdmin(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='school_admins')
    user = models.ForeignKey('User', on_delete=models.CASCADE, related_name='managed_schools')
    is_primary = models.BooleanField(default=False)
    permissions = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'school_admins'
        unique_together = ['school', 'user']

    def __str__(self):
        return f"{self.user.get_full_name()} - {self.school.name}"

class StudentIndex(models.Model):
    school = models.ForeignKey("School", on_delete=models.CASCADE, related_name="student_indexes", null=True, blank=True)
    enrollment = models.OneToOneField("Enrollment", on_delete=models.CASCADE, related_name="student_indexes",)
    class_obj = models.ForeignKey("Class", on_delete=models.CASCADE, related_name="student_indexes",)
    index_number = models.CharField(max_length=10, validators=[RegexValidator(r"^\d+$", "Index must be numeric digits only")],
    help_text="Zero-padded sequential number, e.g. '001'",
    )
    assigned_to = models.DateTimeField(auto_now_add=True)
    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = "student_indexes"
        unique_together = [("class_obj", "index_number")]
        ordering  = ["class_obj", "index_number"]
        indexes = [
            models.Index(fields=["class_obj", "index_number"]),
            models.Index(fields=["enrollment"]),
        ]

    def __str__(self):
      return f"[{self.class_obj.name}] {self.class_obj.format_index(int(self.index_number))}"

    def save(self, *args, **kwargs):
        if not self.school and self.class_obj:
            self.school = self.class_obj.school
        super().save(*args, **kwargs)

class User(AbstractUser):
    ROLE_CHOICES = [
        ('superadmin', 'Super Admin'),
        ('admin', 'Admin'),
        ('instructor', 'Instructor'),
        ('student', 'Student'),
        ('commandant', 'Commandant'),
    ]
    RANK_CHOICES = [
        ('private', 'Private'),
        ('lance_corporal', 'Lance Corporal'),
        ('corporal', 'Corporal'),
        ('sergeant', 'Sergeant'),
        ('senior_sergeant', 'Senior Sergeant'),
        ('warrant_officer_ii', 'Warrant Officer II'),
        ('warrant_officer_i', 'Warrant Officer I'),
        ('lieutenant', 'Lieutenant'),
        ('captain', 'Captain'),
        ('major', 'Major'),
        ('lieutenant_colonel', 'Lieutenant Colonel'),
        ('colonel', 'Colonel'),
        ('brigadier', 'Brigadier'),
        ('major_general', 'Major General'),
        ('lieutenant_general', 'Lieutenant General'),
        ('general', 'General'),
    ]

    must_change_password = models.BooleanField(default=True)
    role = models.CharField(
        max_length=20, choices=ROLE_CHOICES,
        help_text="Base role. Overridden by active membership role when affiliated."
    )
    rank = models.CharField(max_length=20, choices=RANK_CHOICES, null=True, blank=True)
    phone_number = models.CharField(max_length=20)
    svc_number = models.CharField(max_length=50, unique=True)
    email = models.EmailField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    unit = models.CharField(null=True, blank=True, max_length=100)

    objects = TenantAwareUserManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'users'

    def __str__(self):
        return f"{self.svc_number} - {self.get_full_name()}"

    @property
    def active_membership(self):
        if not hasattr(self, '_active_membership_cache'):
            self._active_membership_cache = (
                self.school_memberships
                .filter(status=SchoolMembership.Status.ACTIVE)
                .select_related('school')
                .first()
            )
        return self._active_membership_cache

    def clear_membership_cache(self):
        if hasattr(self, '_active_membership_cache'):
            del self._active_membership_cache

    @property
    def school(self):
        membership = self.active_membership
        return membership.school if membership else None

    @property
    def active_role(self):

        membership = self.active_membership
        return membership.role if membership else self.role

    def get_membership_for_school(self, school):
        return self.school_memberships.filter(
            school=school
        ).order_by('-started_at').first()

    def get_school_history(self):
        return self.school_memberships.select_related(
            'school', 'transfer_to'
        ).order_by('started_at')

    def has_active_enrollment(self):
        if self.active_role != 'student':
            return True
        return Enrollment.all_objects.filter(student=self, is_active=True).exists()
    
class Profile(models.Model):
    user = models.OneToOneField(
        "User", on_delete=models.CASCADE,
        related_name="profile",
    )
    school = models.ForeignKey(
        School, on_delete=models.CASCADE, related_name="profiles", null=True, blank=True,
    )
    bio = models.TextField(max_length=500, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now_add=True)

    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = "profiles"
        indexes = [
            models.Index(fields=["user"]),
        ]

    def __str__(self):
        return f"Profile: {self.user.username}"
    
class Course(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='courses', null=True, blank=True)
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20)
    description = models.TextField()
    level = models.CharField(max_length=50, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True, related_name='courses')
    objects = SimpleTenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'courses'
        unique_together = ['school', 'code']

    def __str__(self):
        return f"{self.name} ({self.code})"

class Class(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='classes', null=True, blank=True)
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='classes')
    name = models.CharField(max_length=100)
    instructor = models.ForeignKey(User, on_delete=models.CASCADE, limit_choices_to={'role': 'instructor'}, related_name='instructed_classes')
    start_date = models.DateField()
    end_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    capacity = models.IntegerField(validators=[MinValueValidator(1)], default=30)
    class_code = models.CharField(max_length=20, null=True, blank=True, unique=True)
    is_active = models.BooleanField(default=True)
    is_closed = models.BooleanField(default=False)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='classes_closed'
    )
    index_prefix = models.CharField(max_length=20, blank=True, default='', help_text="Prefix for student indexes")
    index_start_from = models.PositiveIntegerField(default=1, help_text="First index number assigned to new students (e.g. 50 → first student gets 050).")
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True, related_name='classes')

    objects = SimpleTenantAwareManager()
    all_objects = models.Manager()
    

    class Meta:
        db_table = 'classes'
        ordering = ['course', 'name']
        indexes = [
            models.Index(fields=['school', 'is_active']),
            models.Index(fields=['instructor', 'is_active']),
        ]

    def __str__(self):
        return f"{self.course.name} - {self.name}"

    @property
    def current_enrollment(self):
        return self.enrollments.filter(is_active=True).count()

    @property
    def enrollment_status(self):
        return f"{self.current_enrollment} / {self.capacity}"

    def format_index(self, number: int) -> str:
        padded = str(number).zfill(3)
        if self.index_prefix:
            return f"{self.index_prefix}/{padded}"
        return padded

    @property
    def next_index_preview(self):
        last = self.student_indexes.order_by("-index_number").first()
        next_num = int(last.index_number) + 1 if last else self.index_start_from
        return self.format_index(next_num)

    def save(self, *args, **kwargs):
        if not self.school and self.course:
            self.school = self.course.school
        if not self.department and self.course and self.course.department:
            self.department = self.course.department
        super().save(*args, **kwargs)
            
class Subject(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='subjects', null=True, blank=True)
    class_obj = models.ForeignKey(Class, on_delete=models.CASCADE, related_name='subjects')
    name = models.CharField(max_length=100)
    subject_code = models.CharField(max_length=20, null=True, blank=True)
    description = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    instructor = models.ForeignKey(User, on_delete=models.CASCADE, limit_choices_to={'role': 'instructor'}, related_name='subjects')
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True, related_name='subjects')

    objects = SimpleTenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'subjects'
        ordering = ['class_obj', 'name']
        indexes = [
            models.Index(fields=['class_obj', 'is_active']),
            models.Index(fields=['school', 'is_active']),
            models.Index(fields=['instructor', 'is_active']),
        ]

    def __str__(self):
        return f"{self.name} ({self.class_obj.name})"

    def save(self, *args, **kwargs):
        if not self.school and self.class_obj:
            self.school = self.class_obj.school
        if not self.department and self.class_obj and self.class_obj.department:
            self.department = self.class_obj.department
        super().save(*args, **kwargs)

class Notice(models.Model):

    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]

    school = models.ForeignKey(
        School, on_delete=models.CASCADE,
        related_name='notices', null=True, blank=True,
    )
    priority = models.CharField(
        max_length=10, choices=PRIORITY_CHOICES, default='medium',
    )
    title = models.CharField(max_length=200)
    content = models.TextField()
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='notices_created',
    )
    is_active = models.BooleanField(default=True)
    expiry_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = SimpleTenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'notices'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} ({self.get_priority_display()})"

    def save(self, *args, **kwargs):
        if self.expiry_date and self.expiry_date < timezone.now():
            self.is_active = False
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        if not self.expiry_date:
            return False
        return self.expiry_date < timezone.now()

class Enrollment(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='enrollments', null=True, blank=True)
    student = models.ForeignKey(User, on_delete=models.CASCADE, limit_choices_to={'role': 'student'}, related_name='enrollments')
    membership = models.ForeignKey(SchoolMembership, on_delete=models.CASCADE, related_name='enrollments', null=True, blank=True)
    class_obj = models.ForeignKey(Class, on_delete=models.CASCADE, related_name='enrollments')
    enrolled_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='enrollments_processed')
    enrollment_date = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    completion_date = models.DateField(null=True, blank=True)
    completed_via = models.CharField(
        max_length=20,
        choices=[
            ('manual', 'Manual'),
            ('certificate', 'Certificate Issued'),
            ('admin_closure', 'Admin Class Closure'),
        ],
        null=True, blank=True
    )
    
    objects = SimpleTenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'enrollments'
        ordering = ['-enrollment_date']
        unique_together = ['student', 'class_obj']
        indexes = [
            models.Index(fields=['class_obj', 'is_active']),
            models.Index(fields=['student', 'is_active']),
            models.Index(fields=['school', 'is_active']),
        ]

    def __str__(self):
        return f"{self.student.username} enrolled in {self.class_obj.course.name}"

    def save(self, *args, **kwargs):
        if not self.school and self.class_obj:
            self.school = self.class_obj.school
        super().save(*args, **kwargs)
# instructor
class Exam(models.Model):
    EXAM_TYPE_CHOICES = [('cat', 'CAT'), ('final', 'Final'), ('project', 'Project')]
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='exams', null=True, blank=True)
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='exams')
    title = models.CharField(max_length=200)
    exam_type = models.CharField(max_length=20, choices=EXAM_TYPE_CHOICES, default='cat')
    description = models.TextField(blank=True, null=True)
    total_marks = models.IntegerField(validators=[MinValueValidator(1)], default=100)
    exam_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='exams_created')
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    exam_duration = models.DurationField(null=True, blank=True)

    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'exams'
        ordering = ['created_at']
        unique_together = ['subject', 'exam_date', 'title']
        indexes = [
            models.Index(fields=['subject', 'is_active']),
            models.Index(fields=['school', 'is_active']),
        ]

    def __str__(self):
        return f"{self.title} - {self.subject.name}"

    def save(self, *args, **kwargs):
        if not self.school and self.subject:
            self.school = self.subject.school
        super().save(*args, **kwargs)

    @property
    def average_score(self):
        results = self.results.filter(is_submitted=True)
        if not results.exists():
            return 0
        return results.aggregate(models.Avg('marks_obtained'))['marks_obtained__avg']

    @property
    def submission_count(self):
        return self.results.filter(is_submitted=True).count()

class ExamAttachment(models.Model):

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='exam_attachments', null=True, blank=True)
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to='exams/', validators=[FileExtensionValidator(allowed_extensions=['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'txt'])])
    file_name = models.CharField(max_length=100, null=True, blank=True)
    file_size = models.IntegerField(null=True, blank=True)
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='exam_attachments')
    created_at = models.DateTimeField(auto_now_add=True)
    uploaded_at = models.DateTimeField(auto_now=True)

    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'exam_attachments'
        ordering = ['-uploaded_at']

    def save(self, *args, **kwargs):
        if self.file:
            self.file_name = os.path.basename(self.file.name)
            self.file_size = self.file.size
        if not self.school and self.exam:
            self.school = self.exam.school
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.file:
            if os.path.isfile(self.file.path):
                os.remove(self.file.path)
        super().delete(*args, **kwargs)

class ExamResult(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='exam_results', null=True, blank=True)
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='results')
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='results')
    marks_obtained = models.DecimalField(max_digits=5, decimal_places=2, validators=[MinValueValidator(0)], null=True, blank=True)
    remarks = models.TextField(null=True, blank=True)
    is_submitted = models.BooleanField(default=False)
    submitted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    graded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='results_graded')
    graded_at = models.DateTimeField(null=True, blank=True)
    is_locked = models.BooleanField(default=False, help_text=('Set to True when the Instructor submits results'
                                                                'Prevents further edits until an HOD approves a ResultEditRequest.'      
                                                            ),)          

    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'exam_results'
        unique_together = ['exam', 'student']
        indexes = [
            models.Index(fields=['school', 'is_submitted']),
            models.Index(fields=['student', 'is_submitted', 'marks_obtained']),
            models.Index(fields=['exam', 'is_submitted', 'student']),
        ]

    def save(self, *args, **kwargs):
        if not self.school and self.exam:
            self.school = self.exam.school

        if self.pk and 'update_fields' not in kwargs:
            try:
                old = ExamResult.all_objects.get(pk=self.pk)
                if old.is_locked is False and self.marks_obtained != old.marks_obtained:
                    self.is_locked = True   
            except ExamResult.DoesNotExist:
                pass

        super().save(*args, **kwargs)

    @property
    def percentage(self):
        if self.marks_obtained is not None and self.exam.total_marks > 0:
            return (float(self.marks_obtained) / self.exam.total_marks) * 100
        return 0

    @property
    def grade(self):
        pct = self.percentage
        if pct >= 91: return 'A'
        if pct >= 86: return 'A-'
        if pct >= 81: return 'B+'
        if pct >= 76: return 'B'
        if pct >= 71: return 'B-'
        if pct >= 65: return 'C+'
        if pct >= 60: return 'C'
        if pct >= 50: return 'C-'
        return 'F'
    
class Attendance(models.Model):

    STATUS_CHOICES = [('present', 'Present'), ('absent', 'Absent'), ('late', 'Late')]
    
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='attendances', null=True, blank=True)
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='attendances')
    class_obj = models.ForeignKey(Class, on_delete=models.CASCADE, related_name='attendances')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='attendances')
    date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='present')
    remarks = models.TextField(null=True, blank=True)
    marked_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='attendances_marked')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'attendance'
        ordering = ['-date', 'student__last_name']
        constraints = [models.UniqueConstraint(fields=['student', 'class_obj', 'subject', 'date'], name='unique_attendance_per_student_class_subject_date')]
        indexes = [
            models.Index(fields=['student', 'class_obj', 'date']),
            models.Index(fields=['class_obj', 'date', 'status']),
        ]

    def __str__(self):
        return f"{self.student.get_full_name()} - {self.date} - {self.status}"
    
class ExamReport(models.Model):

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='exam_reports', null=True, blank=True)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, null=True)
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='exam_reports')
    class_obj = models.ForeignKey(Class, on_delete=models.CASCADE, related_name='exam_reports')
    exams = models.ManyToManyField(Exam, related_name='reports', blank=True)
    report_date = models.DateField(default=timezone.now)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='exam_reports_created')
    created_at = models.DateField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'exam_reports'
        ordering = ['-created_at']

    @property
    def total_students(self):
        return self.class_obj.enrollments.filter(is_active=True).count()

    @property
    def average_performance(self):
        exam_ids = self.exams.values_list('id', flat=True)
        results = ExamResult.objects.filter(exam_id__in=exam_ids, is_submitted=True)
        if not results.exists():
            return 0
        return sum(r.percentage for r in results) / results.count()
    
class NoticeReadStatus(models.Model):

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='notice_read_statuses', null=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notice_read_statuses')
    notice = models.ForeignKey(Notice, on_delete=models.CASCADE, related_name='read_statuses')
    read_at = models.DateTimeField(auto_now_add=True)

    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'notice_read_statuses'
        unique_together = ['user', 'notice']

    def __str__(self):
        return f"{self.user.username} read {self.notice.title}"

class ClassNotice(models.Model):

    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]

    school = models.ForeignKey(
        School, on_delete=models.CASCADE,
        related_name='class_notices', null=True, blank=True,
    )
    class_obj = models.ForeignKey(
        Class, on_delete=models.CASCADE,
        related_name='class_notices',
    )
    subject = models.ForeignKey(
        Subject, on_delete=models.CASCADE,
        related_name='class_notices', null=True, blank=True,
    )
    title = models.CharField(max_length=200)
    content = models.TextField()
    priority = models.CharField(
        max_length=10, choices=PRIORITY_CHOICES, default='medium',
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='class_notices_created',
    )
    is_active = models.BooleanField(default=True)
    expiry_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'class_notices'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} — {self.class_obj.name}"

    def save(self, *args, **kwargs):
        if not self.school and self.class_obj:
            self.school = self.class_obj.school
        if self.expiry_date and self.expiry_date < timezone.now():
            self.is_active = False
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        if not self.expiry_date:
            return False
        return self.expiry_date < timezone.now()

class ClassNoticeReadStatus(models.Model):

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='class_notice_read_statuses', null=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='class_notice_read_statuses')
    class_notice = models.ForeignKey(ClassNotice, on_delete=models.CASCADE, related_name='read_statuses')
    read_at = models.DateTimeField(auto_now_add=True)

    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'class_notice_read_statuses'
        unique_together = ['user', 'class_notice']
    def __str__(self):
        return f"{self.user.username} read {self.class_notice.title}"

class ExamResultNotificationReadStatus(models.Model):

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='exam_result_notification_read_statuses', null=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='exam_result_notification_read_statuses')
    exam_result = models.ForeignKey(ExamResult, on_delete=models.CASCADE, related_name='notification_read_statuses')
    read_at = models.DateTimeField(auto_now_add=True)

    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'exam_result_notification_read_statuses'
        unique_together = ['user', 'exam_result']
        indexes = [models.Index(fields=['user', 'exam_result']), models.Index(fields=['read_at'])]

    def __str__(self):
        return f"{self.user.username} read result for {self.exam_result.exam.title}"

# Attendance
class AttendanceSession(models.Model):

    SESSION_TYPE_CHOICES = [('class', 'Class Session'), ('exam', 'Exam Session'), ('bedcheck', 'Bedcheck Session'), ('lab', 'Lab Session'), ('other', 'Other')]
    STATUS_CHOICES = [('scheduled', 'Scheduled'), ('active', 'Active'), ('completed', 'Completed'), ('cancelled', 'Cancelled')]
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='attendance_sessions', null=True, blank=True)
    session_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    title = models.CharField(max_length=200)
    session_type = models.CharField(max_length=20, choices=SESSION_TYPE_CHOICES, default='class')
    description = models.TextField(blank=True, null=True)
    class_obj = models.ForeignKey(Class, on_delete=models.CASCADE, related_name='attendance_sessions')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='attendance_sessions', null=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='sessions_created')
    scheduled_start = models.DateTimeField()
    scheduled_end = models.DateTimeField()
    actual_start = models.DateTimeField(null=True, blank=True)
    actual_end = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.IntegerField(validators=[MinValueValidator(1)], default=60)
    qr_refresh_interval = models.IntegerField(validators=[MinValueValidator(10), MaxValueValidator(300)], default=30)
    qr_code_secret = models.CharField(max_length=255, blank=True)
    qr_last_generated = models.DateTimeField(null=True, blank=True)
    qr_generation_count = models.IntegerField(default=0)
    enable_qr_scan = models.BooleanField(default=True)
    enable_manual_marking = models.BooleanField(default=True)
    enable_biometric = models.BooleanField(default=False)
    require_location = models.BooleanField(default=False)
    allowed_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    allowed_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    location_radius_meters = models.IntegerField(default=100, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="scheduled")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    allow_late_minutes = models.IntegerField(validators=[MinValueValidator(0)], default=10)

    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'attendance_sessions'
        ordering = ['-scheduled_start']
        indexes = [models.Index(fields=['session_id']), models.Index(fields=['class_obj', 'scheduled_start']), models.Index(fields=['status', 'scheduled_start'])]

    def save(self, *args, **kwargs):
        if not self.school and self.class_obj:
            self.school = self.class_obj.school
        super().save(*args, **kwargs)

    def generate_qr_token(self):
        current_time = timezone.now()
        time_window = int(current_time.timestamp() / self.qr_refresh_interval)
        hash_input = f"{self.session_id}:{time_window}:{self.qr_code_secret}"
        token = hashlib.sha256(hash_input.encode()).hexdigest()[:16]
        self.qr_last_generated = current_time
        self.qr_generation_count += 1
        self.save(update_fields=['qr_last_generated', 'qr_generation_count'])
        return token

    def verify_qr_token(self, token, tolerance_windows=1):
        current_time = timezone.now()
        current_window = int(current_time.timestamp() / self.qr_refresh_interval)
        for offset in range(-tolerance_windows, tolerance_windows + 1):
            time_window = current_window + offset
            hash_input = f"{self.session_id}:{time_window}:{self.qr_code_secret}"
            valid_token = hashlib.sha256(hash_input.encode()).hexdigest()[:16]
            if token == valid_token:
                return True
        return False

    def is_within_schedule(self):
        now = timezone.now()
        grace_period = timedelta(minutes=self.allow_late_minutes)
        return self.scheduled_start <= now <= (self.scheduled_end + grace_period)

    def can_mark_attendance(self):
        return self.status == 'active' and self.is_active and self.is_within_schedule()

    def get_attendance_status_for_time(self, attendance_time):
        present_cutoff = self.scheduled_start + timedelta(minutes=5)
        late_cutoff = self.scheduled_end + timedelta(minutes=self.allow_late_minutes)
        if attendance_time <= present_cutoff:
            return 'present'
        elif attendance_time <= late_cutoff:
            return 'late'
        return 'absent'

    @property
    def total_students(self):
        return Enrollment.objects.filter(class_obj=self.class_obj, is_active=True).count()

    @property
    def marked_count(self):
        return self.session_attendances.count()

    @property
    def attendance_percentage(self):
        total = self.total_students
        return round((self.marked_count / total) * 100, 2) if total > 0 else 0

    def start_session(self):
        if self.status == 'scheduled':
            self.status = 'active'
            self.actual_start = timezone.now()
            if not self.qr_code_secret:
                self.qr_code_secret = uuid.uuid4().hex
            self.save()
            return True
        return False

    def end_session(self):
        if self.status == 'active':
            self.status = 'completed'
            self.actual_end = timezone.now()
            self.save()
            return True
        return False

class SessionAttendance(models.Model):
    
    MARKING_METHOD_CHOICES = [('qr_scan', 'QR Code Scan'), ('manual', 'Manual Entry'), ('biometric', 'Biometric'), ('admin', 'Admin Override')]
    STATUS_CHOICES = [('present', 'Present'), ('late', 'Late'), ('absent', 'Absent'), ('excused', 'Excused')]
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='session_attendances', null=True, blank=True)
    session = models.ForeignKey(AttendanceSession, on_delete=models.CASCADE, related_name='session_attendances')
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='session_attendances', limit_choices_to={'role': 'student'})
    marked_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='attendances_marked_in_session')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='present')
    marking_method = models.CharField(max_length=20, choices=MARKING_METHOD_CHOICES)
    marked_at = models.DateTimeField(auto_now_add=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    location_verified = models.BooleanField(default=False)
    remarks = models.TextField(blank=True, null=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, null=True)

    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'session_attendances'
        ordering = ['-marked_at']
        unique_together = ['session', 'student']
        indexes = [models.Index(fields=['session', 'status']), models.Index(fields=['student', 'marked_at'])]

    def save(self, *args, **kwargs):
        if not self.school and self.session:
            self.school = self.session.school
        super().save(*args, **kwargs)

    @property
    def minutes_late(self):
        if self.status == 'late':
            delta = self.marked_at - self.session.scheduled_start
            return int(delta.total_seconds() / 60)
        return 0

    def verify_location(self):
        if not self.session.require_location:
            self.location_verified = True
            return True
        if not (self.latitude and self.longitude):
            return False
        from math import radians, sin, cos, sqrt, atan2
        lat1 = radians(float(self.session.allowed_latitude))
        lon1 = radians(float(self.session.allowed_longitude))
        lat2 = radians(float(self.latitude))
        lon2 = radians(float(self.longitude))
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
        c = 2 * atan2(sqrt(a), sqrt(1 - a))
        distance = 6371000 * c
        self.location_verified = distance <= self.session.location_radius_meters
        return self.location_verified

class BiometricRecord(models.Model):

    DEVICE_TYPE_CHOICES = [('zkteco', 'ZKTeco Device'), ('fingerprint', 'Fingerprint Scanner'), ('other', 'Other')]
    
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='biometric_records', null=True, blank=True)
    device_id = models.CharField(max_length=100)
    device_type = models.CharField(max_length=50, choices=DEVICE_TYPE_CHOICES, default='zkteco')
    device_name = models.CharField(max_length=200, blank=True)
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='biometric_records', limit_choices_to={'role': 'student'})
    session = models.ForeignKey(AttendanceSession, on_delete=models.CASCADE, related_name='biometric_records', null=True, blank=True)
    biometric_id = models.CharField(max_length=100)
    scan_time = models.DateTimeField()
    verification_type = models.CharField(max_length=50, blank=True)
    verification_score = models.IntegerField(null=True, blank=True)
    processed = models.BooleanField(default=False)
    processed_at = models.DateTimeField(null=True, blank=True)
    session_attendance = models.ForeignKey(SessionAttendance, on_delete=models.SET_NULL, null=True, blank=True, related_name='biometric_records')
    raw_data = models.JSONField(blank=True, null=True)
    error_message = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'biometric_records'
        ordering = ['-scan_time']
        indexes = [models.Index(fields=['device_id', 'scan_time']), models.Index(fields=['student', 'scan_time']), models.Index(fields=['processed', 'scan_time'])]

    def find_matching_session(self):
        time_window = timedelta(hours=2)
        sessions = AttendanceSession.objects.filter(
            class_obj__enrollments__student=self.student,
            class_obj__enrollments__is_active=True,
            scheduled_start__gte=self.scan_time - time_window,
            scheduled_start__lte=self.scan_time + time_window,
            status__in=['scheduled', 'active'],
            enable_biometric=True,
            is_active=True
        ).order_by('scheduled_start')
        return sessions.first()

    def process_to_attendance(self):
        if self.processed:
            return self.session_attendance
        if not self.session:
            self.session = self.find_matching_session()
            if not self.session:
                self.error_message = "No matching session found"
                self.save()
                return None
        existing = SessionAttendance.objects.filter(session=self.session, student=self.student).first()
        if existing:
            self.session_attendance = existing
            self.processed = True
            self.processed_at = timezone.now()
            self.save()
            return existing
        status = self.session.get_attendance_status_for_time(self.scan_time)
        attendance = SessionAttendance.objects.create(
            session=self.session, student=self.student, status=status,
            marking_method='biometric', marked_at=self.scan_time, remarks=f"Biometric scan via {self.device_type}"
        )
        self.session_attendance = attendance
        self.processed = True
        self.processed_at = timezone.now()
        self.save()
        return attendance

class AttendanceSessionLog(models.Model):

    ACTION_CHOICES = [
        ('session_created', 'Session Created'), ('session_started', 'Session Started'),
        ('session_ended', 'Session Ended'), ('session_cancelled', 'Session Cancelled'),
        ('qr_generated', 'QR Code Generated'), ('attendance_marked', 'Attendance Marked'),
        ('attendance_updated', 'Attendance Updated'), ('attendance_deleted', 'Attendance Deleted'),
        ('bulk_import', 'Bulk Import'), ('biometric_sync', 'Biometric Sync'),
    ]
    
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='attendance_session_logs', null=True, blank=True)
    session = models.ForeignKey(AttendanceSession, on_delete=models.CASCADE, related_name='logs')
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    performed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='session_logs')
    description = models.TextField(blank=True)
    metadata = models.JSONField(blank=True, null=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'attendance_session_logs'
        ordering = ['-timestamp']
        indexes = [models.Index(fields=['session', 'timestamp']), models.Index(fields=['action', 'timestamp'])]
            

        # personal notification 

class PersonalNotification(models.Model):

    NOTIFICATION_TYPE_CHOICES = [('exam_result', 'Exam Result'), ('general', 'General'), ('alert', 'Alert')]
    PRIORITY_CHOICES = [('low', 'Low'), ('medium', 'Medium'), ('high', 'High')]
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='personal_notifications', null=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='personal_notifications')
    notification_type = models.CharField(max_length=20, choices=NOTIFICATION_TYPE_CHOICES, default='general')
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    title = models.CharField(max_length=200)
    content = models.TextField()
    exam_result = models.ForeignKey(ExamResult, on_delete=models.CASCADE, null=True, blank=True, related_name='personal_notifications')
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='notifications_created')
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'personal_notifications'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['user', 'is_read']), models.Index(fields=['user', 'created_at']), models.Index(fields=['notification_type'])]

# certificate
class CertificateTemplate(models.Model):

    TEMPLATE_TYPE_CHOICES = [
        ('completion', 'Course Completion'),
        ('achievement', 'Achievement'),
        ('participation', 'Participation'),
        ('excellence', 'Excellence Award'),
    ]

    school = models.ForeignKey(
        School, on_delete=models.CASCADE,
        related_name='certificate_templates',
        null=True, blank=True,
    )
    name = models.CharField(max_length=200)
    template_type = models.CharField(
        max_length=20, choices=TEMPLATE_TYPE_CHOICES, default='completion'
    )
    description = models.TextField(blank=True)

    header_text = models.CharField(
        max_length=500, default='Certificate of Completion',
        help_text='Main title on the certificate',
    )
    body_template = models.TextField(
        blank=True,
        help_text=(
            'Custom body text template. Placeholders: '
            '{student_name}, {course_name}, {class_name}, '
            '{completion_date}, {grade}'
        ),
    )
    footer_text = models.CharField(
        max_length=500, blank=True,
        help_text='Footer text (e.g. accreditation information)',
    )

    use_school_branding = models.BooleanField(
        default=True,
        help_text='Use school logo and colours instead of custom ones',
    )
    custom_logo = models.ImageField(
        upload_to='certificate_logos/', null=True, blank=True,
        help_text='Override school logo for this template',
    )
    primary_color = models.CharField(max_length=7, blank=True)
    secondary_color = models.CharField(max_length=7, blank=True)
    accent_color = models.CharField(max_length=7, blank=True)

    signature_image = models.ImageField(
        upload_to='certificate_signatures/', null=True, blank=True,
    )
    signatory_name = models.CharField(max_length=200, blank=True)
    signatory_title = models.CharField(max_length=200, blank=True)

    secondary_signature_image = models.ImageField(
        upload_to='certificate_signatures/', null=True, blank=True,
    )
    secondary_signatory_name = models.CharField(max_length=200, blank=True)
    secondary_signatory_title = models.CharField(max_length=200, blank=True)

    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(
        default=False,
        help_text='Use as default template for this school',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = SimpleTenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'certificate_templates'
        ordering = ['school', 'name']
        unique_together = ['school', 'name']

    def __str__(self):
        school_label = self.school.name if self.school else 'Global'
        return f"{self.name} — {school_label}"

    def get_effective_logo(self):
        if not self.use_school_branding and self.custom_logo:
            return self.custom_logo
        if self.school and self.school.logo:
            return self.school.logo
        return None

    def get_effective_colors(self):
        if not self.use_school_branding:
            return {
                'primary_color': self.primary_color or '#1976D2',
                'secondary_color': self.secondary_color or '#424242',
                'accent_color': self.accent_color or '#FFC107',
            }
        if self.school:
            return {
                'primary_color': self.school.primary_color,
                'secondary_color': self.school.secondary_color,
                'accent_color': self.school.accent_color,
            }
        return {
            'primary_color': '#1976D2',
            'secondary_color': '#424242',
            'accent_color': '#FFC107',
        }

class Certificate(models.Model):

    STATUS_CHOICES = [
        ('issued', 'Issued'),
        ('revoked', 'Revoked'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    school = models.ForeignKey(
        School, on_delete=models.CASCADE,
        related_name='certificates',
        null=True, blank=True,
    )
    student = models.ForeignKey(
        User, on_delete=models.CASCADE,
        limit_choices_to={'role': 'student'},
        related_name='certificates',
    )
    enrollment = models.OneToOneField(
        Enrollment, on_delete=models.CASCADE,
        related_name='certificate',
    )
    class_obj = models.ForeignKey(
        Class, on_delete=models.CASCADE,
        related_name='certificates',
    )
    template = models.ForeignKey(
        CertificateTemplate, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='certificates',
    )

    certificate_number = models.CharField(max_length=100, unique=True)
    verification_code = models.CharField(
        max_length=32, unique=True, editable=False,
        help_text='Unique code for public certificate verification', default=''
    )

    student_name = models.CharField(max_length=300, default='')
    student_svc_number = models.CharField(max_length=50, blank=True, default='')
    student_rank = models.CharField(max_length=100, blank=True, default='')
    course_name = models.CharField(max_length=200, default='')
    class_name = models.CharField(max_length=200, default='')

    final_grade = models.CharField(max_length=10, blank=True)
    final_percentage = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
    )
    attendance_percentage = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
    )

    issued_by = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='certificates_issued',
    )
    issued_at = models.DateTimeField(auto_now_add=True)
    completion_date = models.DateField(
        help_text='Date the student completed the course',
        null=True, blank=True,
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default='issued',
    )
    revoked_by = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='certificates_revoked',
    )
    revocation_reason = models.TextField(blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    certificate_file = models.FileField(
        upload_to='certificates/generated/',
        null=True, blank=True,
    )
    file_generated_at = models.DateTimeField(null=True, blank=True)

    download_count = models.IntegerField(default=0)
    last_downloaded_at = models.DateTimeField(null=True, blank=True)
    view_count = models.IntegerField(default=0)
    last_viewed_at = models.DateTimeField(null=True, blank=True)

    notes = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'certificates'
        ordering = ['-issued_at']
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'enrollment'],
                name='unique_certificate_per_enrollment',
            ),
        ]
        indexes = [
            models.Index(fields=['certificate_number']),
            models.Index(fields=['verification_code']),
            models.Index(fields=['student', 'status']),
            models.Index(fields=['school', 'issued_at']),
        ]

    def __str__(self):
        return f"{self.certificate_number} — {self.student_name}"

    def save(self, *args, **kwargs):
        if not self.school and self.class_obj:
            self.school = self.class_obj.school

        if not self.certificate_number:
            self.certificate_number = self._generate_number()

        if not self.verification_code:
            self.verification_code = self._generate_verification_code()

        if not self.student_name and self.student:
            self.student_name = self.student.get_full_name()
            self.student_svc_number = self.student.svc_number or ''
            self.student_rank = (
                self.student.get_rank_display() if self.student.rank else ''
            )

        if not self.course_name and self.class_obj:
            self.course_name = self.class_obj.course.name
            self.class_name = self.class_obj.name

        super().save(*args, **kwargs)

    def _generate_number(self):
        import datetime as _dt
        year = _dt.date.today().year
        school_code = self.school.code if self.school else 'GEN'
        count = Certificate.all_objects.filter(
            school=self.school,
            issued_at__year=year,
        ).count() + 1
        return f"{school_code}/{year}/{count:04d}"

    def _generate_verification_code(self):
        data = (
            f"{self.student_id}-{self.enrollment_id}-"
            f"{timezone.now().isoformat()}-{uuid.uuid4()}"
        )
        return hashlib.sha256(data.encode()).hexdigest()[:32].upper()

    def revoke(self, user, reason=''):
        self.status = 'revoked'
        self.revoked_by = user
        self.revocation_reason = reason
        self.revoked_at = timezone.now()
        self.save(update_fields=[
            'status', 'revoked_by', 'revocation_reason', 'revoked_at', 'updated_at',
        ])

    def record_download(self):
        self.download_count += 1
        self.last_downloaded_at = timezone.now()
        self.save(update_fields=['download_count', 'last_downloaded_at'])

    def record_view(self):
        self.view_count += 1
        self.last_viewed_at = timezone.now()
        self.save(update_fields=['view_count', 'last_viewed_at'])

    @property
    def is_valid(self):
        return self.status == 'issued'

    @property
    def verification_url(self):
        return f"/api/certificates/verify/{self.verification_code}/"

class CertificateDownloadLog(models.Model):

    DOWNLOAD_TYPE_CHOICES = [
        ('pdf', 'PDF Download'),
        ('html', 'HTML Preview'),
        ('view', 'View Only'),
    ]

    school = models.ForeignKey(
        School, on_delete=models.CASCADE,
        related_name='certificate_downloads',
        null=True, blank=True,
    )
    certificate = models.ForeignKey(
        Certificate, on_delete=models.CASCADE,
        related_name='download_logs',
    )
    downloaded_by = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='certificate_downloads',
    )
    download_type = models.CharField(
        max_length=20, choices=DOWNLOAD_TYPE_CHOICES, default='pdf',
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    downloaded_at = models.DateTimeField(auto_now_add=True)

    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'certificate_download_logs'
        ordering = ['-downloaded_at']

    DOWNLOAD_TYPE_CHOICES = [
        ('pdf', 'PDF Download'),
        ('html', 'HTML Preview'),
        ('view', 'View Only'),
    ]

    school = models.ForeignKey(
        School, on_delete=models.CASCADE,
        related_name='certificate_downloads',
        null=True, blank=True,
    )
    certificate = models.ForeignKey(
        Certificate, on_delete=models.CASCADE,
        related_name='download_logs',
    )
    downloaded_by = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='certificate_downloads',
    )
    download_type = models.CharField(
        max_length=20, choices=DOWNLOAD_TYPE_CHOICES, default='pdf',
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    downloaded_at = models.DateTimeField(auto_now_add=True)

    objects = TenantAwareManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'certificate_download_logs'
        ordering = ['-downloaded_at']



 

