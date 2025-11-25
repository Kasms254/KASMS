from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator, MaxValueValidator

class User(AbstractUser):
    ROLE_CHOICES = [
        ('admin', 'admin'),
        ('instructor', 'instructor'),
        ('student', 'student'),
        ('commandant', 'commandant'),
    ]
    RANK_CHOICES = [
        ('private', 'Private'),
        ('lance_corporal', 'Lance Corporal'),
        ('corporal', 'Corporal'),
        ('sergeant', 'Sergeant'),
        ('seniorsergeant', 'Senior Sergeant'),
        ('warrant_officer', 'Warrant Officer II'),
        ('warrant_officer', 'Warrant Officer I'),
        ('lieutenant', 'Lieutenant'),
        ('captain', 'Captain'),
        ('major', 'Major'),
        ('lieutenant colonel', 'Lieutenant Colonel'),
        ('general', 'General'),
    ]

    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES)
    rank = models.CharField(
        max_length=20,
        choices=RANK_CHOICES,
        null=True,
        blank=True
    )
    phone_number = models.CharField(max_length=20)
    svc_number = models.CharField(max_length=50, unique=True)
    email = models.CharField(max_length=25)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"
    

class Course(models.Model):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, unique=True)
    description = models.TextField()
  
    level = models.CharField(max_length=50, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'courses'
        verbose_name = 'Course'
        verbose_name_plural = 'Courses'

    def __str__(self):
        return f"{self.name} ({self.code})"

class Class(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='classes')
    name = models.CharField(max_length=100)
    instructor = models.ForeignKey(User, on_delete=models.CASCADE, limit_choices_to={'role': 'instructor'}, related_name='instructed_classes')
    start_date = models.DateField()
    end_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    capacity = models.IntegerField(validators=[MinValueValidator(1)], default=30)
    is_active = models.BooleanField(default=True)
    class Meta:
        db_table = 'classes'
        verbose_name = 'Class'
        verbose_name_plural = 'Classes'
        ordering = ['course', 'name']
    

    def __str__(self):
        return f"{self.course.name} - {self.instructor.username}"
    
    @property
    def current_enrollment(self):
        return self.enrollments.filter(is_active=True).count()
    
    @property
    def enrollment_status(self):
        return f"{self.current_enrollment} / {self.capacity}" 
    
class Subject(models.Model):
    class_obj = models.ForeignKey(Class, on_delete=models.CASCADE, related_name='subjects')
    name = models.CharField(max_length=100)
    subject_code = models.CharField(max_length=20, unique=True,null=True, blank=True)
    description = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    instructor = models.ForeignKey(User, on_delete=models.CASCADE, limit_choices_to={'role': 'instructor'}, related_name='subjects')

    class Meta:
        db_table = 'subjects'
        verbose_name = 'Subject'
        verbose_name_plural = 'Subjects'
        ordering = ['class_obj', 'name']

    def __str__(self):
        return f"{self.name} ({self.class_obj.name})"
    
class Notice(models.Model):
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),   
        ('urgent', 'Urgent'),
    ]

    priority= models.CharField(
        max_length=10,
        choices=PRIORITY_CHOICES,
        default='medium'
    )
    title = models.CharField(max_length=200)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    expiry_date = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='notices_created')

    class Meta:
        db_table = 'notices'
        verbose_name = 'Notice'
        verbose_name_plural = 'Notices'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} ({self.get_priority_display()})"
    
class Enrollment(models.Model):
    student = models.ForeignKey(User, on_delete=models.CASCADE, limit_choices_to={'role': 'student'}, related_name='enrollments')
    class_obj = models.ForeignKey(Class, on_delete=models.CASCADE, related_name='enrollments')
    enrolled_by= models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='enrollments_processed')
    enrollment_date = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    completion_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'enrollments'
        verbose_name = 'Enrollment'
        verbose_name_plural = 'Enrollments'
        ordering = ['-enrollment_date']

    def __str__(self):
        return f"{self.student.username} enrolled in {self.class_obj.course.name}"