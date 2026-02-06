from rest_framework import serializers
from .models import (
    AttendanceSession, User, Course, Class, Enrollment, Subject, Notice, Exam, ExamReport, PersonalNotification,
    Attendance, ExamResult, ClassNotice, ExamAttachment, NoticeReadStatus, ClassNoticeReadStatus, BiometricRecord, 
    SessionAttendance, AttendanceSessionLog, ExamResultNotificationReadStatus, SchoolAdmin, School, Certificate, CertificateDownloadLog
)
from django.contrib.auth.password_validation import validate_password
import uuid
from django.utils import timezone
from django.db import transaction
from django.core.exceptions import ValidationError as DjangoValidationError
import logging
from pathlib import Path
import os
from decimal import Decimal
from dateutil import parser
from core.services import certificate_service

logger = logging.getLogger(__name__)

MAX_LOGO_SIZE = 5 * 1024 * 1024  
ALLOWED_LOGO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']
ALLOWED_LOGO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']

LOGO_UPLOAD_DIR = 'school_logos'


def validate_logo_file(file):
    errors = []
    
    if file.size > MAX_LOGO_SIZE:
        max_mb = MAX_LOGO_SIZE / (1024 * 1024)
        file_mb = file.size / (1024 * 1024)
        errors.append(
            f'File size ({file_mb:.2f}MB) exceeds maximum ({max_mb:.2f}MB).'
        )
    
    ext = Path(file.name).suffix.lower().lstrip('.')
    if ext not in ALLOWED_LOGO_EXTENSIONS:
        errors.append(
            f'Extension ".{ext}" not allowed. Use: {", ".join(ALLOWED_LOGO_EXTENSIONS)}'
        )
    
    content_type = getattr(file, 'content_type', None)
    if content_type and content_type not in ALLOWED_LOGO_MIME_TYPES:
        errors.append(f'File type "{content_type}" not allowed.')
    
    try:
        file.seek(0)
        header = file.read(32)
        file.seek(0)
        
        valid_signatures = [
            b'\xff\xd8\xff',      # JPEG
            b'\x89PNG\r\n\x1a\n', # PNG
            b'GIF87a',            # GIF
            b'GIF89a',            # GIF
            b'RIFF',              # WebP
            b'<?xml',             # SVG
            b'<svg',              # SVG
        ]
        
        is_valid = any(header.startswith(sig) for sig in valid_signatures)
        
        if header.startswith(b'RIFF') and b'WEBP' not in header[:16]:
            is_valid = False
            
        if not is_valid and ext not in ['svg']:
            errors.append('File does not appear to be a valid image.')
            
    except Exception as e:
        logger.warning(f"Error reading file header: {e}")
    
    if errors:
        raise DjangoValidationError(errors)
    
    return True


def generate_logo_filename(school_code, original_filename):
    ext = Path(original_filename).suffix.lower()
    unique_id = uuid.uuid4().hex[:12]
    filename = f"{school_code.lower()}_{unique_id}{ext}"
    return os.path.join(LOGO_UPLOAD_DIR, school_code.lower(), filename)


def delete_old_logo(logo_field):
    if logo_field and logo_field.name:
        try:
            if default_storage.exists(logo_field.name):
                default_storage.delete(logo_field.name)
                logger.info(f"Deleted old logo: {logo_field.name}")
        except Exception as e:
            logger.warning(f"Failed to delete old logo: {e}")


class SchoolUploadSerializer(serializers.Serializer):
    logo = serializers.ImageField(
        required=True,
        help_text="Logo image (max 2MB, formats: jpg, png, gif, webp, svg)"
    )

    def validate_logo(self, value):
        validate_logo_file(value)
        return value

class SchoolThemeSerializer(serializers.Serializer):
    primary_color = serializers.CharField()
    secondary_color = serializers.CharField()
    accent_color = serializers.CharField()
    logo_url = serializers.URLField(allow_null=True)


class SchoolSerializer(serializers.ModelSerializer):
    theme = serializers.SerializerMethodField(read_only=True)
    current_student_count = serializers.IntegerField(read_only=True)
    current_instructor_count = serializers.IntegerField(read_only=True)
    is_within_limits = serializers.BooleanField(read_only=True)
    admin_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = School
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_theme(self, obj):
        return obj.get_theme

    def get_admin_count(self, obj):
        return obj.school_admins.count()

    def validate_code(self, value):
        value = value.upper()
        if self.instance:
            if School.objects.exclude(pk=self.instance.pk).filter(code=value).exists():
                raise serializers.ValidationError("This school code is already in use.")
        else:
            if School.objects.filter(code=value).exists():
                raise serializers.ValidationError("This school code is already in use.")
        return value

    def validate_email(self, value):
        if self.instance:
            if School.objects.exclude(pk=self.instance.pk).filter(email=value).exists():
                raise serializers.ValidationError("This email is already in use.")
        else:
            if School.objects.filter(email=value).exists():
                raise serializers.ValidationError("This email is already in use.")
        return value


class SchoolListSerializer(serializers.ModelSerializer):
    current_student_count = serializers.IntegerField(read_only=True)
    current_instructor_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = School
        fields = '__all__'


class SchoolAdminSerializer(serializers.ModelSerializer):
    school_name = serializers.CharField(source='school.name', read_only=True)
    school_code = serializers.CharField(source='school.code', read_only=True)
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)

    class Meta:
        model = SchoolAdmin
        fields = '__all__' 
        read_only_fields = ['id', 'created_at']

    def validate(self, attrs):
        school = attrs.get('school')
        user = attrs.get('user')

        if user and user.role != 'admin':
            raise serializers.ValidationError({
                'user': 'User must have admin role to be a school admin.'
            })

        if user and school and user.school != school:
            raise serializers.ValidationError({
                'user': 'User must belong to the same school.'
            })

        return attrs


