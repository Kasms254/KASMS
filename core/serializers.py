from rest_framework import serializers
from .models import (
    StudentIndex,Profile,AttendanceSession, User, Course, Class, Enrollment, Subject, Notice, Exam, ExamReport, PersonalNotification,
    Attendance, ExamResult, ClassNotice, ExamAttachment, NoticeReadStatus, ClassNoticeReadStatus, BiometricRecord, 
    SessionAttendance, AttendanceSessionLog, ExamResultNotificationReadStatus, SchoolAdmin, School,SchoolMembership,Certificate, CertificateTemplate, CertificateDownloadLog
)
from django.contrib.auth.password_validation import validate_password
import uuid
from django.utils import timezone
from django.db import transaction

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

        if user and school:
            has_membership = SchoolMembership.all_objects.filter(
                user=user, school=school, status='active'
            ).exists()
            if not has_membership:
                raise serializers.ValidationError({
                    'user': 'User must have an active membership at this school.'
                })

        return attrs

class SchoolMembershipSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(
        source='user.get_full_name', read_only=True
    )
    user_svc_number = serializers.CharField(
        source='user.svc_number', read_only=True
    )
    school_name = serializers.CharField(
        source='school.name', read_only=True
    )
    school_code = serializers.CharField(
        source='school.code', read_only=True
    )
    status_display = serializers.CharField(
        source='get_status_display', read_only=True
    )
    role_display = serializers.CharField(
        source='get_role_display', read_only=True
    )

    class Meta:
        model = SchoolMembership
        fields = '__all__'
        read_only_fields = (
            'id', 'created_at', 'updated_at',
            'ended_at', 'completion_date'
        )

