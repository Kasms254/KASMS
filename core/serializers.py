from rest_framework import serializers
from .models import User, Course, Class, Enrollment, Subject, Notice, Exam, ExamReport, Attendance, ExamResult, ClassNotice, ExamAttachment
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
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'full_name', 'role', 'role_display', 'svc_number', 'phone_number', 'is_active', 'created_at', 'updated_at', 'class_name', 'rank']
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
    enrollment_status = serializers.CharField(read_only=True)
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
    instructor_svc_number = serializers.CharField(source='instructor.svc_number', read_only=True)
    instructor_rank = serializers.CharField(source='instructor.rank', read_only=True)
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
    
    def validate_subject_code(self, value):
        if not value:
            return value
        
        if self.instance:
            if Subject.objects.exclude(pk=self.instance.pk).filter(subject_code=value).exists():
                raise serializers.ValidationError("This subject code is already in use.")
        else:
            if Subject.objects.filter(subject_code=value).exists():
                raise serializers.ValidationError("This subject code is already in use.")
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
        return obj.expiry_date < timezone.now().date()
    
    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None
    

    def validate_expiry_date(self, value):
    
        if value:
            from django.utils import timezone
            if value < timezone.now().date():
                raise serializers.ValidationError("Expiry date cannot be in the past.")
        return value
    

class EnrollmentSerializer(serializers.ModelSerializer):

    student_name = serializers.SerializerMethodField(read_only=True)
    student_svc_number = serializers.CharField(source='student.svc_number', read_only=True)
    student_rank = serializers.CharField(source='student.rank', read_only=True)
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

        enrollment_count = class_obj.enrollments.filter(is_active=True).count()

        if enrollment_count >= class_obj.capacity:
            raise serializers.ValidationError({
                "class_obj": f"Class '{class_obj.name}' is at full capacity."
            })
        
        if Enrollment.objects.filter(student=student, class_obj=class_obj).exists():
            raise serializers.ValidationError({
                "student": f"Student '{student.get_full_name()}' is already enrolled in class '{class_obj.name}'."
            })
        
        return attrs
    
class ExamAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamAttachment
        fields = "__all__"
        read_only_fields = ('created_at', 'updated_at', 'created_by', 'id','uploaded_by')


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
        read_only_fields = ('created_at', 'updated_at','uploaded_by','average_score', 'id')
        extra_kwargs = {
            'exam_type':{'required': True},
            'title':{'required': True},
            'subject':{'required': True},
            'exam_date':{'required': True},
            'total_marks':{'required': True}
        }

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None
    
    def validate_exam_date(self, value):
        from django.utils import timezone
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
                raise serializers.ValidationError(
                    "There is already an active Final Exam for this subject"
                )
            return data

    
    
class ExamResultSerializer(serializers.ModelSerializer):

    student_name = serializers.CharField(source='student.get_full_name', read_only=True)
    student_svc_number = serializers.CharField(source='student.svc_number', read_only=True)
    exam_title = serializers.CharField(source='exam.title', read_only=True)
    exam_total_marks = serializers.IntegerField(source='exam.total_marks', read_only=True)
    graded_by_name = serializers.SerializerMethodField(read_only=True)
    percentage = serializers.FloatField(read_only=True)
    grade = serializers.CharField(read_only=True)


    class Meta:
        model = ExamResult
        fields = '__all__'
        read_only_fields = ('graded_at', 'percentage', 'grade')
    
    def get_graded_by_name(self, obj):
        return obj.graded_by.get_full_name() if obj.graded_by else None
    
    def validate_marks_obtained(self, value):
        if value is not None:
            exam = self.instance.exam if self.instance else self.initial_data.get('exam')
            if exam and value > exam.total_marks:
                raise serializers.ValidationError("Marks obtained cannot exceed total marks for the exam.")
        return value
    

    def update(self, validated_data, instance):

        if 'marks_obtained' in validated_data and validated_data['marks_obtained'] is not None:
            validated_data['graded_by'] = self.context['request'].user
            from django.utils import timezone
            validated_data['graded_at'] = timezone.now()
            validated_data['is_submitted'] = True
            if not validated_data.get('submitted_at'):
                validated_data['submitted_at'] = timezone.now()
        return super().update(instance, validated_data)
    
    

    def update(self, validated_data, instance):

        if 'marks_obtained' in validated_data and validated_data['marks_obtained'] is not None:
            validated_data['graded_by'] = self.context['request'].user
            from django.utils import timezone
            validated_data['graded_at'] = timezone.now()
            validated_data['is_submitted'] = True
            if not validated_data.get('submitted_at'):
                validated_data['submitted_at'] = timezone.now()
        return super().update(instance, validated_data)
    

class BulkExamResultSerializer(serializers.Serializer):

    results = serializers.ListField(
        child = serializers.DictField(),
        allow_empty = False,
    
    )

    def validate_results(self, value):
        for result in value:
            if 'student_id' not in result:
                raise serializers.ValidationError("Each result must include 'student_id'.")
            if 'marks_obtained' not in result:
                raise serializers.ValidationError("Each result must include 'marks_obtained'.")
        return value
    

class AttendanceSerializer(serializers.ModelSerializer):

    student_name = serializers.CharField(source = 'student.get_full_name', read_only=True)
    student_svc_number = serializers.CharField(source='student.svc_number', read_only=True)
    class_name = serializers.CharField(source='class_obj.name', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    marked_by_name = serializers.SerializerMethodField(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Attendance
        fields = '__all__'
        read_only_fields = ('marked_by', 'id', 'created_at', 'updated_at')

    def get_marked_by_name(self, obj):
        return obj.marked_by.get_full_name() if obj.marked_by else None
    
    def validate(self, attrs):
        student = attrs.get('student')
        class_obj = attrs.get('class_obj')

        if student and class_obj:
            from .models import Enrollment
            if not Enrollment.objects.filter(
                student = student,
                class_obj = class_obj,
                is_active = True
            ).exists():
                raise serializers.ValidationError({
                    "student": "Student is not enroled in this clas."
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
        for record in value:
            if 'student_id' not in record:
                raise serializers.ValidationError("Each record must have a student id")
            if 'status' not in record:
                raise serializers.ValidationError("Each record must have a status")
            if record['status'] not in ['present', 'absent', 'late', 'excused']:
                raise serializers.ValidationError(f"Invalid status:{record['status']}")

        return value
    

class ClassNotificationSerializer(serializers.ModelSerializer):

    class_name = serializers.CharField(source='class_obj.name', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    created_by_name = serializers.SerializerMethodField(read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)


    class Meta:
        model = ClassNotice
        fields = '__all__'
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']


    def get_created_by_name(self, obj):
        if isinstance(obj, ClassNotice):
            return obj.created_by.get_full_name() if obj.created_by else None
        return None
    

class ExamReportSerializer(serializers.ModelSerializer):

    subject_name = serializers.CharField(source='subject.name', read_only=True
                                         )
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
            raise serializers.ValidationError("At least one exam must be selected")
        
        subject_ids =set(exam.subject_id for exam in value)

        if len(subject_ids) > 1:
            raise serializers.ValidationError(
                "ALl Exams must belong to the same subject"
            )
        
        return value
    
    
    