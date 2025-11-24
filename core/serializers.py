from rest_framework import serializers
from .models import User, Course, Class, Enrollment, Subject, Notice
from django.contrib.auth.password_validation import validate_password

class UserSerializer(serializers.ModelSerializer):

    password = serializers.CharField(write_only=True, required=True, validators=[validate_password],style={'input_type': 'password'})
    password2 = serializers.CharField(write_only=True, required=True, label= 'Confirm password',style={'input_type': 'password'})
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

        if role  == 'student' and class_obj:
            if class_obj.current_enrollment >= class_obj.capacity:
                raise serializers.ValidationError({
                    "class_obj": f"Class '{class_obj.name}' is at full capacity."
                })
            
        return attrs
    
    def validate_email(self, value):

        if self.instance:
            if User.objects.exclude(pk=self.instance.pk).filter(email=value).exists():
                raise serializers.ValidationError("This email is already in use.")
        else:
            if User.objects.filter(email=value).exists():
                raise serializers.ValidationError("This email is already in use.")
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

            if not Enrollment.objects.filter(student=user, class_obj=class_obj).exists():
                Enrollment.objects.create(
                    student=user,
                    class_obj=class_obj,
                    enrolled_by = enrolled_by,
                    is_active = True
                )
        return user

    def update(self, instance, validated_data):

        validated_data.pop('password', None)
        validated_data.pop('password2', None)
        validated_data.pop('class_obj', None)
        validated_data.pop('class_name', None)
        return super().update(instance, validated_data)
    

class UserListSerializer(serializers.ModelSerializer):

    role_display = serializers.CharField(source='get_role_display', read_only=True)
    full_name = serializers.SerializerMethodField()
    class_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'full_name', 'role', 'role_display', 'svc_number', 'phone_number', 'is_active', 'created_at', 'updated_at', 'class_name']
        read_only_fields = ('created_at', 'updated_at')
    
    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}"
    
    def get_class_name(self, obj):
        if obj.role == 'student':
            enrollment = Enrollment.objects.filter(
                student = obj,
                is_active = True
            ).select_related('class_obj').first()

            if enrollment and enrollment.class_obj:
                return enrollment.class_obj.name
        return None
        
class CourseSerializer(serializers.ModelSerializer):
    total_classes = serializers.IntegerField(source='classes.count', read_only=True)

    class Meta:
        model = Course
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'total_classes')
    
    def validate_code(self, value):
        if self.instance:
            if Course.objects.exclude(pk=self.instance.pk).filter(code=value).exists():
                raise serializers.ValidationError("This course code is already in use.")
        else:
            if Course.objects.filter(code=value).exists():
                raise serializers.ValidationError("This course code is already in use.")
        return value
    

class ClassSerializer(serializers.ModelSerializer):
    course_name = serializers.CharField(source='course.name', read_only=True)
    course_code = serializers.CharField(source='course.code', read_only=True)
    instructor_name = serializers.SerializerMethodField(read_only=True)
    current_enrollment = serializers.IntegerField(read_only=True)
    subjects_count = serializers.IntegerField(source='subjects.count', read_only=True)

    class Meta:
        model = Class
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'current_enrollment')

    def get_instructor_name(self, obj):
        return obj.instructor.get_full_name() if obj.instructor else "Not Assigned"
    
    def validate_class_code(self, value):
        if self.instance:
            if Class.objects.exclude(pk=self.instance.pk).filter(class_code=value).exists():
                raise serializers.ValidationError("This class name is already in use.")
        else:
            if Class.objects.filter(class_code=value).exists():
                raise serializers.ValidationError("This class name is already in use.")
        return value
    
    def validate(self, attrs):
        start_date = attrs.get('start_date', self.instance.start_date if self.instance else None)
        end_date = attrs.get('end_date', self.instance.end_date if self.instance else None)
        instructor = attrs.get('instructor', self.instance.instructor if self.instance else None)

        if end_date and start_date and end_date <= start_date:
            raise serializers.ValidationError({
                "end_date": "End date cannot be earlier than start date."})
        
        if instructor and instructor.role != 'instructor':
            raise serializers.ValidationError({
                "instructor": "Assigned instructor must have the role of 'instructor'."})

        return attrs
    

class SubjectSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source='class_obj.name', read_only=True)
    instructor_name = serializers.SerializerMethodField(read_only=True)
    class_code = serializers.CharField(source='class_obj.class_code', read_only=True)
    course_name = serializers.CharField(source='class_obj.course.name', read_only=True)

    class Meta:
        model = Subject
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')

    def get_instructor_name(self, obj):
        return obj.instructor.get_full_name() if obj.instructor else "Not Assigned"
    
    def validate(self, value):
        if self.instance:
            if Subject.objects.exclude(pk=self.instance.pk).filter(subject_code=value).exists():
                raise serializers.ValidationError("This subject name is already in use.")
            else:
                if Subject.objects.filter(subject_code=value).exists():
                    raise serializers.ValidationError("This subject name is already in use.")
        return value
    
    def validate_instructor(self, value):
        if value.role != 'instructor':
            raise serializers.ValidationError("Assigned instructor must have the role of 'instructor'.")
        return value
    
class NoticeSerializer(serializers.ModelSerializer):

    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    is_expired = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Notice
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'created_by', 'is_expired')

    def get_is_expired(self, obj):
        if not obj.expiry_date:
            return False
        from django.utils import timezone
        return obj.expiry_date < timezone.now()
    
    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None
    

    def valiate_expiry_date(self, value):
    
        if value:
            from django.utils import timezone
            if value < timezone.now().date():
                raise serializers.ValidationError("Expiry date cannot be in the past.")
        return value
    

class EnrollmentSerializer(serializers.ModelSerializer):

    student_name = serializers.SerializerMethodField(read_only=True)
    class_name = serializers.CharField(source='class_obj.name', read_only=True)
    class_code = serializers.CharField(source='class_obj.class_code', read_only=True)
    course_name = serializers.CharField(source='class_obj.course.name', read_only=True)
    student_email = serializers.CharField(source='student.email', read_only=True)

    class Meta:
        model = Enrollment
        fields = '__all__'
        read_only_fields = ('enrollment_date',)

    def get_student_name(self, obj):
        return obj.student.get_full_name() if obj.student else "N/A"
    
    def validate_student(self, value):
        if value.role != 'student':
            raise serializers.ValidationError("Enrolled user must have the role of 'student'.")
        return value
    

    def validate(self, attrs):
        class_obj = attrs.get('class_obj')
        student = attrs.get('student')

        if self.instance:
            return attrs

        if class_obj.current_enrollment >= class_obj.capacity:
            raise serializers.ValidationError("Class capacity has been reached.")
        
        if Enrollment.objects.filter(student=student, class_obj=class_obj).exists():
            raise serializers.ValidationError("This student is already enrolled in the selected class.")
        
        return attrs