class SchoolEnrollmentSerializer(serializers.Serializer):

    svc_number = serializers.CharField(max_length=50)
    school_id = serializers.UUIDField()
    role = serializers.ChoiceField(
        choices=SchoolMembership.Role.choices
    )
    class_id = serializers.IntegerField(
        required=False, allow_null=True
    )

    def validate_svc_number(self, value):
        try:
            user = User.all_objects.get(svc_number=value)
        except User.DoesNotExist:
            raise serializers.ValidationError(
                'No user found with this service number.'
            )

        active = SchoolMembership.all_objects.filter(
            user=user, status='active'
        ).select_related('school').first()

        if active:
            raise serializers.ValidationError(
                f'User has active membership at '
                f'{active.school.name}. Complete or '
                f'transfer that membership first.'
            )

        self.context['resolved_user'] = user
        return value

    def validate_school_id(self, value):
        try:
            school = School.objects.get(
                id=value, is_active=True
            )
        except School.DoesNotExist:
            raise serializers.ValidationError(
                'School not found or inactive.'
            )
        self.context['resolved_school'] = school
        return value

    def validate(self, attrs):
        user = self.context.get('resolved_user')
        school = self.context.get('resolved_school')
        role = attrs.get('role')

        if not user or not school:
            return attrs

        if role == 'student':
            count = SchoolMembership.all_objects.filter(
                school=school, role='student',
                status='active'
            ).count()
            if count >= school.max_students:
                raise serializers.ValidationError({
                    'school_id': 'School at max student capacity.'
                })

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        user = self.context['resolved_user']
        school = self.context['resolved_school']

        membership = SchoolMembership.objects.create(
            user=user,
            school=school,
            role=validated_data['role'],
            status=SchoolMembership.Status.ACTIVE,
        )

        class_id = validated_data.get('class_id')
        if class_id and validated_data['role'] == 'student':
            class_obj = Class.objects.get(
                id=class_id, school=school
            )
            Enrollment.objects.create(
                student=user,
                class_obj=class_obj,
                school=school,
                membership=membership,
                is_active=True,
            )

        return membership

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

            SchoolMembership.objects.create(
                user=admin_user,
                school=school,
                role=SchoolMembership.Role.ADMIN,
                status=SchoolMembership.Status.ACTIVE,
            )

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
            qs = User.all_objects.exclude(pk=self.instance.pk).filter(email=value)
        else:
            qs = User.all_objects.filter(email=value)

        if school:
            qs = qs.filter(
                school_memberships__school=school,
                school_memberships__status='active'
            )

        if qs.exists():
            raise serializers.ValidationError("This email is already in use.")
        return value
        
    
    def validate_svc_number(self, value):

        request = self.context.get('request')
        school = getattr(request, 'school', None) if request else None
        role = self.initial_data.get('role')
        
        existing_user = User.all_objects.filter(svc_number=value).first()
        
        if existing_user and (not self.instance or self.instance.pk != existing_user.pk):
            active_membership = SchoolMembership.all_objects.filter(
                user=existing_user,
                status='active'
            ).select_related('school').first()

            if role == 'student':
                if active_membership:
                    active_enrollment = Enrollment.all_objects.filter(
                        student=existing_user,
                        is_active=True
                    ).select_related('school').first()

                    if active_enrollment:
                        raise serializers.ValidationError(
                            f"This service number has an active enrollment in {active_enrollment.school.name}. "
                            "They must complete or withdraw from that enrollment first."
                        )
                    else:
                        raise serializers.ValidationError(
                            f"This service number has an active membership at {active_membership.school.name}. "
                            "Their membership must be completed first."
                        )

                self._existing_user = existing_user
            else:
                if active_membership:
                    raise serializers.ValidationError(
                        f"This service number is already in use at {active_membership.school.name}."
                    )
                self._existing_user = existing_user
        
        return value
    
    def create(self, validated_data):
        class_obj = validated_data.pop('class_obj', None)
        validated_data.pop('password2')
        password = validated_data.pop('password')

        school_from_data = validated_data.pop('school', None)

        request = self.context.get('request')
        school = (
            school_from_data
            or (getattr(request, 'school', None) if request else None)
            or (class_obj.school if class_obj else None)
        )

        existing_user = getattr(self, '_existing_user', None)

        if existing_user:
            user = existing_user
            for attr, value in validated_data.items():
                if attr not in ('username',):  # Don't overwrite username
                    setattr(user, attr, value)
            user.set_password(password)
            user.must_change_password = True
            user.is_active = True
            user.save()
        else:
            # Brand new user
            user = User(**validated_data)
            user.set_password(password)
            user.must_change_password = True
            user.save()

        membership = None
        if school:
            # Check there's no existing active membership for this user at this school
            existing_membership = SchoolMembership.all_objects.filter(
                user=user,
                school=school,
                status=SchoolMembership.Status.ACTIVE,
            ).first()
            if not existing_membership:
                membership = SchoolMembership.objects.create(
                    user=user,
                    school=school,
                    role=user.role,
                    status=SchoolMembership.Status.ACTIVE,
                )
            else:
                membership = existing_membership

        if user.role == 'student' and class_obj:
            enrolled_by = request.user if request else None
            if not Enrollment.objects.filter(student=user, class_obj=class_obj).exists():
                Enrollment.objects.create(
                    school=school or class_obj.school,
                    student=user,
                    class_obj=class_obj,
                    membership=membership,
                    enrolled_by=enrolled_by,
                    is_active=True,
                )
        return user

    def update(self, instance, validated_data):
        validated_data.pop('password', None)
        validated_data.pop('password2', None)
        validated_data.pop('class_obj', None)
        return super().update(instance, validated_data)

class UserListSerializer(serializers.ModelSerializer):
    school_name = serializers.SerializerMethodField()
    school_code = serializers.SerializerMethodField()
    school_theme = serializers.SerializerMethodField(read_only=True)
    membership_status = serializers.SerializerMethodField()
    school_history = SchoolMembershipSerializer(
        source='school_memberships', many=True, read_only=True
    )
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

    def get_has_active_enrollment(self, obj):
        if obj.role != 'student':
            return None
        return Enrollment.all_objects.filter(
            student=obj, 
            is_active=True
        ).exists()

    def get_school_name(self, obj):
        m = obj.active_membership
        return m.school.name if m else None

    def get_school_code(self, obj):
        m = obj.active_membership
        return m.school.code if m else None

    def get_membership_status(self, obj):
        m = obj.active_membership
        return m.status if m else 'unaffiliated'
    
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

class ProfileReadSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    service_number = serializers.CharField(source="user.svc_number", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)
    role = serializers.CharField(source="user.role", read_only=True)
    role_display = serializers.CharField(source="user.get_role_display", read_only=True)
    rank = serializers.CharField(source="user.rank", read_only=True)
    rank_display = serializers.CharField(source="user.get_rank_display", read_only=True, default=None)
    phone_number = serializers.CharField(source="user.phone_number", read_only=True)
    unit = serializers.CharField(source="user.unit", read_only=True)
    school_name = serializers.CharField(source="school.name", read_only=True, default=None)
    school_code = serializers.CharField(source="school.code", read_only=True, default=None)
    enrollment = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "service_number",
            "email",
            "role",
            "role_display",
            "rank",
            "rank_display",
            "phone_number",
            "unit",
            "school_name",
            "school_code",
            "enrollment",
            "bio",
            "created_at",
            "updated_at",
        ]
    
    def get_enrollment(self, obj):
        if obj.user.role != "student":
            return None

        enrollment = (
            Enrollment.all_objects.filter(student=obj.user, is_active=True)
            .select_related("class_obj", "class_obj__course")
            .first()
        )

        if not enrollment:
            return None

        return {
            "id": enrollment.id,
            "class_name": enrollment.class_obj.name,
            "course_name": enrollment.class_obj.course.name,
            "course_code": enrollment.class_obj.course.code,
            "enrollment_date": enrollment.enrollment_date,
            "is_active": enrollment.is_active,
        }

class ProfileUpdateSerializer(serializers.ModelSerializer):

    username = serializers.CharField(
        required=False,
        min_length=3,
        max_length=150,
        help_text="Updates the username on the User model.",
    )

    class Meta:
        model = Profile
        fields = [
            "username",
            "bio",
        ]

    def validate_username(self, value):

        request = self.context.get("request")
        current_user = request.user if request else None

        qs = User.all_objects.filter(username=value)
        if current_user:
            qs = qs.exclude(pk=current_user.pk)

        if qs.exists():
            raise serializers.ValidationError("This username is already taken.")
        return value

    def update(self, instance, validated_data):
        username = validated_data.pop("username", None)

        with transaction.atomic():
            instance = super().update(instance, validated_data)

            if username is not None and username != instance.user.username:
                instance.user.username = username
                instance.user.save(update_fields=["username"])

        return instance

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
                  'start_date', 'end_date', 'capacity', 'current_enrollment', 'enrollment_status', 'is_active', 'class_code']

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

    priority_display = serializers.CharField(
        source='get_priority_display', read_only=True,
    )
    created_by_name = serializers.SerializerMethodField(read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    is_read = serializers.SerializerMethodField()
    read_at = serializers.SerializerMethodField()

    class Meta:
        model = Notice
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'created_by')

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_is_read(self, obj):
        return getattr(obj, '_user_read_at', None) is not None

    def get_read_at(self, obj):
        return getattr(obj, '_user_read_at', None)

    def validate_expiry_date(self, value):
        if value and value < timezone.now():
            raise serializers.ValidationError("Expiry date cannot be in the past.")
        return value

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
    student_rank = serializers.SerializerMethodField(read_only=True)
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

    def get_student_rank(self, obj):
        if obj.student and obj.student.rank:
            return obj.student.get_rank_display()
        return None

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
    subject_name = serializers.CharField(
        source='subject.name', read_only=True, allow_null=True,
    )
    created_by_name = serializers.SerializerMethodField(read_only=True)
    priority_display = serializers.CharField(
        source='get_priority_display', read_only=True,
    )
    is_expired = serializers.BooleanField(read_only=True)
    is_read = serializers.SerializerMethodField()
    read_at = serializers.SerializerMethodField()

    class Meta:
        model = ClassNotice
        fields = '__all__'
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_is_read(self, obj):
        return getattr(obj, '_user_read_at', None) is not None

    def get_read_at(self, obj):
        return getattr(obj, '_user_read_at', None)

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
                from dateutil import parser
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
        model = CertificateTemplate
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_effective_colors(self, obj):
        return obj.get_effective_colors()

    def get_has_logo(self, obj):
        logo = obj.get_effective_logo()
        return logo is not None and bool(logo.name)

    def get_has_signature(self, obj):
        return bool(obj.signature_image and obj.signature_image.name)

