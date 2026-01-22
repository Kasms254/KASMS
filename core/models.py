from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from django.core.validators import FileExtensionValidator
import os
import uuid
import hashlib
from datetime import timedelta

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
    graded_at = models.DateTimeField(null=True, blank=True)

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

class ExamResultNotificationReadStatus(models.Model):
    user  = models.ForeignKey('User',on_delete=models.CASCADE, related_name='exam_result_notification_read_statuses')
    exam_result = models.ForeignKey('ExamResult', on_delete=models.CASCADE, related_name='notification_read_statuses')
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'exam_result_notification_read_statuses'
        unique_together = ['user', 'exam_result']
        ordering = ['-read_at']
        indexes= [
            models.Index(fields =['user', 'exam_result']),
            models.Index(fields=['read_at']),

        ]

    def __str__(self):
        return f"{self.user.username} read result for {self.exam_result.exam.title}"
# Attendance

class AttendanceSession(models.Model):
    SESSION_TYPE_CHOICES = [
        ('class', 'Class Session'),
        ('exam', 'Exam Session'),
        ('bedcheck', 'Bedcheck Session'),
        ('lab', 'Lab Session'),
        ('other', 'Other'),
    ]
    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    session_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    title = models.CharField(max_length=200)
    session_type = models.CharField(max_length=20, choices=SESSION_TYPE_CHOICES, default='class')
    description = models.TextField(blank=True, null=True)
    class_obj = models.ForeignKey('Class', on_delete=models.CASCADE, related_name='attendance_sessions')
    subject = models.ForeignKey('Subject', on_delete=models.CASCADE, related_name='attendance_sessions', null=True, blank=True)
    created_by = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, related_name='sessions_created')
    scheduled_start = models.DateTimeField()
    scheduled_end = models.DateTimeField()
    actual_start = models.DateTimeField(null=True, blank=True)
    actual_end = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.IntegerField(validators=[MinValueValidator(1)], default=60)
    qr_refresh_interval = models.IntegerField(
        validators=[MinValueValidator(10), MaxValueValidator(300)],
        default=300,
        help_text="Minutes after start time to still mark as present"
    )
    qr_code_secret = models.CharField(max_length=255, blank=True)
    qr_last_generated = models.DateTimeField(null=True, blank=True)
    qr_generation_count  = models.IntegerField(default=0)
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
    updated_at = models.DateTimeField(auto_now = True)
    allow_late_minutes = models.IntegerField(
        validators=[MinValueValidator(0)],
        default=10,
        help_text="Minutes after start time to still mark as present"
)
    class Meta:
        db_table = 'attendance_sessions'
        verbose_name = 'Attendance Session'
        verbose_name_plural = 'Attendance Sessions'
        ordering = ['-scheduled_start']
        indexes = [
            models.Index(fields=['session_id']),
            models.Index(fields=['class_obj', 'scheduled_start']),
            models.Index(fields=['status', 'scheduled_start']),
        ]

    def __str__(self):
        return f"{self.title} - {self.get_session_type_display()} ({self.scheduled_start.date()})"


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
        grace_period = timedelta(minutes = self.allow_late_minutes)
        
        start = self.scheduled_start
        end= self.scheduled_end

        end_with_grace = end + grace_period

        return start <= now <= end_with_grace



    def can_mark_attendance(self):
        return (
            self.status == 'active' and
            self.is_active and
            self.is_within_schedule()
        )

    def get_attendance_status_for_time(self, attendance_time):

        present_grace  =5

        present_cutoff = self.scheduled_start + timedelta(minutes=present_grace)
        late_cutoff = self.scheduled_end + timedelta(minutes=self.allow_late_minutes)

        if attendance_time <= present_cutoff:
            return 'present'
        elif attendance_time <= late_cutoff:
            return 'late'
        else:
            return 'absent'



    @property
    def total_students(self):
        from .models import Enrollment
        return Enrollment.objects.filter(
            class_obj=self.class_obj,
            is_active=True
        ).count()

    # @property
    # def marked_count(self):
    #     return self.session_attendances.count()

    @property
    def attendance_percentage(self):
        total  =self.total_students
        if total == 0:
            return 0
        return round ((self.marked_count / total) * 100, 2)

    def start_session(self):

        if self.status ==  'scheduled':
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
    
    MARKING_METHOD_CHOICES = [
        ('qr_scan', 'QR Code Scan'),
        ('manual', 'Manual Entry'),
        ('biometric', 'Biometric'),
        ('admin', 'Admin Override'),
    ]

    STATUS_CHOICES = [
        ('present', 'Present'),
        ('late', 'Late'),
        ('absent', 'Absent'),
        ('excused', 'Excused'),
    ]

    session = models.ForeignKey(
        'AttendanceSession', on_delete=models.CASCADE, related_name='session_attendances'
    )
    student = models.ForeignKey(
    'User',
    on_delete=models.CASCADE,
    related_name='session_attendances',
    limit_choices_to={'role': 'student'}
    )

    marked_by = models.ForeignKey(
        'User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='attendances_marked_in_session'
    )

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='present')
    marking_method = models.CharField(max_length=20, choices=MARKING_METHOD_CHOICES)
    marked_at = models.DateTimeField(auto_now_add=True)

    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    location_verified = models.BooleanField(default=False)

    remarks = models.TextField(blank=True, null=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, null=True)

    class Meta:
        db_table = 'session_attendances'
        verbose_name = 'Session Attendance'
        verbose_name_plural = 'Session Attendances'
        ordering = ['-marked_at']
        unique_together = ['session', 'student']
        indexes = [
            models.Index(fields=['session', 'status']),
            models.Index(fields=['student', 'marked_at']),
        ]

    def __str__(self):
        
        return f"{self.student.get_full_name()} - {self.session.title} ({self.get_status_display()})"

    @property
    def minutes_late(self):

        if self.status == 'late':
            delta = self.marked_at - self.session.scheduled_start
            return (delta.total_seconds() / 60)
        return 0


    def verify_location(self):
        if not self.session.require_location:
            self.location_verified = True
            return True

        
        if not (self.latitude and self.longitude):
            return False


        from math import radians, sin, cos, sqrt, atan2

        lat1 = radians(float(self.session.allowed_latitude))
        lon1 =radians(float(self.session.allowed_longitude))
        lat2 = radians(float(self.latitude))
        lon2 = radians(float(self.longitude))

        dlat = lat2 - lat1
        dlon = lon2 - lon1

        a = sin(dflat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2

        c = 2* atan2(sqrt(a), sqrt(1-a))

        distance = 6371000 * c

        self.location_verified = distance <= self.session.location_radius_meters
        return self.location_verified

class BiometricRecord(models.Model):

    DEVICE_TYPE_CHOICES = [
        ('zkteco', 'ZKTeco Device'),
        ('fingerprint', 'Fingerprint Scanner'),
        ('other', 'Other'),
    ]

    device_id = models.CharField(max_length=100)
    device_type = models.CharField(max_length=50, choices=DEVICE_TYPE_CHOICES, default='zkteco')
    device_name = models.CharField(max_length=200, blank=True)

    student = models.ForeignKey(
        'User',
        on_delete=models.CASCADE,
        related_name='biometric_records',
        limit_choices_to={'role': 'student'}
    )
    session = models.ForeignKey(
        AttendanceSession, 
        on_delete=models.CASCADE,
        related_name='biometric_records',
        null=True,
        blank=True
    )

    biometric_id = models.CharField(max_length=100, help_text='Student ID in biometric device')
    scan_time = models.DateTimeField()
    verification_type = models.CharField(max_length=50, blank=True)
    verification_score = models.IntegerField(null=True, blank=True)

    processed = models.BooleanField(default=False)
    processed_at = models.DateTimeField(null=True, blank=True)
    session_attendance = models.ForeignKey(
        SessionAttendance,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='biometric_records'
    )

    raw_data = models.JSONField(blank=True, null=True, help_text = "Raw data from device")
    error_message = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:

        db_table = 'biometric_records'
        verbose_name = 'Biometric Record'
        verbose_name_plural = 'Biometric Records'
        ordering = ['-scan_time']
        indexes = [
            models.Index(fields=['device_id', 'scan_time']),
            models.Index(fields=['student', 'scan_time']),
            models.Index(fields=['processed', 'scan_time']),
        ]

    def __str__(self):
        return f"{self.student.get_full_name()} - {self.device_type} ({self.scan_time})"

        
    def find_matching_session(self):
            
        time_window = timedelta(hours=2)

        sessions = AttendanceSession.objects.filter(
                class_obj__enrollments__student = self.student,
                class_obj__enrollments__is_active = True,
                scheduled_start__gte = self.scan_time - time_window,
                scheduled_start__lte = self.scan_time + time_window,
                status__in = ['scheduled', 'active'],
                enable_biometric= True,
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

            existing = SessionAttendance.objects.filter(
                session= self.session,
                student = self.student
            ).first()

            if existing:
                self.session_attendance = existing
                self.processed = True
                self.processed_at = timezone.now()
                self.save()
                return existing

            status = self.session.get_attendance_status_for_time(self.scan_time)

            attendance = SessionAttendance.objects.create(
                session=self.session,
                student = self.student,
                status=status,
                marking_method='biometric',
                marked_at=self.scan_time,
                remarks=f"Biometric scan via {self.device_type}"
            )

            self.session_attendance = attendance
            self.processed = True
            self.processed_at = timezone.now()
            self.save()

            return attendance

class AttendanceSessionLog(models.Model):

    ACTION_CHOICES =[
        ('session_created', 'Session Created'),
        ('session_started', 'Session Started'),
        ('session_ended', 'Session Ended'),
        ('session_cancelled', 'Session Cancelled'),
        ('qr_generated', 'QR Code Generated'),
        ('attendance_marked', 'Attendance Marked'),
        ('attendance_updated', 'Attendance Updated'),
        ('attendance_deleted', 'Attendance Deleted'),
        ('bulk_import', 'Bulk Import'),
        ('biometric_sync', 'Biometric Sync'),
    ]

    session = models.ForeignKey(
        AttendanceSession,
        on_delete=models.CASCADE,
        related_name='logs'
    )
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    performed_by = models.ForeignKey(
        'User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name = 'session_logs'
    )
    description = models.TextField(blank=True)
    metadata = models.JSONField(blank=True, null=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'attendance_session_logs'
        verbose_name = 'Session Log'
        verbose_name_plural = 'Session Logs'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['session', 'timestamp']),
            models.Index(fields=['action', 'timestamp']),
        ]

    def __str__(self):
        return f"{self.get_action_display()}- {self.session.title} ({self.timestamp})"
            

        # personal notification 

class PersonalNotification(models.Model):
    NOTIFICATION_TYPE_CHOICES = [
        ('exam_result', 'Exam Result'),
        ('general', 'General'),
        ('alert', 'Alert'),
    ]
    PRIORITY_CHOICES  =[
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
    ]

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

    class Meta:
        db_table = 'personal_notifications'
        verbose_name = 'Personal Notification'
        verbose_name_plural = 'Personal Notifications'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'is_read']),
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['notification_type']),
        ]

    def __str__(self):
        return f"{self.title} - {self.user.username}"