class SchoolCreateWithAdminSerializer(serializers.Serializer):

    school_code = serializers.CharField(max_length=20)
    school_name = serializers.CharField(max_length=200)
    school_short_name = serializers.CharField(max_length=50, required=False, allow_blank=True)
    school_email = serializers.EmailField()
    school_phone = serializers.CharField(max_length=20)
    school_address = serializers.CharField()
    school_city = serializers.CharField(max_length=100)
    
    primary_color = serializers.CharField(max_length=7, default='#1976D2')
    secondary_color = serializers.CharField(max_length=7, default='#424242')
    accent_color = serializers.CharField(max_length=7, default='#FFC107')

    max_students = serializers.IntegerField(default=5000)
    max_instructors = serializers.IntegerField(default=500)

    admin_username = serializers.CharField(max_length=150)  
    admin_email = serializers.EmailField()
    admin_first_name = serializers.CharField(max_length=150)
    admin_last_name = serializers.CharField(max_length=150)
    admin_phone = serializers.CharField(max_length=20)
    admin_svc_number = serializers.CharField(max_length=50)
    admin_password = serializers.CharField(
        write_only=True,
        validators=[validate_password],
        style={'input_type': 'password'}
    )
    admin_password2 = serializers.CharField(
        write_only=True,
        style={'input_type': 'password'}
    )

    def validate_school_code(self, value):
        value = value.upper()
        if School.objects.filter(code=value).exists():
            raise serializers.ValidationError("This school code is already in use.")
        return value

    def validate_school_email(self, value):
        if School.objects.filter(email=value).exists():
            raise serializers.ValidationError("This email is already in use.")
        return value

    def validate_admin_svc_number(self, value):
        if User.all_objects.filter(svc_number=value).exists():
            raise serializers.ValidationError("This service number is already in use.")
        return value

    def validate_admin_username(self, value):
        if User.all_objects.filter(username=value).exists():
            raise serializers.ValidationError("This username is already in use.")
        return value

    def validate(self, attrs):
        if attrs['admin_password'] != attrs['admin_password2']:
            raise serializers.ValidationError({
                'admin_password': 'Password fields did not match.'
            })
        return attrs

    def create(self, validated_data):
        with transaction.atomic():
            school = School.objects.create(
                code=validated_data['school_code'].upper(),
                name=validated_data['school_name'],
                short_name=validated_data.get('school_short_name', ''),
                email=validated_data['school_email'],
                phone=validated_data['school_phone'],
                address=validated_data['school_address'],
                city=validated_data['school_city'],
                primary_color=validated_data['primary_color'],
                secondary_color=validated_data['secondary_color'],
                accent_color=validated_data['accent_color'],
                max_students=validated_data['max_students'],
                max_instructors=validated_data['max_instructors'],
                is_active=True
            )

            admin_user = User.all_objects.create(
                school=school,
                username=validated_data['admin_username'],
                email=validated_data['admin_email'],
                first_name=validated_data['admin_first_name'],
                last_name=validated_data['admin_last_name'],
                phone_number=validated_data['admin_phone'],
                svc_number=validated_data['admin_svc_number'],
                role='admin',
                is_active=True
            )
            admin_user.set_password(validated_data['admin_password'])
            admin_user.save()

            SchoolAdmin.objects.create(
                school=school,
                user=admin_user,
                is_primary=True
            )

            return {
                'school': school,
                'admin_user': admin_user
            }


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True, 
        required=True, 
        validators=[validate_password],
        style={'input_type': 'password'}
    )
    password2 = serializers.CharField(
        write_only=True, 
        required=True, 
        label='Confirm password',
        style={'input_type': 'password'}
    )
    full_name = serializers.SerializerMethodField(read_only=True)
    
    class_obj = serializers.PrimaryKeyRelatedField(
        queryset=Class.objects.filter(is_active=True),
        required=False,
        write_only=True,
        allow_null=True,
        help_text="Required if role is 'student'"
    )
    class_name = serializers.CharField(source='class_obj.name', read_only=True)

    class Meta:
        model = User
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')
        extra_kwargs = {
            'email': {'required': True},
            'svc_number': {'required': True},
            'first_name': {'required': True},
            'last_name': {'required': True},
        }
        
    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}"
    
    def validate(self, attrs):
        if attrs.get('password') != attrs.get('password2'):
            raise serializers.ValidationError({"password": "Password fields didn't match."})

        role = attrs.get('role')
        class_obj = attrs.get('class_obj')

        if role == 'student' and class_obj:
            if class_obj.current_enrollment >= class_obj.capacity:
                raise serializers.ValidationError({
                    "class_obj": f"Class '{class_obj.name}' is at full capacity."
                })
            
        return attrs
    
    def validate_email(self, value):
        request = self.context.get('request')
        school = getattr(request, 'school', None) if request else None
        
        if self.instance:
            qs = User.objects.exclude(pk=self.instance.pk).filter(email=value)
        else:
            qs = User.objects.filter(email=value)
        
        if school:
            qs = qs.filter(school=school)
        
        if qs.exists():
            raise serializers.ValidationError("This email is already in use.")
        return value
    
    def validate_svc_number(self, value):

        request = self.context.get('request')
        school = getattr(request, 'school', None) if request else None
        role = self.initial_data.get('role')
        
        existing_user = User.all_objects.filter(svc_number=value).first()
        
        if existing_user and (not self.instance or self.instance.pk != existing_user.pk):
            if role == 'student':
                active_enrollment = Enrollment.all_objects.filter(
                    student=existing_user,
                    is_active=True
                ).select_related('school').first()
                
                if active_enrollment and active_enrollment.school != school:
                    raise serializers.ValidationError(
                        f"This service number has an active enrollment in {active_enrollment.school.name}. "
                        "They must complete or withdraw from that enrollment first."
                    )
            else:
                raise serializers.ValidationError("This service number is already in use.")
        
        return value
    
    def create(self, validated_data):
        class_obj = validated_data.pop('class_obj', None)
        validated_data.pop('password2')
        password = validated_data.pop('password')

        user = User.objects.create(**validated_data)
        user.set_password(password)
        user.save()

        if user.role == 'student' and class_obj:
            enrolled_by = self.context.get('request').user if self.context.get('request') else None
            school = getattr(self.context.get('request'), 'school', None) if self.context.get('request') else class_obj.school

            if not Enrollment.objects.filter(student=user, class_obj=class_obj).exists():
                Enrollment.objects.create(
                    school=school,
                    student=user,
                    class_obj=class_obj,
                    enrolled_by=enrolled_by,
                    is_active=True
                )
        return user

    def update(self, instance, validated_data):
        validated_data.pop('password', None)
        validated_data.pop('password2', None)
        validated_data.pop('class_obj', None)
        return super().update(instance, validated_data)


