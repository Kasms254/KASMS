from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from django.core.validators import FileExtensionValidator
import os

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



# instructor
class Exam(models.Model):
    EXAM_TYPE_CHOICES = [
        ('cat', 'CAT'),
        ('final', 'Final'),
        ('project', 'Project'),
    ]

    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='exams')
    title = models.CharField(max_length=200)
    exam_type = models.CharField(max_length=20, choices=EXAM_TYPE_CHOICES, default='cat')
    description = models.TextField(blank=True, null=True)
    total_marks = models.IntegerField(validators=[MinValueValidator(1)], default=100)
    exam_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    created_by =  models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='exams_created')
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    exam_duration = models.DurationField(null=True, blank=True)

    class Meta:
        db_table = 'exams'
        ordering = ['created_at']
        unique_together = ['subject', 'exam_date']

    def __str__(self):
        return f"{self.title} -{self.subject.name}" 

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
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(
        upload_to='exams/', 
        validators=[
            FileExtensionValidator(
                allowed_extensions = ['pdf', 'doc', 'docx', 'jpg','jpeg','png', 'txt']
            )
        ]        
                            )
    file_name = models.CharField(max_length=100, null=True, blank=True)
    file_size = models.IntegerField(help_text="File size in bytes", null=True, blank=True)
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='exam_attachments')
    created_at = models.DateTimeField(auto_now_add=True)
    uploaded_at = models.DateTimeField(auto_now=True)


    class Meta:
        db_table = 'exam_attachments'
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"{self.file_name} - {self.exam.title}"

    def save(self, *args, **kwargs):
        if self.file:
            self.file_name = os.path.basename(self.file.name)
            self.file_size = self.file.size
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.file:
            if os.path.isfile(self.file.path):
                os.remove(self.file.path)
        super().delete(*args, **kwargs)

class ExamResult(models.Model):
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='results')
    student = models.ForeignKey('User', on_delete=models.CASCADE, related_name='results')

    marks_obtained = models.DecimalField(
        max_digits =5,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        null=True,
        blank=True
    )
    remarks = models.TextField(null=True, blank=True)
    is_submitted = models.BooleanField(default=False)
    submitted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    graded_by = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='results_graded')

    class Meta:
        db_table = 'exam_results'
        unique_together = ['exam', 'student']
    
    def __str__(self):
        return f"{self.student.get_full_name()} - {self.exam.title}"
    

    @property
    def percentage(self):
        if self.marks_obtained is not None and self.exam.total_marks > 0:
            return (float(self.marks_obtained) / self.exam.total_marks) * 100
        return 0

    @property
    def grade(self):
        
        pct = self.percentage
        if pct >= 80:
            return 'A'
        if pct >= 70:
            return 'B'
        if pct >= 60:
            return 'C'
        if pct >= 50:
            return 'D'
        return 'F'
    
class Attendance(models.Model):
    STATUS_CHOICES = [
       ('present', 'Present'),
        ('absent', 'Absent'),
        ('late', 'Late'),
    ]

    student = models.ForeignKey('User', on_delete=models.CASCADE, related_name='attendances')
    class_obj = models.ForeignKey('Class', on_delete=models.CASCADE, related_name='attendances')
    subject =models.ForeignKey('Subject', on_delete=models.CASCADE, related_name='attendances')
    date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='present')
    remarks = models.TextField(null=True, blank=True)
    marked_by = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='attendances_marked')
    created_by = models.DateTimeField(auto_now_add=True)
    updated_at =models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'attendance'
        ordering = ['-class_obj', 'student__last_name']
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'class_obj', 'subject', 'date'],
                name='unique_attendance_per_student_class_subject_date',
            ),
        ]

    def __str__(self):
        return f"{self.student.get_full_name()} - {self.date} - {self.status}"
    
class ClassNotice(models.Model):
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
    ]

    class_obj = models.ForeignKey('Class', on_delete=models.CASCADE, related_name='class_notices')
    subject = models.ForeignKey('Subject', on_delete=models.CASCADE, related_name='class_notices', null=True, blank=True)
    title = models.CharField(max_length=50)
    content = models.TextField()
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    created_by = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='class_notices_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    expiry_date = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'class_notices'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} - {self.class_obj.name}"

class ExamReport(models.Model):

    title = models.CharField(max_length=50)
    description = models.TextField(blank=True, null=True)
    subject = models.ForeignKey('Subject', on_delete=models.CASCADE, related_name='exam_reports')
    class_obj = models.ForeignKey('Class', on_delete=models.CASCADE, related_name='exam_reports')
    exams = models.ManyToManyField('Exam', related_name='exam_reports')
    report_date = models.DateField()
    created_by = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='exam_reports_created')
    created_at = models.DateField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    report_date = models.DateField(default=timezone.now)

    class Meta:
        db_table = 'exam_reports'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} - {self.class_obj.name}"

    @property
    def total_students(self):
        return self.class_obj.enrollments.filter(is_active=True).count()
    
    @property
    def average_performance(self):
        exam_ids = self.exams.values_list('id', flat=True)
        results = ExamResult.objects.filter(exam_id__in=exam_ids, is_submitted=True)
        if not results.exists():
            return 0
        
        total_percentage = 0
        count = 0
        for result in results:
            total_percentage += result.percentage
            count += 1

        return total_percentage / count if count > 0 else 0
    

class NoticeReadStatus(models.Model):
    user = models.ForeignKey('User', on_delete=models.CASCADE, related_name='notice_read_statuses')
    notice = models.ForeignKey('Notice', on_delete=models.CASCADE, related_name='read_statuses')
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'notice_read_statuses'
        unique_together = ['user', 'notice']
        ordering  =['-read_at']

        def __str__(self):
            return f"{self.user.username} read {self.notice.title}"


class ClassNoticeReadStatus(models.Model):
    user = models.ForeignKey('User', on_delete=models.CASCADE, related_name='class_notice_read_statuses')
    class_notice = models.ForeignKey('ClassNotice', on_delete=models.CASCADE, related_name='read_statuses')
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'class_notice_read_statuses'
        unique_together = ['user', 'class_notice']
        ordering = ['-read_at']


    def __str__(self):
        return f"{self.user.username} read {self.class_notice.title}"

        