class CertificateSerializer(serializers.ModelSerializer):

    student_name = serializers.CharField(read_only=True)
    student_svc_number = serializers.CharField(read_only=True)
    student_rank = serializers.CharField(read_only=True)
    school_name = serializers.CharField(source='school.name', read_only=True)
    school_code = serializers.CharField(source='school.code', read_only=True)
    class_name = serializers.CharField(read_only=True)
    course_name = serializers.CharField(read_only=True)
    template_name = serializers.CharField(
        source='template.name', read_only=True, allow_null=True,
    )
    issued_by_name = serializers.SerializerMethodField(read_only=True)
    revoked_by_name = serializers.SerializerMethodField(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    is_valid = serializers.BooleanField(read_only=True)
    verification_url = serializers.CharField(read_only=True)
    download_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Certificate
        fields = '__all__'
        read_only_fields = [
            'id', 'certificate_number', 'verification_code',
            'student_name', 'student_svc_number', 'student_rank',
            'course_name', 'class_name',
            'created_at', 'updated_at',
            'download_count', 'last_downloaded_at',
            'view_count', 'last_viewed_at',
            'file_generated_at', 'issued_at',
        ]

    def get_issued_by_name(self, obj):
        return obj.issued_by.get_full_name() if obj.issued_by else None

    def get_revoked_by_name(self, obj):
        return obj.revoked_by.get_full_name() if obj.revoked_by else None

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
    issued_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Certificate
        fields = [
            'id', 'certificate_number', 'verification_code',
            'student_name', 'student_svc_number', 'student_rank',
            'course_name', 'class_name',
            'final_grade', 'final_percentage',
            'issued_at', 'completion_date',
            'status', 'status_display', 'is_valid',
            'school', 'school_name',
            'issued_by_name',
            'download_count', 'view_count',
        ]

    def get_issued_by_name(self, obj):
        return obj.issued_by.get_full_name() if obj.issued_by else None

class CertificateTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = CertificateTemplate
        fields = "__all__"
        
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
        max_digits=5, decimal_places=2, allow_null=True,
    )
    issued_at = serializers.DateTimeField()
    completion_date = serializers.DateField()
    status = serializers.CharField()
    status_display = serializers.CharField()
    revocation_reason = serializers.CharField(allow_blank=True, required=False)
    revoked_at = serializers.DateTimeField(allow_null=True, required=False)

class CertificateDownloadLogSerializer(serializers.ModelSerializer):

    certificate_number = serializers.CharField(
        source='certificate.certificate_number', read_only=True,
    )
    downloaded_by_name = serializers.SerializerMethodField(read_only=True)
    download_type_display = serializers.CharField(
        source='get_download_type_display', read_only=True,
    )

    class Meta:
        model = CertificateDownloadLog
        fields = '__all__'
        read_only_fields = ['id', 'downloaded_at']

    def get_downloaded_by_name(self, obj):
        return obj.downloaded_by.get_full_name() if obj.downloaded_by else 'Anonymous'

class CertificateStatsSerializer(serializers.Serializer):

    total_certificates = serializers.IntegerField()
    issued_count = serializers.IntegerField()
    revoked_count = serializers.IntegerField()
    total_downloads = serializers.IntegerField()
    total_views = serializers.IntegerField()
    certificates_this_month = serializers.IntegerField()
    certificates_this_year = serializers.IntegerField()