class UserListSerializer(serializers.ModelSerializer):
    school_name = serializers.CharField(source='school.name', read_only=True)
    school_code = serializers.CharField(source='school.code', read_only=True)
    school_theme = serializers.SerializerMethodField(read_only=True)
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    full_name = serializers.SerializerMethodField()
    class_name = serializers.SerializerMethodField()
    has_active_enrollment = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        exclude = ['password']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}"
    
    def get_class_name(self, obj):
        if obj.role == 'student':
            enrollment = Enrollment.all_objects.filter(
                student=obj,
                is_active=True
            ).select_related('class_obj').first()
            if enrollment and enrollment.class_obj:
                return enrollment.class_obj.name
        return None
        
    def get_school_theme(self, obj):
        if obj.school:
            return obj.school.get_theme
        return None

    def get_has_active_enrollment(self, obj):
        if obj.role != 'student':
            return None
        return Enrollment.all_objects.filter(
            student=obj,
            is_active=True
        ).exists()


class ClassSerializer(serializers.ModelSerializer):
    course_name = serializers.CharField(source='course.name', read_only=True)
    course_code = serializers.CharField(source='course.code', read_only=True)
    instructor_name = serializers.SerializerMethodField(read_only=True)
    current_enrollment = serializers.IntegerField(read_only=True)
    enrollment_status = serializers.CharField(read_only=True)
    subjects_count = serializers.IntegerField(source='subjects.count', read_only=True)

    class Meta:
        model = Class
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'current_enrollment')

    def get_instructor_name(self, obj):
        return obj.instructor.get_full_name() if obj.instructor else "Not Assigned"
    
    def validate(self, attrs):
        start_date = attrs.get('start_date', self.instance.start_date if self.instance else None)
        end_date = attrs.get('end_date', self.instance.end_date if self.instance else None)
        instructor = attrs.get('instructor', self.instance.instructor if self.instance else None)

        if end_date and start_date and end_date <= start_date:
            raise serializers.ValidationError({
                "end_date": "End date cannot be earlier than start date."
            })
        
        if instructor and instructor.role != 'instructor':
            raise serializers.ValidationError({
                "instructor": "Assigned instructor must have the role of 'instructor'."
            })

        return attrs


class ClassListSerializer(serializers.ModelSerializer):
    
    course_name = serializers.CharField(source='course.name', read_only=True)
    instructor_name = serializers.SerializerMethodField(read_only=True)
    current_enrollment = serializers.IntegerField(read_only=True)
    enrollment_status = serializers.CharField(read_only=True)

    class Meta:
        model = Class
        fields = ['id', 'name', 'course', 'course_name', 'instructor', 'instructor_name', 
                  'start_date', 'end_date', 'capacity', 'current_enrollment', 'enrollment_status', 'is_active']

    def get_instructor_name(self, obj):
        return obj.instructor.get_full_name() if obj.instructor else "Not Assigned"


class CourseSerializer(serializers.ModelSerializer):
    total_classes = serializers.IntegerField(source='classes.count', read_only=True)

    class Meta:
        model = Course
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'total_classes')
    
    def validate_code(self, value):
        request = self.context.get('request')
        school = getattr(request, 'school', None) if request else None
        
        qs = Course.objects.filter(code=value)
        if school:
            qs = qs.filter(school=school)
        
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        
        if qs.exists():
            raise serializers.ValidationError("This course code is already in use.")
        return value


class SubjectSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source='class_obj.name', read_only=True)
    instructor_name = serializers.SerializerMethodField(read_only=True)
    instructor_svc_number = serializers.CharField(source='instructor.svc_number', read_only=True)
    instructor_rank = serializers.CharField(source='instructor.rank', read_only=True)
    course_name = serializers.CharField(source='class_obj.course.name', read_only=True)

    class Meta:
        model = Subject
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')

    def get_instructor_name(self, obj):
        return obj.instructor.get_full_name() if obj.instructor else "Not Assigned"
    
    def validate_instructor(self, value):
        if value and value.role != 'instructor':
            raise serializers.ValidationError("Assigned instructor must have the role of 'instructor'.")
        return value
    
    def validate_subject_code(self, value):
        if not value:
            return value
        
        request = self.context.get('request')
        school = getattr(request, 'school', None) if request else None
        
        qs = Subject.objects.filter(subject_code=value)
        if school:
            qs = qs.filter(school=school)
        
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        
        if qs.exists():
            raise serializers.ValidationError("This subject code is already in use.")
        return value


class EnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField(read_only=True)
    student_svc_number = serializers.CharField(source='student.svc_number', read_only=True)
    student_rank = serializers.CharField(source='student.rank', read_only=True)
    class_name = serializers.CharField(source='class_obj.name', read_only=True)
    course_name = serializers.CharField(source='class_obj.course.name', read_only=True)
    student_email = serializers.CharField(source='student.email', read_only=True)
    school_name = serializers.CharField(source='school.name', read_only=True)

    class Meta:
        model = Enrollment
        fields = '__all__'
        read_only_fields = ('enrollment_date', 'school')

    def get_student_name(self, obj):
        return obj.student.get_full_name() if obj.student else "N/A"
    
    def validate_student(self, value):
        if value.role != 'student':
            raise serializers.ValidationError("Enrolled user must have the role of 'student'.")
        return value

    def validate(self, attrs):
        class_obj = attrs.get('class_obj')
        student = attrs.get('student')
        is_active = attrs.get('is_active', True)

        if self.instance:
            if is_active and not self.instance.is_active:
                other_active = Enrollment.all_objects.filter(
                    student=student or self.instance.student,
                    is_active=True
                ).exclude(pk=self.instance.pk)
                
                if other_active.exists():
                    other = other_active.first()
                    raise serializers.ValidationError({
                        "is_active": f"Student has an active enrollment in {other.school.name if other.school else 'another school'}. "
                                     "They must complete or withdraw from that enrollment first."
                    })
            return attrs

        if not class_obj or not student:
            return attrs

        enrollment_count = class_obj.enrollments.filter(is_active=True).count()
        if enrollment_count >= class_obj.capacity:
            raise serializers.ValidationError({
                "class_obj": f"Class '{class_obj.name}' is at full capacity."
            })
        
        if Enrollment.objects.filter(student=student, class_obj=class_obj).exists():
            raise serializers.ValidationError({
                "student": f"Student '{student.get_full_name()}' is already enrolled in class '{class_obj.name}'."
            })
        
        active_enrollment = Enrollment.all_objects.filter(
            student=student,
            is_active=True
        ).first()
        
        if active_enrollment:
            raise serializers.ValidationError({
                "student": f"Student '{student.get_full_name()}' has an active enrollment in "
                          f"{active_enrollment.school.name if active_enrollment.school else 'another school'}. "
                          "They must complete or withdraw from that enrollment first."
            })
        
        return attrs


