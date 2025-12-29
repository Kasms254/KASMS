from django.shortcuts import render
from rest_framework import viewsets, status, filters
from .models import User, Course, Class, Enrollment, Subject, Notice, Exam, ExamReport, Attendance, ExamResult, ClassNotice, ExamAttachment,School
from .serializers import UserSerializer, CourseSerializer,SchoolStatsSerializer, SchoolUpdateSerializer,SchoolDetailSerializer, SchoolPublicSerializer, SchoolThemeSerializer, ClassSerializer, EnrollmentSerializer,SchoolCreateSerializer, SubjectSerializer, NoticeSerializer,BulkAttendanceSerializer, UserListSerializer, ClassNotificationSerializer, ExamReportSerializer, ExamResultSerializer, AttendanceSerializer, ExamSerializer, BulkExamResultSerializer,ExamAttachmentSerializer
from rest_framework.authentication import SessionAuthentication, TokenAuthentication
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.db.models import Q, Count, Avg
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from .permissions import IsAdmin, IsAdminOrInstructor, IsInstructor, IsInstructorofClass,IsStudent
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

# school
class SchoolViewset(viewsets.ModelViewSet):
    queryset = School.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'subdomain']
    ordering_fields = ['created_at', 'name']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return SchoolCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return SchoolUpdateSerializer
        elif self.action == 'theme':
            return SchoolThemeSerializer
        elif self.action in ['list', 'by_subdomain']:
            return SchoolPublicSerializer
        else:
            return SchoolDetailSerializer

    def get_permissions(self):

        if self.action in ['theme', 'by_subdomain']:
            return [AllowAny()]
        
        elif self.action in ['create', 'destroy', 'list']:
            return [IsAuthenticated(), IsAdmin()]

        elif self.action in ['update', 'partial_update']:

            return [IsAuthenticated(), IsAdmin()]

        else:
            return [IsAuthenticated()]
        
    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if user.is_authenticated and user.is_superuser:
            return queryset

        if user.is_authenticated and user.school:
            return queryset.filter(id=user.school.id)

        return queryset.none()


    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def by_subdomain(self, request):
        
        subdomain = request.query_params.get('subdomain')

        if not subdomain:
            return Response({
                'error': 'subdomain parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            school = School.objects.get(subdomain=subdomain, is_active=True)
            serializer = self.get_serializer(school)

            return Response(serializer.data)

        except School.DoesNotExist:
            return Response({
                'error': 'school not found',
                'subdomain':subdomain
            }, status=status.HTTP_404_NOT_FOUND)

    
    @action(detail=True, methods=['get'], permission_classes=[AllowAny])
    def theme(self, request, pk=None):

        school = self.get_object()
        serializer = SchoolThemeSerializer(school)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):

        school = self.get_object()

        if request.user.role != 'admin' or request.user.school.id != school.id:
            return Response({
                'error':'Only school administrators can view stats'
                            }, 
                            status=status.HTTP_403_FORBIDDEN)

        users = User.objects.filter(school=school)

        stats ={
            'total_students':users.filter(role='student').count(),
            'total_instructors':users.filter(role='instructor').count(),
            'total_admins':users.filter(role='admin').count(),
            'total_users':users.count(),
            'active_students':users.filter(role='student', is_active=True).count(),
            'active_instructors':users.filter(role='instructor', is_active=True).count(),
            'total_courses':Course.objects.filter(school=school, is_active=True).count(),
            'total_classes':Class.objects.filter(school=school, is_active=True).count(),
            'active_enrollments':Enrollment.objects.filter(school=school, is_active=True).count(),
            'total_exams':Exam.objects.filter(school=school, is_active=True).count(),

        }

        serializer = SchoolStatsSerializer(stats)

        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def update_theme(self, request, pk=None):

        school = self.get_object()

        if request.user.role != 'admin' or request.user.school.id != school.id:
            return Response({
                'error': 'Only School administrators can update theme'
            }, status=status.HTTP_403_FORBIDDEN)

        serializer = SchoolThemeSerializer(school, data=request.data, partial=True)

        if serializer.is_valid():
            serializer.save()

            return Response({
                'status':'success',
                'message':'School theme update successfully',
                'data':serializer.data
            })

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


    @action(detail=True, methods=['get'])
    def users (self, request, pk=None):
        school = self.get_object()

        if request.user.role != 'admin' or request.user.school.id != school.id:
            return Response({
                'error': 'Only school adminstrators can view users'
            }, status=status.HTTP_403_FORBIDDEN)

        users = User.objects.filter(school=school)

        role = request.query_params.get('role')
        if role:
            users = users.filter(role=role)


        is_active = request.query_params.get('is_active')
        if is_active is not None:
            users = users.filter(is_active=is_active.lower() == 'true')

        from core.serializers import UserListSerializer
        serializer = UserListSerializer(users, many=True)

        return Response({
            'count': users.count(),
            'results': serializer.data
        })


    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):

        if not request.user.is_superuser:
            return Response({
                'error': 'Only platform admins can deactivate schools'
            }, status=status.HTTP_403_FORBIDDEN)

        school = self.get_object()
        school.is_active = False
        school.save()


        User.objects.filter(school=school).update(is_active=False)

        return Response({
            'status':'success',
            'message':f'School {school.name} has been deactivated'
        })

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):

        if not request.user.is_superuser:
            return Response({
                'error': 'Only platform administrators can Add users'
            }, status=status.HTTP_403_FORBIDDEN)

        school = self.get_object()
        school.is_active = True
        school.save()

        return Response({
            'status': 'success',
            'message':f'School {school.name} has been activated'
        })

    def destroy (self, request, *args,**kwargs):
        return Response({
            'error':'Schools cannot be deleted. Use deactivate instead'
        }, status = status.HTTP_400_BAD_REQUEST)



