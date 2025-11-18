from django.shortcuts import render
from rest_framework import viewsets, status, filters
from .models import User, Course, Class, Enrollment, Subject, Notice
from .serializers import UserSerializer, CourseSerializer, ClassSerializer, EnrollmentSerializer, SubjectSerializer, NoticeSerializer, UserListSerializer
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import SessionAuthentication, TokenAuthentication
from django.utils import timezone
from django.db.models import Q, Count
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from .permissions import IsAdmin

class UserViewSet(viewsets.ModelViewSet):

    queryset = User.objects.all()
    permission_classes = [IsAdmin, IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'role']
    search_fields = ['username', 'email', 'first_name', 'last_name']
    ordering_fields = ['created_at', 'username', 'email', 'role']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return UserListSerializer
        return UserSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == 'list':
            return queryset.only(
                'id', 'username', 'email', 'first_name', 'last_name', 'role', 'is_active', 'created_at'
            )
        return queryset
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def instructors(self, request):
        instructors = User.objects.filter(role='instructor', is_active=True).order_by('first_name', 'last_name')
        serializer = UserListSerializer(instructors, many=True)
        return Response({
            'count': instructors.count(),
            'results': serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def students(self, request):
        students = User.objects.filter(role='student', is_active=True).order_by('first_name', 'last_name')
        serializer = UserListSerializer(students, many=True)
        return Response({
            'count': students.count(),
            'results': serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def commandants(self, request):
        commandants = User.objects.filter(role='commandant', is_active=True).order_by('first_name', 'last_name')
        serializer = UserListSerializer(commandants, many=True)
        return Response({
            'count': commandants.count(),
            'results': serializer.data
        })
    @action(detail=False, methods=['get'])
    def stats(self, request):
        stats = {
            'total_users': User.objects.count(),
            'active_users': User.objects.filter(is_active=True).count(),
            'by_role': {
                'admins': User.objects.filter(role='admin').count(),
                'instructors': User.objects.filter(role='instructor').count(),
                'students': User.objects.filter(role='student').count(),
                'commandants': User.objects.filter(role='commandant').count(),
            },
            'active_by_role': {
                'admins': User.objects.filter(role='admin', is_active=True).count(),
                'instructors': User.objects.filter(role='instructor', is_active=True).count(),
                'students': User.objects.filter(role='student', is_active=True).count(),
                'commandants': User.objects.filter(role='commandant', is_active=True).count(),
            }
        }

        return Response(stats)
    
    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        user = self.get_object()

        if user == request.user:
            return Response(
                {'error': 'You cannot deactivate your own account.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        user.is_active = False
        user.save()
        return Response({
            'status': 'success',
            'message': f'User {user.username} has been deactivated'
        })
    @action(detail=True, methods=['post'])
    def reset_password(self, request, pk=None):
        user = self.get_object()
        new_password = request.data.get('new_password')

        if not new_password:
            return Response(
                {'error': 'New password is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        user.set_password(new_password)
        user.save()

        return Response({
            'status': 'success',
            'message': f'Password for user {user.username} has been reset'  
        })
    

class CourseViewSet(viewsets.ModelViewSet):

    queryset = Course.objects.all()
    serializer_class = CourseSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = []
    search_fields = ['name', 'description', 'code']
    ordering_fields = ['created_at', 'name']
    ordering = ['-created_at']


    def get_queryset(self):

        return Course.objects.annotate(
            classes_count=Count('classes', distinct=True)
        )
    
    def perform_create(self, serializer):
        serializer.save()

    @action(detail=True, methods=['get'])
    def classes(self, request, pk=None):
        course = self.get_object()
        classes_qs = course.classes.filter(is_active=True)
        serializer = ClassSerializer(classes_qs, many=True)
        return Response(
            {
                'count':classes_qs.count(),
                'results':serializer.data
            }
        )
    
    @action(detail=True, methods=['get'])
    def stats(self, request):

        has_is_active = any(f.name == 'is_active' for f in Course._meta.get_fields())
        total_courses = Course.objects.count()
        active_courses = Course.objects.filter(is_active=True).count() if has_is_active else total_courses
        inactive_courses = Course.objects.filter(is_active=False).count() if has_is_active else 0
        active_classes = Course.objects.filter(is_active=True).count()

        stats ={
            'total_courses': total_courses,
            'active_courses': active_courses,  
            'inactive_courses': inactive_courses,
            'total_classes': total_courses,
            'active_classes': active_classes
        }

        return Response(stats)
    
class ClassViewSet(viewsets.ModelViewSet):

    queryset = Class.objects.select_related('course', 'instructor').all()
    permission_classes = [IsAuthenticated, IsAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'course', 'instructor']
    search_fields = ['name', 'course__name', 'instructor__first_name']
    ordering_fields = ['created_at', 'name', 'start_date']
    ordering = ['-created_at']

    def get_serializer_class(self):

        if self.action == 'list':
            return ClassSerializer
        return ClassSerializer
    
    def get_queryset(self):
        
        return super().get_queryset().annotate(
            enrollment_count= Count('enrollments', filter=Q(enrollments__is_active=True, distinct=True))
        )
    def perform_create(self, serializer):
        serializer.save()

    @action(detail=True, methods=['get'])
    def subjects(self, request, pk=None):
        class_obj = self.get_object()
        subjects = class_obj.subjects.select_related('instructor').filter(is_active=True)
        serializer = SubjectSerializer(subjects, many=True)
        return Response({
            'class': ClassSerializer(class_obj).data,
            'count': subjects.count(),
            'subjects': serializer.data
        })
    
    @action(detail=True, methods=['get'])
    def enrolled_students(self, request, pk=None):
        class_obj = self.get_object()
        enrollments = class_obj.enrollments.filter(is_active=True).select_related('student', 'enrolled_by')
        serializer = EnrollmentSerializer(enrollments, many=True)
        return Response({
            'class': ClassSerializer(class_obj).data,
            'count': enrollments.count(),
            'enrollments': serializer.data,
            'capacity': class_obj.capacity,
            'available_slots': class_obj.capacity - enrollments.count()
        })
    
    @action(detail=True, methods=['post'])
    def assign_instructor(self, request, pk=None):
        class_obj = self.get_object()
        instructor_id = request.data.get('instructor_id')

        if not instructor_id:
            return Response(
                {'error': 'instructor_id is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            instructor = User.objects.get(id=instructor_id, role='instructor', is_active=True)
            class_obj.instructor = instructor
            class_obj.save()

            return Response({
                'status': 'success',
                'message':f'Instructor {instructor.get_full_name()} has been assigned to class {class_obj.name}',
                'class':ClassSerializer(class_obj).data
            })
        except User.DoesNotExist:
            return Response(
                {'error': 'Instructor not found or not active.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
    @action(detail=True, methods=['post'])
    def remove_instructor(self, request, pk=None):
        class_obj = self.get_object()
        class_obj.instructor = None
        class_obj.save()

        return Response({
            'status': 'success',
            'message':f'instructor has been removed from class {class_obj.name}',
            'class':ClassSerializer(class_obj).data
        })
    

    @action(detail=False, methods=['get'])
    def without_instructor(self, request):
        classes = self.get_queryset().filter(instructor__isnull=True, is_active=True)
        serializer = ClassListSerializer(classes, many=True)
        return Response({
            'count':classes.count(),
            'results': serializer.data
        })
    

class SubjectViewSet(viewsets.ModelViewSet):

    queryset = Subject.objects.select_related('class_obj', 'instructor').all()
    serializer_class = SubjectSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'class_obj', 'instructor'] 
    search_fields = ['name', 'class_obj__name', 'instructor__first_name']
    ordering_fields = ['created_at', 'name', 'start_date']
    ordering = ['-created_at']


    def perform_create(self, serializer):
        serializer.save()

    @action(detail=True, methods=['post'])
    def assign_instructor(self, request, pk=None):
        subject = self.get_object()
        instructor_id = request.data.get('instructor_id')


        if not instructor_id:
            return Response(
                {'error': 'instructor_id is required.'},
                status = status.HTTP_400_BAD_REQUEST
            )
        
        try:
            instructor = User.objects.get(id=instructor_id, role='instructor', is_active=True)
            subject.instructor = instructor
            subject.save()

            return Response(
                {
                    'status':'success',
                    'message':f'Instructor {instructor.get_full_name()} assigned to subject {subject.name}',
                    'subject': SubjectSerializer(subject).data
                }
            )
        except User.DoesNotExist:
            return Response(
                {
                    'error': 'Active instructor not found.'
                },
                status=status.HTTP_400_BAD_REQUEST
            )
    @action(detail=True, methods=['post'])
    def remove_instructor(self, request, pk=None):

        subject = self.get_object()
        subject.instructor = None
        subject.save()


        return Response({
            'status': 'success',
            'message':f'instructor has been removed from subject {subject.name}',
            'subject': SubjectSerializer(subject).data
        })
    
    @action(detail=False, methods=['get'])
    def by_class(self, request):
        class_id = request.query_params.get('class_id')
        if not class_id:
            return Response(
                {
                    'error': 'class_id parameter is required'
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        subjects = self.get_queryset().filter(class_obj_id=class_id, is_active=True)
        serializer = self.get_serializer(subjects, many=True)
        return Response({
            'count': subjects.count(),
            'results': serializer.data
        })
    

class NoticeViewSet(viewsets.ModelViewSet):
    queryset = Notice.objects.select_related('created_by').all()
    serializer_class = NoticeSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'priority']
    search_fields = ['title', 'description']
    ordering = ['-created_at']
    ordering_fields = ['created_at', 'title', 'priority']


    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:

            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated]
    

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


    @action(detail=False, methods=['get'])
    def active(self, request):
        active_notices = self.get_queryset().filter(
            Q(is_active=True) | 
            Q(expiry_date__isnull=True) |
            Q(expiry_date__gte=timezone.now())
        )
        serializer = self.get_serializer(active_notices, many=True)
        return Response({
            'count':active_notices.count(),
            "results": serializer.data
        })

    @action(detail=False, methods=['get'])
    def urgent(self, request):
        urgent_notices = self.get_queryset().filter(priority='urgent', is_active=True).filter(
            Q(expiry_date__isnull=True) |
            Q(expiry_date__gte=timezone.now())

        )
        serializer = self.get_serializer(urgent_notices, many=True)
        return Response({
            'count': urgent_notices.count(),
            'results': serializer.data
        })

    @action(detail=False, methods=['get'])
    def by_priority(self, request):
        priority_param = request.query_params.get('priority')
        if not priority_param:
            return Response(
                {'error': 'priority parameter is required'},
                status= status.HTTP_400_BAD_REQUEST
            )
        
        notices = self.get_queryset().filter(
            priority = priority_param,
            is_active = True
        ).filter(
            Q(expiry_date__isnull=True) |
            Q(expirty_date__gte=timezone.now())
        )
        serializer = self.get_serializer(notices, many=True)
        return Response({
            'count': notices.count(),
            'results': serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def expired(self, request):
        """Get all expired notices (Admin only)"""
        if request.user.role != 'admin':
            return Response(
                {'error': 'Admin access required'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        expired_notices = self.get_queryset().filter(
            expiry_date__lt=timezone.now()
        )
        serializer = self.get_serializer(expired_notices, many=True)
        return Response({
            'count': expired_notices.count(),
            'results': serializer.data
        })

class EnrollmentViewSet(viewsets.ModelViewSet):

    queryset = Enrollment.objects.select_related('student', 'class_obj', 'enrolled_by').all()
    serializer_class = EnrollmentSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['student', 'class_obj', 'is_active']
    search_fields = ['student__username', 'student__email', 'class_obj__class_code', 'class_obj__name']
    ordering_fields = ['enrollment_date', 'completion_date']
    ordering = ['-enrollment_date']
    
    def perform_create(self, serializer):
      
        serializer.save(enrolled_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
     
        enrollment = self.get_object()
        
        if enrollment.completion_date:
            return Response(
                {'error': 'Enrollment already marked as completed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        enrollment.completion_date = timezone.now().date()
        enrollment.save()
        
        return Response({
            'status': 'success',
            'message': 'Enrollment marked as completed',
            'enrollment': EnrollmentSerializer(enrollment).data
        })
    
    @action(detail=True, methods=['post'])
    def withdraw(self, request, pk=None):
        
        enrollment = self.get_object()
        
        if not enrollment.is_active:
            return Response(
                {'error': 'Enrollment is already inactive'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        enrollment.is_active = False
        enrollment.save()
        
        return Response({
            'status': 'success',
            'message': f'Student withdrawn from {enrollment.class_obj.name}',
            'enrollment': EnrollmentSerializer(enrollment).data
        })
    
    @action(detail=True, methods=['post'])
    def reactivate(self, request, pk=None):
     
        enrollment = self.get_object()
        
        if enrollment.is_active:
            return Response(
                {'error': 'Enrollment is already active'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
   
        if enrollment.class_obj.current_enrollment >= enrollment.class_obj.capacity:
            return Response(
                {'error': 'Class is at full capacity'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        enrollment.is_active = True
        enrollment.save()
        
        return Response({
            'status': 'success',
            'message': 'Enrollment reactivated',
            'enrollment': EnrollmentSerializer(enrollment).data
        })
    
    @action(detail=False, methods=['get'])
    def by_student(self, request):
    
        student_id = request.query_params.get('student_id')
        if not student_id:
            return Response(
                {'error': 'student_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        enrollments = self.get_queryset().filter(student_id=student_id)
        serializer = self.get_serializer(enrollments, many=True)
        return Response({
            'count': enrollments.count(),
            'active': enrollments.filter(is_active=True).count(),
            'completed': enrollments.filter(completion_date__isnull=False).count(),
            'results': serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def by_class(self, request):

        class_id = request.query_params.get('class_id')
        if not class_id:
            return Response(
                {'error': 'class_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        enrollments = self.get_queryset().filter(class_obj_id=class_id)
        serializer = self.get_serializer(enrollments, many=True)
        return Response({
            'count': enrollments.count(),
            'active': enrollments.filter(is_active=True).count(),
            'completed': enrollments.filter(completion_date__isnull=False).count(),
            'results': serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def stats(self, request):
  
        stats = {
            'total_enrollments': Enrollment.objects.count(),
            'active_enrollments': Enrollment.objects.filter(is_active=True).count(),
            'completed_enrollments': Enrollment.objects.filter(completion_date__isnull=False).count(),
            'withdrawn_enrollments': Enrollment.objects.filter(is_active=False, completion_date__isnull=True).count(),
        }
        return Response(stats)