class NoticeSerializer(serializers.ModelSerializer):
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    created_by_name = serializers.SerializerMethodField(read_only=True)
    is_expired = serializers.SerializerMethodField(read_only=True)
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Notice
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'created_by', 'is_expired')

    def get_is_expired(self, obj):
        if not obj.expiry_date:
            return False
        return obj.expiry_date < timezone.now().date()
    
    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def validate_expiry_date(self, value):
        if value and value < timezone.now().date():
            raise serializers.ValidationError("Expiry date cannot be in the past.")
        return value

    def get_is_read(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return NoticeReadStatus.objects.filter(
                user=request.user,
                notice=obj,
            ).exists()
        return False


class ExamAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamAttachment
        fields = '__all__'
        read_only_fields = ('created_at', 'uploaded_at', 'uploaded_by', 'id', 'file_name', 'file_size')


class ExamSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    subject_code = serializers.CharField(source='subject.subject_code', read_only=True)
    class_name = serializers.CharField(source='subject.class_obj.name', read_only=True)
    created_by_name = serializers.SerializerMethodField(read_only=True)
    exam_type_display = serializers.CharField(source='get_exam_type_display', read_only=True)
    average_score = serializers.FloatField(read_only=True)
    submission_count = serializers.IntegerField(read_only=True)
    attachments = ExamAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Exam
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'created_by', 'average_score', 'id')
        extra_kwargs = {
            'exam_type': {'required': True},
            'title': {'required': True},
            'subject': {'required': True},
            'exam_date': {'required': True},
            'total_marks': {'required': True}
        }

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None
    
    def validate_exam_date(self, value):
        if not self.instance and value < timezone.now().date():
            raise serializers.ValidationError("Exam date cannot be in the past.")
        return value

    def validate(self, data):
        exam_type = data.get('exam_type')
        subject = data.get('subject')
        is_active = data.get('is_active', True)

        if exam_type == 'final' and is_active:
            qs = Exam.objects.filter(subject=subject, exam_type='final', is_active=True)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({
                    "exam_type": "There is already an active Final Exam for this subject."
                })
        return data


class ExamResultSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.get_full_name', read_only=True)
    student_svc_number = serializers.CharField(source='student.svc_number', read_only=True)
    exam_title = serializers.CharField(source='exam.title', read_only=True)
    exam_total_marks = serializers.IntegerField(source='exam.total_marks', read_only=True)
    graded_by_name = serializers.SerializerMethodField(read_only=True)
    percentage = serializers.FloatField(read_only=True)
    grade = serializers.CharField(read_only=True)

    subject_id = serializers.IntegerField(source='exam.subject.id', read_only=True)
    subject_name = serializers.CharField(source='exam.subject.name', read_only=True)
    subject_code = serializers.CharField(source='exam.subject.subject_code', read_only=True)

    class_id = serializers.IntegerField(source='exam.subject.class_obj_id', read_only=True)
    class_name = serializers.CharField(source='exam.subject.class_obj.name', read_only=True)
    course_name = serializers.CharField(source='exam.subject.class_obj.course.name', read_only=True)

    is_notification_read = serializers.SerializerMethodField()
    notification_read_at = serializers.SerializerMethodField()

    class Meta:
        model = ExamResult
        fields = '__all__'
        read_only_fields = ('graded_at', 'percentage', 'grade', 'submitted_at', 'graded_by', 
                           'updated_at', 'is_notification_read', 'notification_read_at')
    
    def get_graded_by_name(self, obj):
        return obj.graded_by.get_full_name() if obj.graded_by else None
    
    def validate_marks_obtained(self, value):
        if value is not None:
            exam = self.instance.exam if self.instance else None
            if not exam:
                exam_id = self.initial_data.get('exam')
                if exam_id:
                    try:
                        exam = Exam.objects.get(pk=exam_id)
                    except Exam.DoesNotExist:
                        pass
            if exam and value > exam.total_marks:
                raise serializers.ValidationError("Marks obtained cannot exceed total marks for the exam.")
        return value
    
    def get_is_notification_read(self, obj):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return False

        if obj.student != request.user:
            return True

        if not obj.is_submitted or obj.marks_obtained is None:
            return True

        return ExamResultNotificationReadStatus.objects.filter(
            user=request.user,
            exam_result=obj
        ).exists()

    def get_notification_read_at(self, obj):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return None

        if obj.student != request.user:
            return None
        
        try:
            read_status = ExamResultNotificationReadStatus.objects.get(
                user=request.user,
                exam_result=obj
            )
            return read_status.read_at
        except ExamResultNotificationReadStatus.DoesNotExist:
            return None

    def update(self, instance, validated_data):
        if 'marks_obtained' in validated_data and validated_data['marks_obtained'] is not None:
            validated_data['graded_by'] = self.context['request'].user
            validated_data['graded_at'] = timezone.now()
            validated_data['is_submitted'] = True
            if not validated_data.get('submitted_at'):
                validated_data['submitted_at'] = timezone.now()
        return super().update(instance, validated_data)


class BulkExamResultSerializer(serializers.Serializer):
    results = serializers.ListField(
        child=serializers.DictField(),
        allow_empty=False,
    )

    def validate_results(self, value):
        for result in value:
            if 'student_id' not in result:
                raise serializers.ValidationError("Each result must include 'student_id'.")
            if 'marks_obtained' not in result:
                raise serializers.ValidationError("Each result must include 'marks_obtained'.")
        return value


class AttendanceSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.get_full_name', read_only=True)
    student_svc_number = serializers.CharField(source='student.svc_number', read_only=True)
    class_name = serializers.CharField(source='class_obj.name', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    marked_by_name = serializers.SerializerMethodField(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Attendance
        fields = '__all__'
        read_only_fields = ('marked_by', 'id', 'created_by', 'updated_at')

    def get_marked_by_name(self, obj):
        return obj.marked_by.get_full_name() if obj.marked_by else None
    
    def validate(self, attrs):
        student = attrs.get('student')
        class_obj = attrs.get('class_obj')

        if student and class_obj:
            if not Enrollment.objects.filter(
                student=student,
                class_obj=class_obj,
                is_active=True
            ).exists():
                raise serializers.ValidationError({
                    "student": "Student is not enrolled in this class."
                })
        return attrs


class BulkAttendanceSerializer(serializers.Serializer):
    class_obj = serializers.PrimaryKeyRelatedField(queryset=Class.objects.all())
    subject = serializers.PrimaryKeyRelatedField(
        queryset=Subject.objects.all(),
        required=False,
        allow_null=True
    )
    date = serializers.DateField()
    attendance_records = serializers.ListField(
        child=serializers.DictField(),
        allow_empty=False
    )

    def validate_attendance_records(self, value):
        valid_statuses = ['present', 'absent', 'late', 'excused']
        for record in value:
            if 'student_id' not in record:
                raise serializers.ValidationError("Each record must have a student_id.")
            if 'status' not in record:
                raise serializers.ValidationError("Each record must have a status.")
            if record['status'] not in valid_statuses:
                raise serializers.ValidationError(f"Invalid status: {record['status']}")
        return value


class ClassNotificationSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source='class_obj.name', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    created_by_name = serializers.SerializerMethodField(read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    is_read = serializers.SerializerMethodField()
    read_at = serializers.SerializerMethodField()

    class Meta:
        model = ClassNotice
        fields = '__all__'
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None
    
    def get_is_read(self, obj):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return False
        return ClassNoticeReadStatus.objects.filter(
            user=request.user,
            class_notice=obj
        ).exists()
    
    def get_read_at(self, obj):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return None
        try:
            read_status = ClassNoticeReadStatus.objects.get(
                user=request.user,
                class_notice=obj
            )
            return read_status.read_at
        except ClassNoticeReadStatus.DoesNotExist:
            return None


class ExamReportSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    class_name = serializers.CharField(source='class_obj.name', read_only=True)
    created_by_name = serializers.SerializerMethodField(read_only=True)
    exams_count = serializers.IntegerField(source='exams.count', read_only=True)
    total_students = serializers.IntegerField(read_only=True)
    average_performance = serializers.FloatField(read_only=True)

    class Meta:
        model = ExamReport
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'created_by', 'average_performance')

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None
    
    def validate_exams(self, value):
        if not value:
            raise serializers.ValidationError("At least one exam must be selected.")
        
        subject_ids = set(exam.subject_id for exam in value)
        if len(subject_ids) > 1:
            raise serializers.ValidationError("All exams must belong to the same subject.")
        
        return value


class AttendanceSessionSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source='class_obj.name', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    subject_code = serializers.CharField(source='subject.subject_code', read_only=True)
    created_by_name = serializers.SerializerMethodField(read_only=True)
    session_type_display = serializers.CharField(source='get_session_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    total_students = serializers.IntegerField(read_only=True)
    marked_count = serializers.IntegerField(read_only=True)
    attendance_percentage = serializers.FloatField(read_only=True)
    current_qr_token = serializers.SerializerMethodField(read_only=True)
    qr_expires_in = serializers.SerializerMethodField(read_only=True)
    can_mark = serializers.SerializerMethodField(read_only=True)
    is_within_schedule = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = AttendanceSession
        fields = '__all__'
        read_only_fields = (
            'session_id', 'qr_code_secret', 'qr_last_generated', 'qr_generation_count',
            'actual_start', 'actual_end', 'created_at', 'updated_at', 'created_by'
        )

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_current_qr_token(self, obj):
        if obj.status == 'active' and obj.enable_qr_scan:
            return obj.generate_qr_token()
        return None

    def get_can_mark(self, obj):
        return obj.can_mark_attendance()

    def get_is_within_schedule(self, obj):
        return obj.is_within_schedule()

    def get_qr_expires_in(self, obj):
        if obj.status == 'active' and obj.qr_last_generated:
            elapsed = (timezone.now() - obj.qr_last_generated).total_seconds()
            remaining = obj.qr_refresh_interval - elapsed
            return max(0, int(remaining))
        return 0

    def validate(self, attrs):
        scheduled_start = attrs.get('scheduled_start')
        scheduled_end = attrs.get('scheduled_end')
        class_obj = attrs.get('class_obj')
        subject = attrs.get('subject')

        if scheduled_end and scheduled_start and scheduled_end <= scheduled_start:
            raise serializers.ValidationError({
                "scheduled_end": "End time must be after the start time."
            })

        if subject and class_obj and subject.class_obj != class_obj:
            raise serializers.ValidationError({
                "subject": "Selected subject does not belong to the selected class."
            })

        if attrs.get('require_location'):
            if not attrs.get('allowed_latitude') or not attrs.get('allowed_longitude'):
                raise serializers.ValidationError({
                    "require_location": "Latitude and longitude are required when location verification is enabled."
                })
        return attrs

    def create(self, validated_data):
        validated_data['qr_code_secret'] = uuid.uuid4().hex
        return super().create(validated_data)


class AttendanceSessionListSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source='class_obj.name', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    session_type_display = serializers.CharField(source='get_session_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    marked_count = serializers.IntegerField(read_only=True)
    total_students = serializers.IntegerField(read_only=True)
    attendance_percentage = serializers.FloatField(read_only=True)

    class Meta:
        model = AttendanceSession
        fields = '__all__'


class SessionAttendanceSerializer(serializers.ModelSerializer):
    session_title = serializers.CharField(source='session.title', read_only=True)
    session_type = serializers.CharField(source='session.get_session_type_display', read_only=True)
    class_name = serializers.CharField(source='session.class_obj.name', read_only=True)
    class_id = serializers.IntegerField(source='session.class_obj.id', read_only=True)
    subject_name = serializers.CharField(source='session.subject.name', read_only=True, allow_null=True)
    subject_code = serializers.CharField(source='session.subject.subject_code', read_only=True, allow_null=True)
    student_name = serializers.CharField(source='student.get_full_name', read_only=True)
    student_svc_number = serializers.CharField(source='student.svc_number', read_only=True)
    student_email = serializers.CharField(source='student.email', read_only=True)
    student_rank = serializers.CharField(source='student.rank', read_only=True)
    marked_by_name = serializers.SerializerMethodField(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    marking_method_display = serializers.CharField(source='get_marking_method_display', read_only=True)
    minutes_late = serializers.IntegerField(read_only=True)
    marked_at_formatted = serializers.SerializerMethodField()
    session_date_formatted = serializers.SerializerMethodField()

    class Meta:
        model = SessionAttendance
        fields = '__all__'
        read_only_fields = ('marked_at', 'marked_by')

    def get_marked_by_name(self, obj):
        return obj.marked_by.get_full_name() if obj.marked_by else 'System'

    def get_marked_at_formatted(self, obj):
        if obj.marked_at:
            return obj.marked_at.strftime('%b %d, %I:%M %p')
        return None

    def get_session_date_formatted(self, obj):
        if obj.session and obj.session.scheduled_start:
            return obj.session.scheduled_start.strftime('%a, %b %d')
        return None

    def validate(self, attrs):
        session = attrs.get('session')
        student = attrs.get('student')

        if session and not session.can_mark_attendance():
            raise serializers.ValidationError({
            })

        if session and student:
            if not Enrollment.objects.filter(
                student=student,
                class_obj=session.class_obj,
                is_active=True
            ).exists():
                raise serializers.ValidationError({
                    "student": "Student is not enrolled in this class."
                })

            if not self.instance:
                if SessionAttendance.objects.filter(session=session, student=student).exists():
                    raise serializers.ValidationError({
                        "student": "Attendance already marked for this student in this session."
                    })

        return attrs


class QRAttendanceMarkSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
    qr_token = serializers.CharField(max_length=16)
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)

    def validate(self, attrs):
        try:
            session = AttendanceSession.objects.get(
                session_id=attrs['session_id'],
                is_active=True
            )
        except AttendanceSession.DoesNotExist:
            raise serializers.ValidationError({"session_id": "Invalid or inactive session."})

        if not session.verify_qr_token(attrs['qr_token']):
            raise serializers.ValidationError({
                "qr_token": "Invalid or expired QR code."
            })

        if not session.can_mark_attendance():
            raise serializers.ValidationError({
                "session_id": "Session is not accepting attendance at this time."
            })

        if not session.enable_qr_scan:
            raise serializers.ValidationError({
                "session_id": "QR code scanning is not enabled for this session."
            })

        if session.require_location:
            if not attrs.get('latitude') or not attrs.get('longitude'):
                raise serializers.ValidationError({
                    "location": "Location is required for this session."
                })
        
        attrs['session'] = session
        return attrs


class BulkSessionAttendanceSerializer(serializers.Serializer):
    session_id = serializers.IntegerField()
    attendance_records = serializers.ListField(
        child=serializers.DictField(),
        allow_empty=False
    )

    def validate_session_id(self, value):
        try:
            AttendanceSession.objects.get(id=value, is_active=True)
        except AttendanceSession.DoesNotExist:
            raise serializers.ValidationError("Invalid or inactive session.")
        return value

    def validate_attendance_records(self, value):
        required_fields = ['student_id', 'status']
        valid_statuses = ['present', 'late', 'absent', 'excused']

        for idx, record in enumerate(value):
            for field in required_fields:
                if field not in record:
                    raise serializers.ValidationError(
                        f"Record {idx + 1}: '{field}' is required."
                    )

            if record['status'] not in valid_statuses:
                raise serializers.ValidationError(
                    f"Record {idx + 1}: Invalid status '{record['status']}'."
                )

        return value


class BiometricRecordSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.get_full_name', read_only=True)
    student_svc_number = serializers.CharField(source='student.svc_number', read_only=True)
    session_title = serializers.CharField(source='session.title', read_only=True)
    device_type_display = serializers.CharField(source='get_device_type_display', read_only=True)
    attendance_status = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = BiometricRecord
        fields = '__all__'
        read_only_fields = ('processed', 'processed_at', 'session_attendance', 'created_at', 'updated_at')

    def get_attendance_status(self, obj):
        if obj.session_attendance:
            return {
                'status': obj.session_attendance.status,
                'marked_at': obj.session_attendance.marked_at
            }
        return None


class BiometricSyncSerializer(serializers.Serializer):
    device_id = serializers.CharField(max_length=100)
    device_type = serializers.ChoiceField(choices=BiometricRecord.DEVICE_TYPE_CHOICES)
    records = serializers.ListField(
        child=serializers.DictField(),
        allow_empty=False
    )

    def validate_records(self, value):
        required_fields = ['biometric_id', 'scan_time']

        for idx, record in enumerate(value):
            for field in required_fields:
                if field not in record:
                    raise serializers.ValidationError(
                        f"Record {idx + 1}: '{field}' is required."
                    )

            try:
                
                parser.parse(record['scan_time'])
            except Exception:
                raise serializers.ValidationError(
                    f"Record {idx + 1}: Invalid scan_time format."
                )

        return value


class AttendanceSessionLogSerializer(serializers.ModelSerializer):
    session_title = serializers.CharField(source='session.title', read_only=True)
    performed_by_name = serializers.SerializerMethodField(read_only=True)
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    
    class Meta:
        model = AttendanceSessionLog
        fields = '__all__'
        read_only_fields = ('timestamp',)

    def get_performed_by_name(self, obj):
        return obj.performed_by.get_full_name() if obj.performed_by else 'System'


class SessionStatisticsSerializer(serializers.Serializer):
    total_students = serializers.IntegerField()
    marked_count = serializers.IntegerField()
    present_count = serializers.IntegerField()
    late_count = serializers.IntegerField()
    absent_count = serializers.IntegerField()
    excused_count = serializers.IntegerField()
    attendance_rate = serializers.FloatField()
    on_time_rate = serializers.FloatField()
    qr_scan_count = serializers.IntegerField()
    manual_count = serializers.IntegerField()
    biometric_count = serializers.IntegerField()
    admin_count = serializers.IntegerField()


class StudentAttendanceSummarySerializer(serializers.Serializer):
    student_id = serializers.IntegerField()
    student_name = serializers.CharField()
    student_svc_number = serializers.CharField()
    total_sessions = serializers.IntegerField()
    attended_sessions = serializers.IntegerField()
    present_count = serializers.IntegerField()
    late_count = serializers.IntegerField()
    absent_count = serializers.IntegerField()
    excused_count = serializers.IntegerField()
    attendance_rate = serializers.FloatField()
    punctuality_rate = serializers.FloatField()
    recent_sessions = SessionAttendanceSerializer(many=True, read_only=True)


class PersonalNotificationSerializer(serializers.ModelSerializer):
    notification_type_display = serializers.CharField(source='get_notification_type_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    created_by_name = serializers.SerializerMethodField(read_only=True)
    exam_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = PersonalNotification
        fields = '__all__'
        read_only_fields = ('created_at', 'read_at', 'created_by')

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else 'System'

    def get_exam_details(self, obj):
        if obj.exam_result:
            return {
                'exam_id': obj.exam_result.exam.id,
                'exam_title': obj.exam_result.exam.title,
                'subject_name': obj.exam_result.exam.subject.name,
                'marks_obtained': float(obj.exam_result.marks_obtained) if obj.exam_result.marks_obtained else None,
                'total_marks': obj.exam_result.exam.total_marks,
                'percentage': obj.exam_result.percentage,
                'grade': obj.exam_result.grade
            }
        return None


class CertificateTemplateSerializer(serializers.ModelSerializer):
    
    school_name = serializers.CharField(source='school.name', read_only=True)
    school_code = serializers.CharField(source='school.code', read_only=True)
    effective_colors = serializers.SerializerMethodField(read_only=True)
    has_logo = serializers.SerializerMethodField(read_only=True)
    has_signature = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = None  
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_effective_colors(self, obj):
        return obj.get_effective_colors()
    
    def get_has_logo(self, obj):
        logo = obj.get_effective_logo()
        return logo is not None and bool(logo.name)
    
    def get_has_signature(self, obj):
        return bool(obj.signature_image and obj.signature_image.name)


class CertificateTemplateListSerializer(serializers.ModelSerializer):
    
    school_name = serializers.CharField(source='school.name', read_only=True)
    template_type_display = serializers.CharField(
        source='get_template_type_display', 
        read_only=True
    )
    
    class Meta:
        model = None  
        fields = [
            'id', 'name', 'template_type', 'template_type_display',
            'school', 'school_name', 'is_active', 'is_default',
            'created_at'
        ]


class CertificateSerializer(serializers.ModelSerializer):
    
    school_name = serializers.CharField(source='school.name', read_only=True)
    school_code = serializers.CharField(source='school.code', read_only=True)
    template_name = serializers.CharField(
        source='template.name', 
        read_only=True,
        allow_null=True
    )
    issued_by_name = serializers.SerializerMethodField(read_only=True)
    revoked_by_name = serializers.SerializerMethodField(read_only=True)
    
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    is_valid = serializers.BooleanField(read_only=True)
    
    verification_url = serializers.CharField(read_only=True)
    download_url = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = None  
        fields = '__all__'
        read_only_fields = [
            'id', 'certificate_number', 'verification_code',
            'student_name', 'student_svc_number', 'student_rank',
            'course_name', 'class_name', 'created_at', 'updated_at',
            'download_count', 'last_downloaded_at', 'view_count', 
            'last_viewed_at', 'file_generated_at'
        ]
    
    def get_issued_by_name(self, obj):
        if obj.issued_by:
            return obj.issued_by.get_full_name()
        return None
    
    def get_revoked_by_name(self, obj):
        if obj.revoked_by:
            return obj.revoked_by.get_full_name()
        return None
    
    def get_download_url(self, obj):
        if obj.certificate_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.certificate_file.url)
            return obj.certificate_file.url
        return None

class CertificateListSerializer(serializers.ModelSerializer):
    
    school_name = serializers.CharField(source='school.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    is_valid = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = None  # Set this to Certificate
        fields = [
            'id', 'certificate_number', 'verification_code',
            'student_name', 'student_svc_number', 'student_rank',
            'course_name', 'class_name',
            'final_grade', 'final_percentage',
            'issue_date', 'completion_date',
            'status', 'status_display', 'is_valid',
            'school', 'school_name',
            'download_count', 'view_count'
        ]

class CertificateCreateSerializer(serializers.Serializer):

    enrollment_id = serializers.IntegerField()
    template_id = serializers.IntegerField(required=False, allow_null=True)
    final_grade = serializers.CharField(max_length=10, required=False, allow_blank=True)
    final_percentage = serializers.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        required=False,
        allow_null=True
    )
    attendance_percentage = serializers.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        required=False,
        allow_null=True
    )
    issue_date = serializers.DateField(required=False)
    expiry_date = serializers.DateField(required=False, allow_null=True)
    
    def validate_enrollment_id(self, value):
        
        try:
            enrollment = Enrollment.all_objects.select_related(
                'student', 'class_obj', 'class_obj__course', 'school'
            ).get(id=value)
        except Enrollment.DoesNotExist:
            raise serializers.ValidationError("Enrollment not found.")
        
        if not enrollment.completion_date:
            raise serializers.ValidationError(
                "Cannot issue certificate for incomplete enrollment. "
                "Please mark the enrollment as completed first."
            )
        
        from .models import Certificate  
        if Certificate.all_objects.filter(enrollment=enrollment).exists():
            raise serializers.ValidationError(
                "A certificate has already been issued for this enrollment."
            )
        
        return value
    
    def validate_template_id(self, value):
        if value is None:
            return value
        
        
        try:
            CertificateTemplate.all_objects.get(id=value, is_active=True)
        except CertificateTemplate.DoesNotExist:
            raise serializers.ValidationError("Certificate template not found.")
        
        return value
    
    def validate(self, attrs):
        enrollment_id = attrs.get('enrollment_id')
        template_id = attrs.get('template_id')
        
        if enrollment_id and template_id:
            
            enrollment = Enrollment.all_objects.get(id=enrollment_id)
            template = CertificateTemplate.all_objects.get(id=template_id)
            
            if template.school and enrollment.school:
                if template.school.id != enrollment.school.id:
                    raise serializers.ValidationError({
                        'template_id': "Template must belong to the same school as the enrollment."
                    })
        
        return attrs
    
    def create(self, validated_data):

        enrollment_id = validated_data.pop('enrollment_id')
        template_id = validated_data.pop('template_id', None)
        
        enrollment = Enrollment.all_objects.select_related(
            'student', 'class_obj', 'class_obj__course', 'school'
        ).get(id=enrollment_id)
        
        template = None
        if template_id:
            template = CertificateTemplate.all_objects.get(id=template_id)
        else:
            template = CertificateTemplate.objects.filter(
                school=enrollment.school,
                is_active=True,
                is_default=True
            ).first()
        
        final_grade = validated_data.get('final_grade')
        final_percentage = validated_data.get('final_percentage')
        attendance_percentage = validated_data.get('attendance_percentage')
        
        if not final_grade or not final_percentage:
            grade_data = self._calculate_student_grade(enrollment)
            final_grade = final_grade or grade_data.get('grade', '')
            final_percentage = final_percentage or grade_data.get('percentage')
        
        if not attendance_percentage:
            attendance_percentage = self._calculate_attendance_rate(enrollment)
        
        with transaction.atomic():
            certificate = Certificate.objects.create(
                school=enrollment.school,
                student=enrollment.student,
                enrollment=enrollment,
                template=template,
                completion_date=enrollment.completion_date,
                issue_date=validated_data.get('issue_date', timezone.now().date()),
                expiry_date=validated_data.get('expiry_date'),
                final_grade=final_grade or '',
                final_percentage=final_percentage,
                attendance_percentage=attendance_percentage,
                issued_by=self.context.get('request').user if self.context.get('request') else None,
                status='issued'
            )
            
            try:
                generator = CertificateGenerator(certificate)
                generator.save_to_model()
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error generating certificate PDF: {e}", exc_info=True)
        
        return certificate
    
    def _calculate_student_grade(self, enrollment):
        
        results = ExamResult.all_objects.filter(
            student=enrollment.student,
            exam__subject__class_obj=enrollment.class_obj,
            is_submitted=True,
            marks_obtained__isnull=False
        ).select_related('exam')
        
        if not results.exists():
            return {'grade': '', 'percentage': None}
        
        total_marks = sum(float(r.marks_obtained) for r in results)
        total_possible = sum(r.exam.total_marks for r in results)
        
        if total_possible == 0:
            return {'grade': '', 'percentage': None}
        
        percentage = (total_marks / total_possible) * 100
        
        if percentage >= 90:
            grade = 'A'
        elif percentage >= 80:
            grade = 'B'
        elif percentage >= 70:
            grade = 'C'
        elif percentage >= 60:
            grade = 'D'
        else:
            grade = 'F'
        
        return {
            'grade': grade,
            'percentage': Decimal(str(round(percentage, 2)))
        }
    
    def _calculate_attendance_rate(self, enrollment):
        
        total_sessions = AttendanceSession.all_objects.filter(
            class_obj=enrollment.class_obj,
            status='completed'
        ).count()
        
        if total_sessions == 0:
            return None
        
        attended = SessionAttendance.all_objects.filter(
            student=enrollment.student,
            session__class_obj=enrollment.class_obj,
            status__in=['present', 'late']
        ).count()
        
        percentage = (attended / total_sessions) * 100
        return Decimal(str(round(percentage, 2)))

class BulkCertificateCreateSerializer(serializers.Serializer):
    
    class_id = serializers.IntegerField()
    template_id = serializers.IntegerField(required=False, allow_null=True)
    issue_date = serializers.DateField(required=False)
    
    def validate_class_id(self, value):
        
        try:
            Class.all_objects.get(id=value)
        except Class.DoesNotExist:
            raise serializers.ValidationError("Class not found.")
        
        return value
    
    def create(self, validated_data):
        
        class_id = validated_data.get('class_id')
        template_id = validated_data.get('template_id')
        issue_date = validated_data.get('issue_date', timezone.now().date())
        
        class_obj = Class.all_objects.get(id=class_id)
        
        existing_cert_enrollments = Certificate.all_objects.values_list(
            'enrollment_id', flat=True
        )
        
        completed_enrollments = Enrollment.all_objects.filter(
            class_obj=class_obj,
            completion_date__isnull=False
        ).exclude(
            id__in=existing_cert_enrollments
        ).select_related('student', 'school')
        
        created_certificates = []
        errors = []
        
        for enrollment in completed_enrollments:
            try:
                serializer = CertificateCreateSerializer(
                    data={
                        'enrollment_id': enrollment.id,
                        'template_id': template_id,
                        'issue_date': issue_date,
                    },
                    context=self.context
                )
                serializer.is_valid(raise_exception=True)
                certificate = serializer.save()
                created_certificates.append(certificate)
            except Exception as e:
                errors.append({
                    'enrollment_id': enrollment.id,
                    'student_name': enrollment.student.get_full_name(),
                    'error': str(e)
                })
        
        return {
            'created': created_certificates,
            'errors': errors,
            'total_created': len(created_certificates),
            'total_errors': len(errors)
        }

class CertificateVerificationSerializer(serializers.Serializer):
    
    is_valid = serializers.BooleanField()
    certificate_number = serializers.CharField()
    student_name = serializers.CharField()
    student_svc_number = serializers.CharField(allow_blank=True)
    student_rank = serializers.CharField(allow_blank=True)
    course_name = serializers.CharField()
    class_name = serializers.CharField()
    school_name = serializers.CharField()
    final_grade = serializers.CharField(allow_blank=True)
    final_percentage = serializers.DecimalField(
        max_digits=5, 
        decimal_places=2,
        allow_null=True
    )
    issue_date = serializers.DateField()
    completion_date = serializers.DateField()
    status = serializers.CharField()
    status_display = serializers.CharField()
    
    revocation_reason = serializers.CharField(allow_blank=True, required=False)
    revoked_at = serializers.DateTimeField(allow_null=True, required=False)

class CertificateDownloadLogSerializer(serializers.ModelSerializer):
    
    certificate_number = serializers.CharField(
        source='certificate.certificate_number',
        read_only=True
    )
    downloaded_by_name = serializers.SerializerMethodField(read_only=True)
    download_type_display = serializers.CharField(
        source='get_download_type_display',
        read_only=True
    )
    
    class Meta:
        model = None  
        fields = '__all__'
        read_only_fields = ['id', 'downloaded_at']
    
    def get_downloaded_by_name(self, obj):
        if obj.downloaded_by:
            return obj.downloaded_by.get_full_name()
        return 'Anonymous'

class CertificateStatsSerializer(serializers.Serializer):
    
    total_certificates = serializers.IntegerField()
    issued_count = serializers.IntegerField()
    pending_count = serializers.IntegerField()
    revoked_count = serializers.IntegerField()
    expired_count = serializers.IntegerField()
    total_downloads = serializers.IntegerField()
    total_views = serializers.IntegerField()
    certificates_this_month = serializers.IntegerField()
    certificates_this_year = serializers.IntegerField()