class InstructorMarksSerializer(serializers.ModelSerializer):

    class_index = serializers.SerializerMethodField()
    exam_title = serializers.CharField(source="exam.title", read_only=True)
    exam_total_marks = serializers.IntegerField(source="exam.total_marks", read_only=True)
    percentage = serializers.FloatField(read_only=True)
    grade = serializers.CharField(read_only=True)

    class Meta:
        model = ExamResult
        fields = [
            "id",           
            "class_index", 
            "exam_title",
            "exam_total_marks",
            "marks_obtained",
            "percentage",
            "grade",
            "remarks",
            "is_submitted",
            "graded_at",
        ]
        read_only_fields = [
            "id", "class_index", "exam_title", "exam_total_marks",
            "percentage", "grade", "graded_at",
        ]

    def get_class_index(self, obj):
        try:
            enrollment = Enrollment.all_objects.get(
                student=obj.student,
                class_obj=obj.exam.subject.class_obj,
            )
            index_number = enrollment.student_indexes.index_number
            return obj.exam.subject.class_obj.format_index(int(index_number))
        except (Enrollment.DoesNotExist, AttributeError, ValueError, TypeError):
            return None

    def validate_marks_obtained(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Marks cannot be negative.")
        exam_id = self.instance.exam_id if self.instance else None
        if exam_id:
            try:
                exam = Exam.objects.get(pk=exam_id)
                if value is not None and value > exam.total_marks:
                    raise serializers.ValidationError(
                        f"Marks ({value}) exceed total marks ({exam.total_marks})."
                    )
            except Exam.DoesNotExist:
                pass
        return value

class AdminMarksSerializer(serializers.ModelSerializer):

    student_full_name = serializers.SerializerMethodField()
    student_svc_number = serializers.CharField(source="student.svc_number", read_only=True)
    student_rank = serializers.CharField(source="student.rank", read_only=True)
    class_index = serializers.SerializerMethodField()
    exam_title = serializers.CharField(source="exam.title", read_only=True)
    exam_total_marks = serializers.IntegerField(source="exam.total_marks", read_only=True)
    subject_name = serializers.CharField(source="exam.subject.name", read_only=True)
    class_name = serializers.CharField(source="exam.subject.class_obj.name", read_only=True)
    percentage = serializers.FloatField(read_only=True)
    grade = serializers.CharField(read_only=True)
    graded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ExamResult
        fields = [
            "id",
            "student",           
            "student_full_name",
            "student_svc_number",
            "student_rank",
            "class_index",
            "exam",
            "exam_title",
            "exam_total_marks",
            "subject_name",
            "class_name",
            "marks_obtained",
            "percentage",
            "grade",
            "remarks",
            "is_submitted",
            "submitted_at",
            "graded_by",
            "graded_by_name",
            "graded_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "percentage", "grade", "submitted_at", "graded_by",
            "graded_at", "created_at", "updated_at",
        ]

    def get_student_full_name(self, obj):
        return obj.student.get_full_name()

    def get_class_index(self, obj):
        try:
            enrollment = Enrollment.all_objects.get(
                student=obj.student,
                class_obj=obj.exam.subject.class_obj,
            )
            index_number = enrollment.student_indexes.index_number
            return obj.exam.subject.class_obj.format_index(int(index_number))
        except (Enrollment.DoesNotExist, AttributeError, ValueError, TypeError):
            return None

    def get_graded_by_name(self, obj):
        return obj.graded_by.get_full_name() if obj.graded_by else None

    def validate_marks_obtained(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Marks cannot be negative.")
        if self.instance and value is not None:
            if value > self.instance.exam.total_marks:
                raise serializers.ValidationError(
                    f"Marks ({value}) exceed total marks "
                    f"({self.instance.exam.total_marks})."
                )
        return value

class AdminStudentIndexRosterSerializer(serializers.ModelSerializer):

    student_full_name = serializers.SerializerMethodField()
    student_svc_number = serializers.CharField(
        source="enrollment.student.svc_number", read_only=True
    )
    student_rank = serializers.CharField(
        source="enrollment.student.rank", read_only=True
    )
    class_name = serializers.CharField(source="class_obj.name", read_only=True)
    enrollment_date = serializers.DateTimeField(
        source="enrollment.enrollment_date", read_only=True
    )
    is_active = serializers.BooleanField(
        source="enrollment.is_active", read_only=True
    )

    class Meta:
        model = StudentIndex
        fields = [
            "id",
            "index_number",
            "formatted_index",
            "class_name",
            "student_full_name",
            "student_svc_number",
            "student_rank",
            "enrollment_id",
            "enrollment_date",
            "is_active",
            "assigned_to",
        ]

    def get_student_full_name(self, obj):
        return obj.enrollment.student.get_full_name()


    def get_formatted_index(self, obj):                                  
            try:
                return obj.class_obj.format_index(int(obj.index_number))
            except (ValueError, TypeError):
                return obj.index_number