class CurrentSchoolViewSet(viewsets.ViewSet):
    permission_classes = [AllowAny]

    def list(self, request):

        school = getattr(request, 'school', None)


        if not school and request.user.is_authenticated:
            school= request.user.school

        if not school:
            return Response({
                'error':'No school context found',
                'detail': 'Please provide X-School-Subdomain header or authenticate'
            }, status=status.HTTP_400_BAD_REQUEST)

        serializer = SchoolPublicSerializer(school)
        return Response(serializer.data)


    @action(detail=False, methods=['get'])
    def theme(self, request):

        school = getattr(request, 'school', None)

        if not school and request.user.is_authenticated:
            school = request.user.school

        if not school:

            subdomain = request.query_params.get('subdomain')
            if subdomain:
                try:
                    school = School.objects.get(
                        subdomain=subdomain, is_active=True
                    )
                except School.DoesNotExist:
                    return Response({
                        'error':'School Not found'
                    }, status=status.HTTP_404_NOT_FOUND)

            else:
                return Response({
                    'error':'No school context found'
                }, status=status.HTTP_400_BAD_REQUEST)

        serializer = SchoolThemeSerializer(school)
        return Response(serializer.data)
            
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
            return queryset.prefetch_related('enrollments',
                                             'enrollments__class_obj'
                                             ).only(
                                                'id','username', 'email', 'first_name', 'last_name', 'role', 'svc_number', 'phone_number', 'is_active', 'created_at', 'updated_at'
                                             )
        return queryset
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated, IsInstructor])
    def my_students(self, request):
        if request.user.role != 'instructor':
            return Response({
            'error': 'Only instructors can access their students.'
            })
        
        instructor_classes = Class.objects.filter(
            Q(instructor=request.user) | Q(subjects__instructor=request.user),
            is_active=True).distinct().values_list('id', flat=True)
        
        student_ids = Enrollment.objects.filter(
            class_obj_id__in=instructor_classes,
            is_active=True
        ).values_list('student_id', flat=True).distinct()

        students = User.objects.filter(
            id__in=student_ids,
            role='student',
            is_active=True
        ).order_by('first_name', 'last_name')

        serializer = UserListSerializer(students, many=True)

        return Response({
            'count':students.count(),
            'results':serializer.data
        })

    
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
    
    @action(detail=True, methods=['get'])
    def enrollments(self, request, pk=None):

        user = self.get_object()

        if user.role != 'student':
            return Response({
                'error': 'User is not a student'
            },
            status=status.HTTP_400_BAD_REQUEST)

        enrollments = Enrollment.objects.filter(student=user).select_related('class_obj', 'enrolled_by')
        serializer = EnrollmentSerializer(enrollments, many=True)

        return Response({
            'count': enrollments.count(),
            'active': enrollments.filter(is_active=True).count(),
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
    permission_classes = [IsAuthenticated]
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
            enrollment_count= Count('enrollments', filter=Q(enrollments__is_active=True), distinct=True)
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
    

    # instructor specific classes
    @action(detail=False, methods=['get'], permission_classes=[IsInstructor], url_path='my-classes')
    def my_classes(self, request):
        if request.user.role != 'instructor':
            return Response({
                'error': 'Only instructors can access their classes.'
            }, 
            status=status.HTTP_403_FORBIDDEN)
        
        all_classes = Class.objects.filter(
            Q(instructor=request.user) | Q(subjects__instructor=request.user),
            is_active=True
        ).distinct().annotate(
            enrollment_count= Count('enrollments', filter=Q(enrollments__is_active=True))
        )
        
        serializer = ClassSerializer(all_classes, many=True)

        return Response({
            'count': all_classes.count(),
            'results': serializer.data
        })

    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated, IsInstructorofClass])
    def my_students(self, request, pk=None):

        class_obj = self.get_object()

        student_ids = Enrollment.objects.filter(
            class_obj=class_obj,
            is_active=True,
        ).values_list('student', flat=True)

        students = User.objects.filter(
            id__in = student_ids,
            is_active=True
        ).order_by ('first_name', 'last_name')


        serializer = UserListSerializer(students, many=True)
        
        return Response({
            'count': students.count(),
            'results': serializer.data,
            'class':class_obj.name
        })
    @action(detail=False, methods=['get'])
    def whoami(self, request):
        return Response({
            "id": request.user.id,
            "email": request.user.email,
            "role": getattr(request.user, "role", None),
            "is_authenticated": request.user.is_authenticated,
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
    

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated,IsInstructor])
    def my_subjects(self, request):

        if request.user.role != 'instructor':
            return Response({
                'error': 'Only instructors can access their subjects.'
            }, 
            status=status.HTTP_403_FORBIDDEN)
        
        subjects = Subject.objects.filter(
            instructor = request.user,
            is_active = True
        ).select_related('class_obj', 'class_obj__course')

        serializer = SubjectSerializer(subjects, many=True)

        return Response({
            'count':subjects.count(),
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
        return [IsAuthenticated()]
    

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
            Q(expiry_date__gte=timezone.now())
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
    
# instructor
class ExamViewSet(viewsets.ModelViewSet):

    queryset = Exam.objects.select_related('subject', 'created_by').prefetch_related('attachments').all()
    serializer_class = ExamSerializer
    permission_classes = [IsAuthenticated, IsAdminOrInstructor]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['subject', 'exam_type', 'is_active']
    search_fields = ['title', 'subject__name', 'subject__code']
    ordering_fields = ['exam_date', 'created_at']
    ordering =['-created_at']

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if user.role == 'instructor':

            queryset = queryset.filter(subject__instructor=user)

        return queryset
    
    def check_final_exam_constraint(self, subject, instance=None):
        qs = Exam.objects.filter(subject=subject, exam_type='final', is_active=True)
        if instance:
            qs  = qs.exclude(pk=instance.pk)
        if qs.exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Theres already an existing final exam for this subject")

    def perform_create(self, serializer):
        subject = serializer.validated_data.get('subject')
        exam_type = serializer.validated_data.get('exam_type')
        is_active = serializer.validated_data.get('is_active', True)

        if self.request.user.role == 'instructor':
            if subject.instructor != self.request.user:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("You can only create exams for the subject you teach.")

        if exam_type == 'final' and is_active:
            self.check_final_exam_constraint(subject)
            
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        subject = serializer.validated_data.get('subject', serializer.instance.subject)
        exam_type = serializer.validated_data,get('exam_type', serializer.instance.exam_type)
        is_active = serializer.validated_data.get('is_active', serializer.instance.is_active)


        if exam_type == 'final' and is_active:
            self._check_final_exam_constraint(subject, instance = serializer.instance)

        serializer.save()
        

    @action(detail=True, methods=['get'])
    def results(self, request, pk=None):
        exam = self.get_object()
        results = exam.results.select_related('student', 'graded_by').all()

        stats = results.aggregate(
            total=Count('id'),
            submitted=Count('id', filter=Q(is_submitted=True)),
            pending=Count('id', filter=Q(is_submitted=False))
        )
        
        serializer = ExamResultSerializer(results, many=True)
        return Response({
            'exam': ExamSerializer(exam).data,
            'count': stats['total'],
            'submitted': stats['submitted'],
            'pending': stats['pending'],
            'results': serializer.data
        })


    @action(detail=True, methods=['post'])
    def generate_results(self, request, pk=None):
        exam = self.get_object()
        class_obj = exam.subject.class_obj

        enrollments = Enrollment.objects.filter(
            class_obj=class_obj,
            is_active =True
        ).select_related('student')

        created_count = 0

        for enrollment in enrollments:
            result, created = ExamResult.objects.get_or_create(
                exam=exam,
                student=enrollment.student,
                defaults={'is_submitted': False}
            )
            if created:
                created_count += 1


        return Response({
            'status': 'success',
            'message': f'{created_count} results created',
            'total_students': enrollments.count()
        })
    
    @action(detail=False, methods=['get'])
    def my_exams(self, request):
        if request.user.role != 'instructor':
            return Response(
                {
                    'error': 'Only instructors can access their exams.'
                }, status=status.HTTP_403_FORBIDDEN
            )
        
        exams = self.get_queryset().filter(is_active=True)

        serializer = self.get_serializer(exams, many=True)

        return Response({
            'count': exams.count(),
            'results': serializer.data
        })

class ExamAttachmentViewSet(viewsets.ModelViewSet):
    queryset = ExamAttachment.objects.select_related('exam', 'uploaded_by')
    serializer_class = ExamAttachmentSerializer
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsAuthenticated, IsAdminOrInstructor]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        
        if user.role == 'instructor':
            queryset = queryset.filter(exam__subject__instructor=user)
        
        return queryset
    
    def perform_create(self, serializer):
        file = self.request.FILES.get("file")
        exam_id = self.request.data.get('exam')
        
        if not file:
            raise serializers.ValidationError({"file": "File is required"})
        
        if not exam_id:
            raise serializers.ValidationError({"exam": "Exam ID is required"})
        
        try:
            exam = Exam.objects.get(pk=exam_id)
        except Exam.DoesNotExist:
            raise serializers.ValidationError({"exam": "Invalid Exam ID"})
        

        if self.request.user.role == 'instructor':
            if exam.subject.instructor != self.request.user:
                raise PermissionDenied("You can only upload docs to your own exam")
        

        serializer.save(
            exam=exam,
            uploaded_by=self.request.user
        )

class ExamResultViewSet(viewsets.ModelViewSet):
    queryset = ExamResult.objects.select_related('exam', 'student', 'graded_by').all()
    serializer_class = ExamResultSerializer
    permission_classes = [IsAuthenticated, IsAdminOrInstructor]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['exam', 'student', 'is_submitted']
    search_fields = ['student__first_name', 'student__last_name', '']
    ordering_fields = ['marks_obtained', 'created_at']
    ordering = ['-exam__exam_date', 'created_at']

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if user.role != 'instructor':
            queryset = queryset.filter(graded_by=user)

        return queryset
    

    @action(detail=False, methods=['post'])
    def bulk_grade(self, request):
        serializer = BulkExamResultSerializer(data=request.data)

        if not serializer.is_valid():
            return Response (serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        results_data = serializer.validated_data['results']
        updated_count = 0
        errors = []

        for result_data in results_data:
            try:
                result = ExamResult.objects.get(
                    id=result_data.get('id'),
                    exam__subject__instructor=request.user
                )
                result.marks_obtained = result_data['marks_obtained']
                result.remarks =result_data.get('remarks', '')
                result.is_submitted = True
                result.submitted_at = timezone.now()
                result.graded_by = request.user
                result.graded_at =timezone.now()
                result.save()
                updated_count += 1

            except ExamResult.DoesNotExist:
                errors.append(f"Result{result_data.get('id')} not found.")

            except Exception as e:
                errors.append(str(e))

        return Response({
            'status': 'success',
            'updated': updated_count,
            'errors': errors
        })

    @action(detail=False, methods=['get'])
    def student_results(self, request):
        student_id = request.query_params.get('student_id')

        if not student_id:
            return Response({
                'error': 'student_id parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)

        results = self.get_queryset().filter(student_id=student_id, is_submitted=True)
        serializer = self.get_serializer(results, many=True)


        return Response({
            'count':results.count(),
            'results':serializer.data
        })

class AttendanceViewSet(viewsets.ModelViewSet):

    queryset = Attendance.objects.select_related(
        'student', 'class_obj', 'subject', 'marked_by'
    ).all()

    serializer_class = AttendanceSerializer
    permission_classes = [IsAuthenticated, IsAdminOrInstructor]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['class_obj', 'subject', 'status', 'date']
    search_fields = ['student__first_name', 'student__last_name', 'student__svc_number']
    ordering_fields = ['date']
    ordering =['-date']

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if user.role == 'instructor':
            queryset = queryset.filter(
                Q(class_obj__instructor=user) | Q(subject__instructor=user)
            )

        return queryset

    def perform_create(self, serializer):
        serializer.save(marked_by=self.request.user)

    @action(detail=False, methods=['post'])
    def bulk_mark(self, request):
        serializer = BulkAttendanceSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        

        validated_data = serializer.validated_data
        class_obj = validated_data['class_obj']
        subject = validated_data['subject']
        date = validated_data['date']
        records = validated_data['attendance_records']


        created_count = 0   
        updated_count = 0
        errors = []

        for record in records:
            try:
                student = User.objects.get(id=record['student_id'], role='student')

                attendance, created = Attendance.objects.update_or_create(
                    student=student,
                    class_obj=class_obj,
                    subject=subject,
                    date=date,
                    defaults={
                        'status': record['status'],
                        'remarks':record.get('remarks', ''),
                        'marked_by': request.user
                    }
                )
                if created:
                    created_count += 1
                else:
                    updated_count += 1

            except User.DoesNotExist:
                errors.append(f"Student {record['student_id']} does not exist.")
            except Exception as e:
                errors.append(str(e))

        return Response({
            'status': 'success',
            'created': created_count,
            'updated': updated_count,
            'errors': errors
        })

    @action(detail=False, methods=['get'])
    def class_attendance(self, request):
        class_id = request.query_params.get('class_id')
        date = request.query_params.get('date')


        if not class_id or not date:
            return Response(
                {'error': 'class_id and date parameters are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        attendance = self.get_queryset().filter(class_obj_id=class_id, date=date)
        serializer = self.get_serializer(attendance, many=True)

        return Response({
            'count': attendance.count(),
            'present': attendance.filter(status = 'present').count(),
            'absent': attendance.filter(status='absent').count(),
            'results': serializer.data,
            'late':attendance.filter(status='late').count()

        })
    @action(detail=False, methods=['get'])
    def student_attendance(self, request):
        student_id = request.query_params.get('student_id')

        if not student_id:
            return Response({
                'error': 'student_id parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        attendance = self.get_queryset().filter(student_id=student_id)

        return Response({
            'total':attendance.count(),
            'present': attendance.filter(status='present').count(),
            'absent': attendance.filter(status='absent').count(),
            'late': attendance.filter(status='late').count(),
            'excused': attendance.filter(status='excused').count(),
            'attendance_rate':(
                (attendance.filter(status='present').count() / attendance.count()) * 100
            )
            if attendance.count() > 0 else 0
        })
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated, IsAdminOrInstructor])
    def all_students_for_attendance(self, request):

        students = User.objects.filter(
            role= 'student',
            is_active = True
        ).select_related().order_by('first_name', 'last_name')

        class_id = request.query_params.get('class_id')
        if class_id:
            student_ids = Enrollment.objects.filter(
                class_obj_id=class_id,
                is_active=True
            ).values_list('student_id', flat=True)
            students = students.filter(id__in=student_ids)

        serializer = UserSerializer(students, many=True)

        return Response({
            'count': students.count(),
            'results': serializer.data
        })
class ClassNoticeViewSet(viewsets.ModelViewSet):

    queryset = ClassNotice.objects.select_related('class_obj', 'created_by').all()
    serializer_class = ClassNotificationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['class_obj', 'is_active', 'priority', 'subject']
    search_fields = ['title', 'content']
    ordering_fields = ['created_at', 'priority']
    ordering = ['-created_at']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsAdminOrInstructor()]
        return [IsAuthenticated()]


    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user


        if user.role =='instructor':

            queryset= queryset.filter(
                Q(class_obj__instructor=user) | Q(subject__instructor=user)
            )
        elif user.role == 'student':

            enrolled_classes = Enrollment.objects.filter(
                student=user,
                is_active=True
            ).values_list('class_obj_id', flat=True)

            queryset = queryset.filter(class_obj_id__in=enrolled_classes, is_active=True)

        return queryset 

    
    def perform_create(self, serializer):
        class_obj = serializer.validated_data.get('class_obj')
        subject = serializer.validated_data.get('subject')


        if self.request.user.role == 'instructor':
            if subject and subject.instructor != self.request.user:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("You can only create notices for subjects you teach.")
            elif class_obj.instructor != self.request.user and not subject:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("You cannot create notices for classes you don't teach.")
            
    @action(detail=False, methods=['get'])
    def my_notices(self, request):

        notices = self.get_queryset().filter(is_active=True)

        if request.user.role != 'student':
            notices =notices.filter(
                Q(expiry_date__isnull=True) | Q(expiry_date__gte=timezone.now())
            )

        serializer = self.get_serializer(notices, many=True)

        return Response({
            'count':notices.count(),
            'results': serializer.data
        })

class ExamReportViewSet(viewsets.ModelViewSet):


    queryset = ExamReport.objects.select_related('subject', 'class_obj', 'created_by').prefetch_related('exams').all()
    serializer_class = ExamReportSerializer
    permission_classes = [IsAuthenticated, IsAdminOrInstructor]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['subject', 'class_obj']
    search_fields = ['title', 'description']
    ordering_fields = ['report_date', 'created_at']
    ordering = ['-report_date']


    def get_queryset(self):

        queryset = super().get_queryset()
        user = self.request.user


        if user.role =='instructor':
            querset = queryset.filter(subject__instructor=user)

        return queryset


    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    
    @action(detail=True, methods=['get'])
    def detailed_report(self, request, pk=None):

        report = self.get_object()
        exam_ids = report.exams.values._list('id', flat=True)

        enrollments = Enrollment.objects.filter(

            class_obj = report.class_obj,
            is_active = True
        ).select_related('student')

        student_data = []

        for enrollment in enrollments:
            results = ExamResult.objects.filter(
                exam_id__in=exam_ids,
                student = enrollment.student,
                is_submitted = True
            )

            total_marks = sum(r.marks_obtained for r in results if r.marks_obtained)
            total_possible = sum(r.exam.total_marks for r in results)
            percentage = (total_marks / total_possible * 100) if total_possible > 0 else 0

            student_data.append({
                'student_id':enrollment.student.id,
                'student_name':enrollment.student.get_full_name(),
                'svc_number': enrollment.student.svc_number,
                'total_marks': total_marks,
                'total_possible': total_possible,
                'percentage': round(percentage, 2),
                'results': ExamResultSerializer(results, many=True).data
            })

        return Response({
            'report': self.get_serializer(report).data,
            'students': student_data
        })

class InstructorDashboardViewset(viewsets.ViewSet):

    permission_classes = [IsAuthenticated, IsInstructor]

    def list(slef, request):

        if request.user.role != 'instructor':
            return Response(
                {'error': 'Only instructors can access the dashboard.'},
                status=status.HTTP_403_FORBIDDEN
            )

        user = request.user

        my_classes = Class.objects.filter(
            Q(instructor=user) | Q(subjects__instructor=user),
            is_active=True
        ).distinct()

        my_subjects =Subject.objects.filter(
            instructor=user,
            is_active=True
        )

        instructor_class_ids = my_classes.values_list('id', flat=True)
        my_students_count = Enrollment.objects.filter(
            class_obj_id__in=instructor_class_ids,
            is_active=True
        ).values('student').distinct().count()

        my_exams = Exam.objects.filter(
            subject__instructor=user,
            is_active=True
        )

        pending_results = ExamResult.objects.filter(
            exam__subject__instructor=user,
            is_submitted=False
        ).count()


        today = timezone.now().date()
        today_attendance = Attendance.objects.filter(
            Q(class_obj__instructor=user) & Q(subject__instructor=user),
            date=today
        ).count()

        stats ={
            'total_classes': my_classes.count(),
            'total_subjects': my_subjects.count(),
            'total_students': my_students_count,
            'total_exams': my_exams.count(),
            'pending_results': pending_results,
            'today_attendance_records': today_attendance,
            'classes': ClassSerializer(my_classes, many=True).data,
            'subjects': SubjectSerializer(my_subjects, many=True).data
        }

        return Response(stats)

    @action(detail=False, methods=['get'])
    def summary(slef, request):
        if request.user.role != 'instructor':
            return Response(
                {'error': 'Only instructors can access the dashboard.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user= request.user

        classes_count = Class.objects.filter(
            Q(instructor=user) | Q(subjects__instructor=user),
            is_active=True
        ).distinct().count()

        subjects_count = Subject.objects.filter(
            instructor=user,
            is_active=True
        ).count()

        instructor_class_ids = Class.objects.filter(
            Q(instructor=user) | Q(subjects__instructor=user),
            is_active=True
        ).distinct().values_list('id', flat=True)

        students_count = Enrollment.objects.filter(
            class_obj_id__in=instructor_class_ids,
            is_active=True
        ).values('student').distinct().count()

        exams_count = Exam.objects.filter(
            subject__instructor=user,
            is_active=True
        ).count()

        pending_grading = ExamResult.objects.filter(
            exam__subject__instructor=user,
            is_submitted=False
        ).count()

        return Response({
            'classes': classes_count,
            'subjects': subjects_count,
            'students': students_count,
            'exams': exams_count,
            'pending_grading': pending_grading

        })

# students

class StudentDashboardViewset(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsStudent]

    def list(self, request):
        if request.user.role != 'student':
            return Response({
                'error': 'Only students can access the Student Dashboard'
            },
            status=status.HTTP_401_UNAUTHORIZED)
        
        user = request.user

        enrollments = Enrollment.objects.filter(
            student = user,
            is_active = True
        ).select_related('class_obj', 'class_obj__course', 'class_obj__instructor')

        enrolled_class_ids = enrollments.values_list('class_obj_id', flat=True)


        subjects = Subject.objects.filter(
            class_obj_id__in = enrolled_class_ids,
            is_active = True
        ).select_related('instructor', 'class_obj')


        from datetime import timedelta
        today = timezone.now().date()

        upcoming_exams = Exam.objects.filter(
            subject__class_obj_id__in =enrolled_class_ids,
            is_active = True,
            exam_date__gte = today,
            exam_date__lte = today + timedelta(days=30)
        ).select_related('subject', 'subject__class_obj').order_by('exam_date')


        recent_results = ExamResult.objects.filter(
            student= user,
            is_submitted = True
        ).select_related(
            'exam', 'exam__subject', 'graded_by'
        ).order_by(
            '-exam__exam_date'
        )[:10]

        total_attendance = Attendance.objects.filter(student=user)
        present_count = total_attendance.filter(status='present').count()
        total_count = total_attendance.count()
        attendance_rate = (present_count / total_count * 100) if total_count > 0 else 0


        recent_notices = ClassNotice.objects.filter(
            class_obj_id__in = enrolled_class_ids,
            is_active =True
        ).filter(
            Q(expiry_date__isnull=True) | 
            Q(expiry_date__gte = today)
        ).select_related('class_obj', 'subject', 'created_by'). order_by('created_at')[:10]

        general_notices = Notice.objects.filter(
            is_active = True
        ).filter(
            Q(expiry_date__isnull=True) | Q(expiry_date__gte=today)
        ).select_related('created_by').order_by('-created_at')[:5]

        stats ={
            'total_classes': enrollments.count(),
            'total_subjects': subjects.count(),
            'total_exams_taken':ExamResult.objects.filter(
                student = user,
                is_submitted = True
            ).count(),
            'pending_exams':upcoming_exams.count(),
            'attendance_rate': round(attendance_rate, 2),
            'total_attendance_records': total_count,
            'present_days': present_count,
            'absent_days': total_attendance.filter(status='absent').count(),
            'late_days': total_attendance.filter(status='late').count()
        }

        submitted_results = ExamResult.objects.filter(
            student=user,
            is_submitted = True,
            marks_obtained__isnull = False
        )
        
        if submitted_results.exists():
            total_marks = sum(r.marks_obtained for r in submitted_results)
            total_possible = sum(r.exam.total_marks for r in submitted_results)
            average_percentage = (total_marks / total_possible * 100) if total_possible > 0 else 0
            stats [ 'average_grade'] = round(average_percentage, 2)
        else:
            stats['average_grade'] = 0


        return Response({
            'stats':stats,
            'enrollments': EnrollmentSerializer(enrollments, many=True).data,
            'subjects':SubjectSerializer(subjects, many=True).data,
            'upcoming_exams':ExamSerializer(upcoming_exams, many=True).data,
            'recent_results':ExamResultSerializer(recent_results, many=True).data,
            'recent_notices':ClassNotificationSerializer(recent_notices, many=True).data,
            'general_notices':NoticeSerializer(general_notices, many=True).data

        })

    @action(detail=False, methods=['get'])
    def my_classes(self, request):

        if request.user.role != 'student':
            return Response({
                'error':'ONly Students can access this endpoint'
            }, status=status.HTTP_403_FORBIDDEN)
        
        enrollments = Enrollment.objects.filter(
            student = request.user,
            is_active = True
        ).select_related('class_obj', 'class_obj__course', 'class_obj__instructor')

        serializer = EnrollmentSerializer(enrollments, many=True)

        return Response({
            'count': enrollments.count(),
            'results':serializer.data}
                            )
    
    @action(detail=False, methods=['get'])

    def my_subjects(self, request):
        if request.user.role != 'student':
            return Response(
                {'error': 'ONly students can access this endpoint'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        enrolled_class_ids = Enrollment.objects.filter(
            student= request.user,
            is_active = True ). values_list('class_obj_id', flat=True)
    
        subjects = Subject.objects.filter(
            class_obj_id__in = enrolled_class_ids,
            is_active =True
        ).select_related('instructor', 'class_obj', 'class_obj__course')
        serializer = SubjectSerializer(subjects, many=True)

        return Response({
            'count': subjects.count(),
            'results': serializer.data
        })
    
    @action(detail=False, methods =['get'])
    def my_exams(self, request):

        if request.user.role != 'student':
            return Response({
                'error': 'Only students can access this endpoint'
            }, status=status.HTTP_403_FORBIDDEN)
        
        enrolled_class_ids = Enrollment.objects.filter(
            student = request.user,
            is_active =True
        ).values_list('class_obj_id', flat=True)

        exams = Exam.objects.filter(
            subject__class_obj_id__in = enrolled_class_ids,
            is_active =True
        ).select_related('subject', 'subject__class_obj', 'created_by')


        status_param = request.query_params.get('status', 'all')
        today = timezone.now().date()

        if status_param == 'upcoming':
            exams = exams.filter(exam_date__gte=today)
        elif status_param == 'past':
            exams = exams.filter(exam_date__lt=today)

        exams  = exams.order_by('-created_at')

        serializer = ExamSerializer(exams, many=True)

        return Response({
            'count': exams.count(),
            'results': serializer.data
        })
    @action(detail=False, methods=['get'])
    def my_results(self, request):

        if request.user.role != 'student':
            return Response({
                'error': 'Only students can access this endpoint'
            }, status=status.HTTP_403_FORBIDDEN)
        
        results  = ExamResult.objects.filter(
            student=request.user,
            is_submitted = True
        ).select_related('exam', 'exam__subject', 'exam__subject__class_obj', 'graded_by')

        subject_id = request.query_params.get('subject_id')
        exam_id = request.query_params.get('exam_id')

        if subject_id :
            results = results.filter(exam__subject_id = subject_id)
        if exam_id:
            results = results.filter(exam_id=exam_id)

        results = results.order_by('created_at')

        serializer = ExamResultSerializer(results, many=True)


        if results.exists():
            total_marks = sum(r.marks_obtained for r in results if r.marks_obtained)
            total_possible = sum(r.exam.total_marks for r in results)
            average = (total_marks / total_possible * 100) if total_possible > 0 else 0 

            stats = {
                'total_exams':results.count(),
                'average_percentage': round(average, 2),
                'total_marks_obtained': total_marks,
                'total_posible_marks': total_possible
            }

        else:
            stats = {
                'total_exams': 0,
                'average_percentage': 0,
                'total_marks_obtained': 0,
                'total_possible_marks': 0
            }
        
        return Response({
            'count': results.count(),
            'stats': stats,
            'results': serializer.data 
            })
    
    @action(detail=False, methods=['get'])
    def my_attendance(self, request):

        if request.user.role != 'student':
            return Response({
                'error': 'Only students can access this endpoint'
            }, status=status.HTTP_403_FORBIDDEN)
        

        attendance = Attendance.objects.filter(
            student = request.user,
        ).select_related('class_obj', 'subject', 'marked_by')


        class_id = request.query_params.get('class_id')
        subject_id = request.query_params.get('subject_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')


        if class_id:
            attendance = attendance.filter(class_obj_id = class_id)
        if subject_id:
            attendance = attendance.filter(subject_id = subject_id)
        if start_date:
            attendance = attendance.filter(date__gte=start_date)
        if end_date:
            attendance = attendance.filter(date__lte=end_date)

        attendance = attendance.order_by('-date')

        serializer = AttendanceSerializer(attendance, many=True)

        total = attendance.count()
        present = attendance.filter(status='present').count()
        absent = attendance.filter(status='absent').count()
        late = attendance.filter(status='late').count()
        excused = attendance.filter(status='excused').count()


        stats = {
            'total_records': total,
            'present': present,
            'absent': absent,
            'late': late,
            'excused': excused,
            'attendance_rate': round((present / total) * 100, 2) if total > 0 else 0
        }

        return Response({
            'count': total,
            'stats': stats,
            'results': serializer.data
        })
                

    @action(detail=False, methods=['get'])

    def my_notices(self, request):

        if request.user.role != 'student':
            return Response({
                'error': 'Only students can access this endpoint'
            }, status=status.HTTP_403_FORBIDDEN)
        
        enrolled_class_ids = Enrollment.objects.filter(
            student=request.user,
            is_active=True
        ).values_list('class_obj_id', flat=True)

        today = timezone.now().date()

        class_notices = ClassNotice.objects.filter(
            class_obj_id__in = enrolled_class_ids,
            is_active =True
        ).filter(
            Q(expiry_date__isnull=True) |  Q(expiry_date__gte=today)
         ).select_related('class_obj', 'subject', 'created_by')
        

        priority = request.query_params.get('priority')
        if priority:
            class_notices = class_notices.filter(priority=priority)      

        class_notices = class_notices.order_by('-created_at')


        general_notices = Notice.objects.filter(
            is_active = True
        ).filter(
            Q(expiry_date__isnull=True) | Q(expiry_date__gte=today)
        ).select_related('created_by').order_by('-created_at')

        if priority:
            general_notices = general_notices.filter(priority=priority)

        return Response({
            'class_notices': {
                'count': class_notices.count(),
                'results': ClassNotificationSerializer(class_notices, many=True).data
            },
            'general_notices': {
                'count': general_notices.count(),
                'results':NoticeSerializer(general_notices, many=True).data
            }
        })  
    
    @action(detail=False, methods=['get'])
    def performance_summary(self, request):

        if request.user.role != 'student':
            return Response({
                'error': 'Only students can access this endpoint'
            }, status=status.HTTP_403_FORBIDDEN)
        
        user = request.user

        results = ExamResult.objects.filter(
            student = user,
            is_submitted = True,
            marks_obtained__isnull = False
        ).select_related('exam', 'exam__subject')

        if results.exists():
            total_marks = sum(r.marks_obtained for r in results)
            total_possible = sum(r.exam.total_marks for r in results)
            overall_percentage = (total_marks /total_possible * 100) if total_possible > 0 else 0

        else:
            overall_percentage = 0

        enrolled_class_ids = Enrollment.objects.filter(
            student = user,
            is_active = True
        ).values_list('class_obj_id', flat=True)

        subjects = Subject.objects.filter(
            class_obj_id__in =enrolled_class_ids,
            is_active =True

        )
        subject_performance = []
        for subject in subjects:
            subject_results = results.filter(exam__subject=subject)

            if subject_results.exists():
                subj_marks = sum(r.marks_obtained for r in subject_results)
                subj_possible = sum(r.exam.total_marks for r in subject_results)
                subj_percentage = (subj_marks /subj_possible * 100) if subj_possible > 0 else 0


                subject_performance.append({
                        'subject_id': subject.id,
                        'subject_name': subject.name,
                        'subject_code': subject.code,
                        'exams_taken':subject_results.count(),
                        'total_marks':subj_marks,
                        'total_possible':subj_possible,
                        'percentage': round(subj_percentage, 2)
                                                            }
                )

            attendance = Attendance.objects.filter(student=user)
            total_attendance = attendance.count()
            present = attendance.filter(status='present').count()

            return Response({
                'overall':{
                    'total_exams':results.count(),
                    'overall_percentage': round(overall_percentage, 2),
                    'attendance_rate': round((present / total_attendance * 100), 2) if total_attendance > 0 else 0
                },
                'by_subject': subject_performance,
                'attendance_summary':{
                    'total': total_attendance,
                    'present': present,
                    'absent': attendance.filter(status='absent').count(),
                    'late': attendance.filter(status='late').count(),
                    'excused': attendance.filter(status='excused').count()
                }
            })
    @action(detail=False, methods=['get'])
    def upcoming_schedule(self, request):

        if request.user.role != 'student':
            return Response({
                
                    'error': 'Only students can access this endpoint'
                }, status=status.HTTP_403_FORBIDDEN
            )
        
        from datetime import timedelta

        days = int(request.query_params.get('days', 30))
        today = timezone.now().date()
        end_date = today + timedelta(days=days)

        enrolled_class_ids = Enrollment.objects.filter(
            student= request.user,
            is_active = True
        ).values_list('class_obj_id', flat=True)

        upcoming_exams = Exam.objects.filter(
            subject__class_obj_id__in = enrolled_class_ids,
            is_active = True,
            exam_date__gte =today,
            exam_date__lte = end_date
        ).select_related('subject', 'subject__class_obj').order_by('created_at')

        return Response({
            'start_date':today,
            'end_date': end_date,
            'exam_count': upcoming_exams.count(),
            'exams':ExamSerializer(upcoming_exams, many=True).data
        })
    

