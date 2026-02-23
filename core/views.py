from django.shortcuts import render
from rest_framework import viewsets, status, filters
from .models import (User, StudentIndex, Profile, Course, Class, Enrollment, Subject, Notice, Exam, ExamReport,PersonalNotification, School, SchoolAdmin, Certificate, CertificateDownloadLog, CertificateTemplate,
 SchoolMembership,Attendance, ExamResult, ClassNotice, ExamAttachment, NoticeReadStatus, ClassNoticeReadStatus, AttendanceSessionLog,AttendanceSession, SessionAttendance,BiometricRecord,ExamResultNotificationReadStatus,
 Department, DepartmentMembership, ResultEditRequest)
from .serializers import (
    CertificateTemplateSerializer,CertificateSerializer,CertificateListSerializer,SchoolEnrollmentSerializer,SchoolMembershipSerializer,UserSerializer, ProfileReadSerializer, ProfileUpdateSerializer, CourseSerializer, ClassSerializer, EnrollmentSerializer, SubjectSerializer,PersonalNotificationSerializer,
    NoticeSerializer,BulkAttendanceSerializer, UserListSerializer, ClassNotificationSerializer, ClassListSerializer, ClassSerializer,
    ExamReportSerializer, ExamResultSerializer, AttendanceSerializer, ExamSerializer, QRAttendanceMarkSerializer,SchoolSerializer,SchoolAdminSerializer,SchoolCreateWithAdminSerializer,SchoolListSerializer,SchoolThemeSerializer,
    BulkExamResultSerializer,ExamAttachmentSerializer,AttendanceSessionListSerializer,AttendanceSessionSerializer, AttendanceSessionLogSerializer,DepartmentSerializer, DepartmentMembershipSerializer,
    ResultEditRequestSerializer, ResultEditRequestReviewSerializer, SessionAttendanceSerializer,BiometricRecordSerializer,BulkSessionAttendanceSerializer,InstructorMarksSerializer,AdminMarksSerializer,AdminStudentIndexRosterSerializer)
from rest_framework.authentication import SessionAuthentication, TokenAuthentication
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.db.models import Q, Count, Avg, Case, When, IntegerField, Value,Subquery, OuterRef
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from .permissions import( IsAdmin, IsAdminOrInstructor, IsInstructor, IsInstructorofClass,
                            IsStudent,IsInstructorOfClassOrAdmin, IsInstructorOfSubject, IsAdminOnly, IsHOD, IsHODOfDepartment, IsHODOrAdmin, BelongsToSameSchool)
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from django.core.paginator import Paginator
from datetime import timedelta
from dateutil import parser
from rest_framework.parsers import JSONParser, FormParser, MultiPartParser
import io
import csv
from django.http import HttpResponse, FileResponse
from django.db import transaction
from rest_framework.permissions import BasePermission
from .managers import get_current_school
from rest_framework.exceptions import ValidationError
from rest_framework.mixins import RetrieveModelMixin, UpdateModelMixin
from rest_framework.viewsets import GenericViewSet 
from .services import close_class,issue_certificate, CertificateGenerator, CertificateDownloadLog, check_class_completion_for_all_students,get_class_completion_status, bulk_issue_certificates, bulk_assign_indexes, assign_student_index
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404


class TenantFilterMixin:

    def get_school_for_request(self):
        school = get_current_school()
        if school:
            return school
        
        user = self.request.user
        if hasattr(user, 'school') and user.school:
            return user.school
        
        return None
    
    def filter_queryset_by_school(self, queryset):

        user = self.request.user
        
        if not user.is_authenticated:
            return queryset.none()
        
        if user.role == 'superadmin':
            school = get_current_school()
            if school:
                if hasattr(queryset.model, 'school'):
                    return queryset.filter(school=school)
            return queryset
        
        school = self.get_school_for_request()
        if school and hasattr(queryset.model, 'school'):
            return queryset.filter(school=school)
        
        return queryset.none() if not school else queryset
    
    def get_queryset(self):
        queryset = super().get_queryset()
        return self.filter_queryset_by_school(queryset)
    
    def perform_create(self, serializer):
        school = self.get_school_for_request()
        
        model = serializer.Meta.model
        if hasattr(model, 'school'):
            if 'school' not in serializer.validated_data or serializer.validated_data.get('school') is None:
                serializer.save(school=school)
                return
        
        serializer.save()

class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'superadmin'

class IsSchoolAdmin(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated and 
            request.user.role in ['admin', 'superadmin']
        )

class SchoolViewSet(viewsets.ModelViewSet):

    queryset =  School.objects.all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'city']
    search_fields = ['name', 'code', 'email']
    ordering_fields = ['created_at', 'name', 'code']
    ordering = ['created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return SchoolListSerializer
        elif self.action == 'create_with_admin':
            return SchoolCreateWithAdminSerializer
        return SchoolSerializer

    def get_permissions(self):
        if self.action in ['create', 'create_with_admin', 'destroy']:
            return [IsSuperAdmin()]
        return [IsSchoolAdmin()]

    def get_queryset(self):
        queryset = School.objects.all()
        user = self.request.user

        if user.role == 'superadmin':
            return queryset.annotate(
                student_count=Count('memberships', filter=Q(memberships__role='student', memberships__status='active')),
                instructor_count=Count('memberships', filter=Q(memberships__role='instructor', memberships__status='active')),
            )

        if user.school:
            return queryset.filter(id=user.school.id).annotate(
                student_count=Count('memberships', filter=Q(memberships__role='student', memberships__status='active')),
                instructor_count=Count('memberships', filter=Q(memberships__role='instructor', memberships__status='active')),
            )

        return queryset.none()


    @action(detail=False, methods=['post'], permission_classes=[IsSuperAdmin])
    def create_with_admin(self, request):
        serializer = SchoolCreateWithAdminSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = serializer.save()

        return Response({
            'status': 'success',
            'message': f'School {result["school"].name} created successfully.',
            'school' : SchoolSerializer(result['school']).data,
            'admin_user': UserListSerializer(result['admin_user']).data
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def theme(self, request, pk=None):

        school = self.get_object()
        return Response (school.get_theme)

    @action(detail=True, methods=['patch'])
    def update_theme(self, request, pk=None):
        school = self.get_object()

        allowed_fields = ['primary_color', 'secondary_color', 'accent_color', 'theme_config', 'logo']

        for field in allowed_fields:
            if field in request.data:
                setattr(school, field, request.data[field])

        school.save()
        return Response({
            'status': 'success',
            'theme': school.get_theme()
        })

    @action(detail=True, methods=['get'])
    def statistics(self, request, pk=None):

        school = self.get_object()

   
        stats = {
            'users': {
                'total': school.memberships.filter(status='active').count(),
                'students': school.memberships.filter(role='student', status='active').count(),
                'instructors': school.memberships.filter(role='instructor', status='active').count(),
                'admins': school.memberships.filter(role='admin', status='active').count(),
                'commandants': school.memberships.filter(role='commandant', status='active').count(),
            },
            'academic':{
                'courses':school.courses.filter(is_active=True).count(),
                'classes': school.classes.filter(is_active= True).count(),
                'subjects': school.subjects.filter(is_active=True).count(),
                'active_enrollments': school.enrollments.filter(is_active=True).count(),
            },
            'limits':{
                'max_students': school.max_students,
                'current_students':school.current_student_count,
                'student_capacity_used': round((school.current_student_count / school.max_students) * 100, 2),
                'max_instructors': school.max_instructors,
                'current_instructors':school.current_instructor_count,
                'instructor_capacity_used':round((school.current_instructor_count /school.max_instructors) * 100, 2),
                'within_limits':school.is_within_limits
            },
            'subscription':{
                'start_date':school.subscription_start,
                'end_date': school.subscription_end,
                'is_active':school.is_active
            }
        }

        return Response(stats)

    @action(detail=True, methods=['get'])
    def admins(self, request, pk=None):
        school = self.get_object()
        school_admins =school.school_admins.select_related('user').all()
        serializer = SchoolAdminSerializer(school_admins, many=True)
        return Response({
            'count': school_admins.count(),
            'results':serializer.data
        })

    @action(detail=True, methods=['post'])
    def add_admin(self, request, pk=None):
        school = self.get_object()
        user_id = request.data.get('user_id')
        is_primary = request.data.get('is_primary', False)

        try:
            user = User.all_objects.get(
                id=user_id,
                role='admin',
                school_memberships__school=school,
                school_memberships__status='active'
            )
        except User.DoesNotExist:
            return Response({
                'error': 'User not found or not an admin in this school'
            }, status=status.HTTP_400_BAD_REQUEST)

        if SchoolAdmin.objects.filter(school=school, user=user).exists():
            return Response({
                'error': 'User is already an admin for this school'
            }, status = status.HTTP_400_BAD_REQUEST)


        school_admin = SchoolAdmin.objects.create(
            school=school,
            user=user,
            is_primary=is_primary
        )        
        return Response({
            'status': 'success',
            'message':f'{user.get_full_name()} added as school admin',
            'school_admin':SchoolAdminSerializer(school_admin).data
        })

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        school = self.get_object()
        school.is_active = True
        school.save()
        return Response({
            'status': 'success',
            'message':f'School {school.name} activated'
        })

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        school = self.get_object()
        school.is_active = False
        school.save()
        return Response({
            'status': 'success',
            'message': f'School {school.name} deactivated'
        })

    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def upload_logo(self, request, pk=None):
        school = self.get_object()
        logo = request.FILES.get('logo')
        if not logo:
            return Response({'error': 'No logo file provided'}, status=status.HTTP_400_BAD_REQUEST)
        school.logo = logo
        school.save(update_fields=['logo'])
        return Response({
            'status': 'success',
            'logo': request.build_absolute_uri(school.logo.url)
        })

class SchoolAdminViewSet(viewsets.ModelViewSet):

    queryset = SchoolAdmin.objects.select_related('school', 'user').all()
    serializer_class = SchoolAdminSerializer
    permission_classes = [IsAuthenticated, IsSchoolAdmin]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['school', 'is_primary']

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if user.role == 'superadmin':
            return queryset
        
        if user.school:
            return queryset.filter(school=user.school)
        
        return queryset.none()

class SchoolMembershipViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    serializer_class = SchoolMembershipSerializer
    queryset = SchoolMembership.all_objects.select_related(
        'user', 'school', 'transfer_to'
    )
    permission_classes = [IsAuthenticated, IsAdminOrInstructor]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['status', 'role']
    search_fields = [
        'user__svc_number', 'user__first_name',
        'user__last_name'
    ]

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        membership = self.get_object()
        if membership.status != 'active':
            return Response(
                {'error': 'Only active memberships can be completed.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        membership.complete()
        return Response(
            SchoolMembershipSerializer(membership).data
        )

    @action(detail=True, methods=['post'])
    def transfer(self, request, pk=None):
        membership = self.get_object()
        to_school_id = request.data.get('to_school_id')
        try:
            to_school = School.objects.get(
                id=to_school_id, is_active=True
            )
        except School.DoesNotExist:
            return Response(
                {'error': 'Destination school not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        new_membership = membership.transfer(to_school)
        return Response(
            SchoolMembershipSerializer(new_membership).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['post'])
    def reactivate(self, request, pk=None):
        membership = self.get_object()
        try:
            membership.reactivate()
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_409_CONFLICT
            )
        return Response(
            SchoolMembershipSerializer(membership).data
        )

    @action(
        detail=False, methods=['post'],
        serializer_class=SchoolEnrollmentSerializer
    )
    def enroll_at_school(self, request):
        serializer = SchoolEnrollmentSerializer(
            data=request.data,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        membership = serializer.save()
        return Response(
            SchoolMembershipSerializer(membership).data,
            status=status.HTTP_201_CREATED
        )

    @action(
        detail=False, methods=['get'],
        url_path='user-history/(?P<svc_number>[^/.]+)'
    )
    def user_history(self, request, svc_number=None):
        memberships = SchoolMembership.all_objects.filter(
            user__svc_number=svc_number
        ).select_related('school', 'transfer_to').order_by('started_at')
        return Response(
            SchoolMembershipSerializer(memberships, many=True).data
        )

class UserViewSetWithSchool(viewsets.ModelViewSet):
    @action(detail=False, methods=['get'])
    def check_enrollment_eligibility(self, request):

        student_id = request.query_params.get('student_id')

        if not student_id:
            return Response({
                'error': 'student_id parameter required'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            student = User.objects.get(id=student_id, role='student')
        except User.DoesNotExist:
            return Response({
                'error': 'Student not found',
            }, status=status.HTTP_404_NOT_FOUND)

        all_enrollments = Enrollment.all_objects.filter(
            student=student
        ).select_related('school', 'class_obj')

        active_enrollments = all_enrollments.filter(is_active=True)
        past_enrollments = all_enrollments.filter(is_active=False)


        current_school = request.school
        can_enroll = not active_enrollments.exists()

        blocking_enrollment = None
        if active_enrollments.exists():
            blocking_enrollment = active_enrollments.first()

        return Response({
            'student': UserSerializerWithSchool(student).data,
            'can_enroll_in_current_school':can_enroll,
            'current_school':{
                'id':str(current_school.id),
                'name':current_school.name,
                'code':current_school.code
            } if current_school else None,
            'active_enrollments':{
                'count': active_enrollments.count(),
                'details':[{
                    'school': e.school.name,
                    'school_code':e.school.code,
                    'class':e.class_obj.name,
                    'enrollment_date':e.enrollment_date,
                } for e in active_enrollments]
            },
            'past_enrollments':{
                'count': past_enrollments.count(),
                'details':[{
                    'school': e.school.name,
                    'school_code': e.school.code,
                    'class':e.class_obj.name,
                    'enrollment_date':e.enrollment.date,
                    'completion_date':e.completion_date,
                }   for e in past_enrollments]
                },
            'blocking_reason': f"student has aactive_enrollment in {blocking_enrollment.school.name}" if blocking_enrollment else None
        })

class UserViewSet(viewsets.ModelViewSet):

    queryset = User.objects.all()
    permission_classes = [IsAdmin, IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'role']
    search_fields = ['username', 'email', 'first_name', 'last_name']
    ordering_fields = ['created_at', 'username', 'email', 'role']
    ordering = ['-created_at']

    def get_permissions(self):
        if self.action == "enrollments":
            return [IsAuthenticated()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == 'list':
            return UserListSerializer
        return UserSerializer
    
    def get_queryset(self):

        queryset = User.all_objects.all()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()

        if user.role == 'superadmin':
            school = get_current_school()
            if school:
                queryset = queryset.filter(
                    school_memberships__school=school,
                    school_memberships__status='active'
                ).distinct()
            return queryset.prefetch_related('enrollments', 'enrollments__class_obj')

        if user.school:
            return queryset.filter(
                school_memberships__school=user.school,
                school_memberships__status='active'
            ).distinct().prefetch_related(
                'enrollments', 'enrollments__class_obj'
            )

        return queryset.none()
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated, IsInstructor, IsAdmin])
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

    def perform_create(self, serializer):
        user = self.request.user
        school = get_current_school() or user.school

        role = serializer.validated_data.get('role', 'student')

        if role == 'superadmin' and user.role != 'superadmin':
            raise PermissionDenied("Only superadmins can create superadmin users")

        if role == 'superadmin':
            serializer.save()  # No school for superadmin
        else:
            if not school:
                raise ValidationError({"school": "School is required for non-superadmin users"})

            serializer.save(school=school)
    
    @action(detail=False, methods=['get'])
    def instructors(self, request):
        queryset = self.get_queryset().filter(role='instructor', is_active=True)
        
        search_query = request.query_params.get('search', '').strip()
        if search_query:
            queryset = queryset.filter(
                Q(username__icontains=search_query) |
                Q(email__icontains=search_query) |
                Q(first_name__icontains=search_query) |
                Q(last_name__icontains=search_query) |
                Q(svc_number__icontains=search_query)
            )

        page_number = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('page_size', 10))
        
        queryset = queryset.order_by('first_name', 'last_name')
        paginator = Paginator(queryset, page_size)
        page_obj = paginator.get_page(page_number)

        serializer = UserListSerializer(page_obj.object_list, many=True)

        return Response({
            'count': paginator.count,
            'total_pages': paginator.num_pages,
            'current_page': page_obj.number,
            'results': serializer.data
        })

    @action(detail=False, methods=['get'])
    def students(self, request):
        queryset = self.get_queryset().filter(role='student')

        is_active_param = request.query_params.get('is_active', None)
        if is_active_param is not None:
            queryset = queryset.filter(is_active=is_active_param.lower() in ['true', '1'])
        else:
            queryset = queryset.filter(is_active=True)
        
        search_query = request.query_params.get('search', '').strip()
        if search_query:
            queryset = queryset.filter(
                Q(username__icontains=search_query) |
                Q(email__icontains=search_query) |
                Q(first_name__icontains=search_query) |
                Q(last_name__icontains=search_query) |
                Q(svc_number__icontains=search_query)
            )

        page_number = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('page_size', 10))
        
        queryset = queryset.order_by('first_name', 'last_name')
        paginator = Paginator(queryset, page_size)
        page_obj = paginator.get_page(page_number)

        serializer = UserListSerializer(page_obj.object_list, many=True)

        return Response({
            'count': paginator.count,
            'total_pages': paginator.num_pages,
            'current_page': page_obj.number,
            'results': serializer.data
        })

    @action(detail=False, methods=['get'])
    def commandants(self, request):
        queryset = self.get_queryset().filter(role='commandant', is_active=True)
        serializer = UserListSerializer(queryset.order_by('first_name', 'last_name'), many=True)
        return Response({
            'count': queryset.count(),
            'results': serializer.data
        })

    @action(detail=True, methods=['get'])
    def enrollments(self, request, pk=None):

        user = self.get_object()

        if user.role != 'student' and user.id != request.user.id:
            return Response({
                'error': 'You can only view your own enrollments'
            }, status=status.HTTP_403_FORBIDDEN)

        if user.role != 'student':
            return Response({
                'error': 'User is not a student'
            }, status=status.HTTP_400_BAD_REQUEST)


        enrollments = Enrollment.objects.filter(student=user).select_related('class_obj', 'enrolled_by')
        serializer = EnrollmentSerializer(enrollments, many=True)

        return Response({
            'count': enrollments.count(),
            'active': enrollments.filter(is_active=True).count(),
            'results': serializer.data
        })

    @action(detail=False, methods=['get'])
    def stats(self, request):
        queryset = self.get_queryset()
        
        stats = {
            'total_users': queryset.count(),
            'active_users': queryset.filter(is_active=True).count(),
            'by_role': {
                'admins': queryset.filter(role='admin').count(),
                'instructors': queryset.filter(role='instructor').count(),
                'students': queryset.filter(role='student').count(),
                'commandants': queryset.filter(role='commandant').count(),
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
    
class ProfileViewSet(RetrieveModelMixin, UpdateModelMixin, GenericViewSet):
    
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ("update", "partial_update"):
            return ProfileUpdateSerializer
        return ProfileReadSerializer

    def get_object(self):

        profile, _ = Profile.all_objects.select_related(
            "user", "school"
        ).get_or_create(
            user=self.request.user,
            defaults={"school": self.request.user.school},
        )
        return profile

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(
            instance, data=request.data, partial=partial
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        read_serializer = ProfileReadSerializer(instance)
        return Response(read_serializer.data)

class CourseViewSet(viewsets.ModelViewSet):

    queryset = Course.objects.all()
    serializer_class = CourseSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = []
    search_fields = ['name', 'description', 'code']
    ordering_fields = ['created_at', 'name']
    ordering = ['-created_at']


    def perform_create(self, serializer):
        school = get_current_school()
        if not school and self.request.user.school:
            school = self.request.user.school
        
        if not school:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'school': 'Unable to determine school for this request.'})
        
        serializer.save(school=school)
    
    def get_queryset(self):
  
        queryset = Course.all_objects.all()
        
        user = self.request.user
        
        if not user.is_authenticated:
            return queryset.none()
        
        if user.role == 'superadmin':
            school = get_current_school()
            if school:
                return queryset.filter(school=school)
            return queryset
        
        if user.school:
            return queryset.filter(school=user.school)
        
        return queryset.none()
    
    @action(detail=True, methods=['get'])
    def classes(self, request, pk=None):
        """Get all classes for a course."""
        course = self.get_object()
        classes_qs = course.classes.filter(is_active=True)
        serializer = ClassSerializer(classes_qs, many=True)
        return Response({
            'count': classes_qs.count(),
            'results': serializer.data
        })
        
    @action(detail=True, methods=['get'])
    def stats(self, request):
        queryset = self.get_queryset()

        has_is_active = any(f.name == 'is_active' for f in Course._meta.get_fields())
        total_courses = queryset.count()
        active_courses = queryset.filter(is_active=True).count() if has_is_active else total_courses
        inactive_courses = queryset.filter(is_active=False).count() if has_is_active else 0
        
        stats = {
            'total_courses': total_courses,
            'active_courses': active_courses,  
            'inactive_courses': inactive_courses,
            'total_classes': Class.objects.count(), 
            'active_classes': Class.objects.filter(is_active=True).count()
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
    serializer_class = ClassSerializer

    def perform_create(self, serializer):
        school = get_current_school()
        if not school and self.request.user.school:
            school = self.request.user.school
        
        if not school:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'school': 'Unable to determine school for this request.'})
        
        serializer.save(school=school)

    def get_serializer_class(self):

        if self.action == 'list':
            return ClassSerializer
        return ClassSerializer
    
    def get_queryset(self):
        
        queryset = Class.all_objects.select_related('course', 'instructor').all()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()
        
        if user.role == 'superadmin':
            school = get_current_school()
            if school:
                return queryset.filter(school=school)
            return queryset
        
        if user.school:
            return queryset.filter(school=user.school)
        
        return queryset.none()

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
    @action(detail=False, methods=['get'], permission_classes=[IsAdminOrInstructor], url_path='my-classes')
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

    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated])
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

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsAdmin])
    def close(self, request, pk=None):
        
        class_obj = self.get_object()
        success, error = close_class(class_obj, request.user)

        if not success:
            return Response(
                {'error': error},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response({
            'status': 'success',
            'message': f'Class {class_obj.name} has been closed.',
            'class': ClassSerializer(class_obj).data
        })

    
    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated, IsAdmin])
    def completion_status(self, request, pk=None):

        class_obj = self.get_object()
        results = check_class_completion_for_all_students(class_obj)

        complete_count = sum(1 for r in results if r ['is_academically_complete'])

        return Response({
            'class':{
                'id': class_obj.id,
                'name': class_obj.name,
                'is_closed': class_obj.is_closed,
            },
            'total_students':len(results),
            'academically_complete': complete_count,
            'pending':len(results) - complete_count,
            'students': results
        })
        

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsAdmin])
    def issue_certificates(self, request, pk=None):
        class_obj = self.get_object()

        template = None
        template_id = request.data.get('template_id')
        if template_id:
            try:
                template = CertificateTemplate.all_objects.get(
                    id=template_id, is_active=True,
                )
            except CertificateTemplate.DoesNotExist:
                return Response(
                    {'error': 'Template not found'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        result = bulk_issue_certificates(class_obj, request.user, template=template)

        if 'error' in result:                         
            return Response(
                {'error': result['error']},
                status=status.HTTP_400_BAD_REQUEST
            )
        return Response({                              
            'status': 'success',
            **result
        })

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsAdmin])
    def issue_certificate_single(self, request, pk=None):
        class_obj = self.get_object()
        enrollment_id = request.data.get('enrollment_id')

        if not enrollment_id:
            return Response(
                {'error': 'enrollment_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            enrollment = Enrollment.all_objects.get(
                id=enrollment_id, class_obj=class_obj
            )
        except Enrollment.DoesNotExist:
            return Response(
                {'error': 'Enrollment not found in this class.'},
                status=status.HTTP_404_NOT_FOUND
            )

        template = None
        template_id = request.data.get('template_id')
        if template_id:
            try:
                template = CertificateTemplate.all_objects.get(
                    id=template_id, is_active=True,
                )
            except CertificateTemplate.DoesNotExist:
                return Response(
                    {'error': 'Template not found'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        certificate, error = issue_certificate(enrollment, request.user, template=template)

        if error:
            return Response(
                {'error': error},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response({
            'status': 'success',
            'certificate_number': certificate.certificate_number,
            'student': enrollment.student.svc_number,
        }, status=status.HTTP_201_CREATED)
    
class SubjectViewSet(viewsets.ModelViewSet):

    queryset = Subject.objects.select_related('class_obj', 'instructor').all()
    serializer_class = SubjectSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'class_obj', 'instructor'] 
    search_fields = ['name', 'class_obj__name', 'instructor__first_name']
    ordering_fields = ['created_at', 'name', 'start_date']
    ordering = ['-created_at']

    def get_queryset(self):
        queryset = Subject.all_objects.select_related('class_obj', 'instructor').all()
        
        user = self.request.user
        
        if not user.is_authenticated:
            return queryset.none()
        
        if user.role == 'superadmin':
            school = get_current_school()
            if school:
                return queryset.filter(school=school)
        elif user.school:
            queryset = queryset.filter(school=user.school)
        else:
            return queryset.none()
        
        queryset = queryset.exclude(class_obj__is_closed=True)
        
        return queryset


    def perform_create(self, serializer):
        school = get_current_school()
        if not school and self.request.user.school:
            school = self.request.user.school
        
        if not school:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'school': 'Unable to determine school for this request.'})
        
        serializer.save(school=school)

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
    

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated, IsInstructor])
    def my_subjects(self, request):
        if request.user.role != 'instructor':
            return Response({'error': 'Only instructors can access this.'}, status=403)

        subjects = self.get_queryset().filter(
            instructor=request.user,
            is_active=True
        )

        serializer = SubjectSerializer(subjects, many=True)
        return Response({
            'count': subjects.count(),
            'results': serializer.data
        })
  
class NoticeActionMixin:

    read_status_model = None
    read_status_fk_name = None

    def _not_expired_q(self):
        return Q(expiry_date__isnull=True) | Q(expiry_date__gte=timezone.now())

    def _annotate_read_status(self, qs):
        """Annotate queryset with the current user's read_at timestamp."""
        user = self.request.user
        if not user.is_authenticated:
            return qs

        return qs.annotate(
            _user_read_at=Subquery(
                self.read_status_model.objects.filter(
                    user=user,
                    **{self.read_status_fk_name: OuterRef('pk')},
                ).values('read_at')[:1]
            ),
        )

    @action(detail=False, methods=['get'])
    def active(self, request):
        qs = self.get_queryset().filter(is_active=True)
        serializer = self.get_serializer(qs, many=True)
        return Response({
            'count': qs.count(),
            'results': serializer.data,
        })

    @action(detail=False, methods=['get'])
    def expired(self, request):
        if request.user.role not in ['admin', 'superadmin', 'instructor', 'commandant']:
            return Response(
                {'error': 'Insufficient permissions'},
                status=status.HTTP_403_FORBIDDEN,
            )
        qs = self._annotate_read_status(
            self._get_base_queryset_unfiltered().filter(
                expiry_date__lt=timezone.now(),
            ).order_by('-created_at')
        )
        serializer = self.get_serializer(qs, many=True)
        return Response({
            'count': qs.count(),
            'results': serializer.data,
        })

    @action(detail=False, methods=['get'])
    def unread(self, request):
        read_qs = self.read_status_model.objects.filter(
            user=request.user,
        ).values_list(f'{self.read_status_fk_name}_id', flat=True)

        qs = self.get_queryset().filter(
            is_active=True,
        ).filter(
            self._not_expired_q(),
        ).exclude(
            id__in=read_qs,
        ).order_by('-created_at')

        serializer = self.get_serializer(qs, many=True)
        return Response({
            'count': qs.count(),
            'results': serializer.data,
        })

    @action(detail=True, methods=['post'])
    def mark_as_read(self, request, pk=None):
        notice = self.get_object()
        kwargs = {
            'user': request.user,
            self.read_status_fk_name: notice,
        }
        if hasattr(notice, 'school') and notice.school:
            kwargs['school'] = notice.school

        read_status, created = self.read_status_model.objects.get_or_create(
            **{k: v for k, v in kwargs.items() if k in ['user', self.read_status_fk_name]},
            defaults={k: v for k, v in kwargs.items() if k not in ['user', self.read_status_fk_name]},
        )
        return Response({
            'message': 'Notice marked as read' if created else 'Already marked as read',
            'read_at': read_status.read_at,
        })

    @action(detail=True, methods=['post'])
    def mark_as_unread(self, request, pk=None):
        notice = self.get_object()
        deleted_count, _ = self.read_status_model.objects.filter(
            user=request.user,
            **{self.read_status_fk_name: notice},
        ).delete()
        return Response({
            'message': 'Notice marked as unread' if deleted_count > 0 else 'Was not marked as read',
        })

    @action(detail=False, methods=['get'])
    def by_priority(self, request):
        priority_param = request.query_params.get('priority')
        if not priority_param:
            return Response(
                {'error': 'priority parameter is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        qs = self.get_queryset().filter(priority=priority_param, is_active=True)
        serializer = self.get_serializer(qs, many=True)
        return Response({
            'count': qs.count(),
            'results': serializer.data,
        })

    @action(detail=False, methods=['get'])
    def urgent(self, request):
        qs = self.get_queryset().filter(priority='urgent', is_active=True)
        serializer = self.get_serializer(qs, many=True)
        return Response({
            'count': qs.count(),
            'results': serializer.data,
        })

class NoticeViewSet(NoticeActionMixin, viewsets.ModelViewSet):

    serializer_class = NoticeSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'priority']
    search_fields = ['title', 'content']
    ordering_fields = ['created_at', 'title', 'priority']
    ordering = ['-created_at']

    read_status_model = NoticeReadStatus
    read_status_fk_name = 'notice'

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = Notice.all_objects.select_related('created_by').filter(
            self._not_expired_q(),
        )
        user = self.request.user
        if not user.is_authenticated:
            return qs.none()

        if user.role == 'superadmin':
            school = get_current_school()
            qs = qs.filter(school=school) if school else qs
        elif user.school:
            qs = qs.filter(school=user.school)
        else:
            return qs.none()

        return self._annotate_read_status(qs)

    def _get_base_queryset_unfiltered(self):
        qs = Notice.all_objects.select_related('created_by')
        user = self.request.user

        if user.active_role == 'superadmin':
            school = get_current_school()
            return qs.filter(school=school) if school else qs

        if user.school:
            return qs.filter(school=user.school)

        return qs.none()

    def perform_create(self, serializer):
        school = get_current_school() or self.request.user.school
        serializer.save(school=school, created_by=self.request.user)

class EnrollmentViewSet(viewsets.ModelViewSet):

    queryset = Enrollment.objects.select_related('student', 'class_obj', 'enrolled_by').all()
    serializer_class = EnrollmentSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['student', 'class_obj', 'is_active']
    search_fields = ['student__username', 'student__email', 'class_obj__class_code', 'class_obj__name']
    ordering_fields = ['enrollment_date', 'completion_date']
    ordering = ['-enrollment_date']
    
    def get_queryset(self):
        queryset = Enrollment.all_objects.select_related(
            'student', 'class_obj', 'enrolled_by'
        ).all()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()

        if user.role == 'superadmin':
            school = get_current_school()
            if school:
                return queryset.filter(school=school)
            return queryset

        if user.school:
            return queryset.filter(school=user.school)

        return queryset.none()

    def perform_create(self, serializer):
        user = self.request.user
        school = get_current_school() or user.school
        serializer.save(school=school, enrolled_by=user)
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        enrollment = self.get_object()

        if enrollment.completion_date:
            return Response({
                'error': 'Cannot complete an inactive enrollment. Reactivate it first.'}
            , status=status.HTTP_400_BAD_REQUEST)
            
        enrollment.completion_date = timezone.now().date()
        enrollment.is_active = False
        enrollment.save(update_fields=['completion_date', 'is_active'])

        membership = enrollment.membership
        if membership:
            active_enrollments = Enrollment.all_objects.filter(
                membership=membership, is_active=True
            ).exists()
            if not active_enrollments:

                if membership.status == 'active':
                    membership.complete()

        return Response({
            'status': 'success', 
            'message': 'Enrollment marked as complete',
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
            return Response({
                'error': 'Enrollment is already active'
            }, 
            )
        if enrollment.completion_date:
            return Response({
                'error': 'Cannot reactivate a completed enrollment. Create a new enrollment'
            }, status=status.HTTP_400_BAD_REQUEST)

        if enrollment.membership and enrollment.membership.status != 'active':
            return Response({
                'error': 'Cannot reactivate enrollment - the school membership is no longer active'
            }, status = status.HTTP_400_BAD_REQUEST)

        if enrollment.class_obj.current_enrollment >= enrollment.class_obj.capacity:
            return Response({
                'error': 'Class is at full capacity'
            }, status=status.HTTP_400_BAD_REQUEST)

        enrollment.is_active =True
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
    
    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated])
    def completion_status(self, request, pk=None):

        enrollment = self.get_object()

        if request.user.role == 'student' and enrollment.student != request.user:
            return Response(
                {'error': 'You can only view your own enrollment status.'},
                status=status.HTTP_403_FORBIDDEN
            )

        status_data = get_class_completion_status(
            enrollment.class_obj, enrollment.student
        )

        status_data['enrollment_id'] = enrollment.id
        status_data['is_active'] = enrollment.is_active
        status_data['completion_date'] = enrollment.completion_date
        status_data['has_certificate'] = hasattr(enrollment, 'certificate')

        return Response(status_data)

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
        queryset = Exam.all_objects.select_related('subject', 'created_by').all()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()

        if user.role == 'superadmin':
            school = get_current_school()
            if school:
                queryset = queryset.filter(school=school)
        elif user.school:
            queryset = queryset.filter(school=user.school)
        else:
            return queryset.none()

        if user.role == 'instructor':
            queryset = queryset.filter(subject__instructor=user)
        
        queryset = queryset.exclude(subject__class_obj__is_closed=True)

        return queryset
    
    def check_final_exam_constraint(self, subject, instance=None):
        qs = Exam.objects.filter(subject=subject, exam_type='final', is_active=True)
        if instance:
            qs  = qs.exclude(pk=instance.pk)
        if qs.exists():
            
            raise ValidationError("Theres already an existing final exam for this subject")

    def perform_create(self, serializer):
        school = get_current_school() or self.request.user.school
        
        subject = serializer.validated_data.get('subject')
        if self.request.user.role == 'instructor':
            if subject.instructor != self.request.user:
                raise PermissionDenied("You can only create exams for subjects you teach")
        
        serializer.save(school=school, created_by=self.request.user)

    def perform_update(self, serializer):
        subject = serializer.validated_data.get('subject', serializer.instance.subject)
        exam_type = serializer.validated_data.get('exam_type', serializer.instance.exam_type)
        is_active = serializer.validated_data.get('is_active', serializer.instance.is_active)


        if exam_type == 'final' and is_active:
            self.check_final_exam_constraint(subject, instance = serializer.instance)

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

        # Prevent generating results for a closed class
        if class_obj.is_closed:
            return Response(
                {'error': 'Cannot generate exam results for a closed class.'},
                status=status.HTTP_400_BAD_REQUEST
            )

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
        queryset = ExamAttachment.all_objects.select_related('exam', 'uploaded_by').all()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()

        if user.role == 'superadmin':
            school = get_current_school()
            if school:
                return queryset.filter(school=school)
            return queryset

        if user.school:
            queryset = queryset.filter(school=user.school)
            if user.role == 'instructor':
                queryset = queryset.filter(exam__subject__instructor=user)
            return queryset

        return queryset.none()
    
    def perform_create(self, serializer):
        school = get_current_school() or self.request.user.school
        serializer.save(school=school, uploaded_by=self.request.user)

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
        queryset = ExamResult.all_objects.select_related('exam', 'student', 'graded_by').all()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()

        if user.role == 'superadmin':
            school = get_current_school()
            if school:
                queryset = queryset.filter(school=school)
        elif user.school:
            queryset = queryset.filter(school=user.school)
        else:
            return queryset.none()

        if user.role == 'instructor':
            queryset = queryset.filter(exam__subject__instructor=user)
        elif user.role == 'student':
            queryset = queryset.filter(student=user)

        queryset = queryset.exclude(exam__subject__class_obj__is_closed=True)

        return queryset

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    @action(detail=False, methods=['get'])
    def student_results(self, request):
        student_id = request.query_params.get('student_id')

        if not student_id:
            return Response({
                'error': 'student_id parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)

        results = self.get_queryset().filter(
            student_id=student_id, is_submitted=True, marks_obtained__isnull=False
        ).select_related('exam', 'exam__subject', 'exam__subject__class_obj', 'student', 'graded_by')
        serializer = self.get_serializer(results, many=True)

        subject_map = {}
        for r in results:
            subj = r.exam.subject
            key = subj.id
            if key not in subject_map:
                subject_map[key] = {
                    'subject_id': subj.id,
                    'subject_name': subj.name,
                    'subject_code': getattr(subj, 'subject_code', getattr(subj, 'code', subj.name)),
                    'total_marks_obtained': 0,
                    'total_possible_marks': 0,
                    'exams_taken': 0,
                }
            subject_map[key]['total_marks_obtained'] += float(r.marks_obtained)
            subject_map[key]['total_possible_marks'] += r.exam.total_marks
            subject_map[key]['exams_taken'] += 1

        for subj_data in subject_map.values():
            possible = subj_data['total_possible_marks']
            obtained = subj_data['total_marks_obtained']
            pct = (obtained / possible * 100) if possible > 0 else 0
            subj_data['percentage'] = round(pct, 2)
            subj_data['grade'] = self._calculate_overall_grade(pct)

        subject_summaries = sorted(subject_map.values(), key=lambda x: x['subject_name'])

        grand_total_obtained = sum(s['total_marks_obtained'] for s in subject_map.values())
        grand_total_possible = sum(s['total_possible_marks'] for s in subject_map.values())
        overall_percentage = (grand_total_obtained / grand_total_possible * 100) if grand_total_possible > 0 else 0
        overall_grade = self._calculate_overall_grade(overall_percentage)

        return Response({
            'count': results.count(),
            'results': serializer.data,
            'subject_summaries': subject_summaries,
            'overall_summary': {
                'total_marks_obtained': grand_total_obtained,
                'total_possible_marks': grand_total_possible,
                'overall_percentage': round(overall_percentage, 2),
                'overall_grade': overall_grade,
                'total_subjects': len(subject_summaries),
                'total_exams_taken': results.count(),
            },
        })

    @staticmethod
    def _calculate_overall_grade(percentage):
        if percentage >= 91:
            return 'A'
        elif percentage >= 86:
            return 'A-'
        elif percentage >= 81:
            return 'B+'
        elif percentage >= 76:
            return 'B'
        elif percentage >= 71:
            return 'B-'
        elif percentage >= 65:
            return 'C+'
        elif percentage >= 60:
            return 'C'
        elif percentage >= 50:
            return 'C-'
        else:
            return 'F'

    def _create_grade_notification(self, exam_result):
        try:
            percentage = (exam_result.marks_obtained / exam_result.exam.total_marks * 100) if exam_result.exam.total_marks > 0 else 0

            if percentage >= 91:
                return 'A'
            elif percentage >= 86:
                return 'A-'
            elif percentage >= 81:
                return 'B+'
            elif percentage >= 76:
                return 'B'
            elif percentage >= 71:
                return 'B-'
            elif percentage >= 65:
                return 'C+'
            elif percentage >= 60:
                return 'C'
            elif percentage >= 50:
                return 'C-'
            else:
                return 'F'

            title = f"Grade Posted: {exam_result.exam.title}"

            content = f"""Your exam has been graded!
            Exam: {exam_result.exam.title}
            Subject: {exam_result.exam.subject.name}
            Class: {exam_result.exam.subject.class_obj.name}
            Score : {exam_result.marks_obtained} / {exam_result.exam.total_marks}
            Percentage : {percentage:.2f}%
            Grade: {grade_letter}

            {f'Remarks: {exam_result.remarks}' if exam_result.remarks else ''}

            Graded by : {exam_result.graded_by.get_full_name() if exam_result.graded_by else 'System'}
            Date: { exam_result.graded_at.strftime('%B %d, %Y at %I:%M %p') if exam_result.graded_at else 'N/A'}

            """

            PersonalNotification.objects.create(
                user=exam_result.student,
                notification_type='exam_result',
                priority = 'medium',
                title = title,
                content = content,
                exam_result= exam_result,
                created_by= exam_result.graded_by,
                is_active=True
            )

            return True
        except Exception as e:

            return False

    def perform_update(self, serializer):
        with transaction.atomic():
            old_instance = self.get_object()

            # Prevent grading if the class is closed
            if old_instance.exam.subject.class_obj.is_closed:
                raise ValidationError("Cannot update exam results for a closed class.")

            was_graded = old_instance.is_submitted and old_instance.marks_obtained is not None

            instance = serializer.save()

            is_newly_graded = instance.is_submitted and instance.marks_obtained is not None and not was_graded

            if is_newly_graded:

                self._create_grade_notification(instance)

    @action(detail=False, methods=['post'])
    def bulk_grade(self, request):
        serializer = BulkExamResultSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        results_data = serializer.validated_data['results']
        updated_count = 0
        notified_count = 0 
        errors = []

        with transaction.atomic():
            for result_data in results_data:
                try:
                    result = ExamResult.objects.get(
                        id = result_data.get('id'),
                        exam__subject__instructor = request.user
                    )

                    # Prevent grading if the class is closed
                    if result.exam.subject.class_obj.is_closed:
                        errors.append(
                            f"Result {result_data.get('id')}: cannot grade — class is closed"
                        )
                        continue

                    result.marks_obtained = result_data['marks_obtained']
                    result.remarks = result_data.get('remarks', '')
                    result.is_submitted = True
                    result.submitted_at = timezone.now()
                    result.graded_by = request.user
                    result.graded_at = timezone.now()
                    result.save()

                    updated_count +=1

                    if self._create_grade_notification(result):
                        notified_count +=1

                except ExamResult.DoesNotExist:
                    errors.append(f"Result {result_data.get('id')} not found")
                except Exception as e:
                    errors.append(f"Error processing result {result_data.get('id')}: {str(e)}")


            
        return Response({
            'status': 'success',
            'updated': updated_count,
            'notified': notified_count,
            'errors':errors
        })

    @action(detail=True, methods=['post'])
    def grade(self, request, pk=None):
        result = self.get_object()

        # Prevent grading if the class is closed
        if result.exam.subject.class_obj.is_closed:
            return Response(
                {'error': 'Cannot grade exams for a closed class.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if request.user.role == 'instructor':
            if result.exam.subject.instructor != request.user:
                return Response(
                    {'error': 'You can only grade results for exams in subjects that you teach.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        marks_obtained = request.data.get('marks_obtained')
        remarks = request.data.get('remarks', '')

        if marks_obtained is None:
            return Response(
                {'error': 'marks_obtained is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            marks_obtained = float(marks_obtained)

        except (ValueError, TypeError):
            return Response(
                {'error':'marks_obtained must be a valid number'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if marks_obtained < 0 or marks_obtained > result.exam.total_marks:
            return Response({
                'error': f'marks obtained must be between 0 and {result.exam.total_marks}'
            }, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():

            result.marks_obtained = marks_obtained
            result.remarks = remarks
            result.is_submitted = True
            result.submitted_at = timezone.now()
            result.graded_by = request.user
            result.graded_at = timezone.now()
            result.save()

            notification_created = self._create_grade_notification(result)


        serializer = self.get_serializer(result)

        return Response({
            'status': 'success',
            'message':'Result grade successfully',
            'notification_sent':notification_created,
            'result':serializer.data
        })

    @action(detail=False, methods=['get'])
    def student_results(self, request):

        student_id = request.query_params.get('student_id')

        if not student_id:
            return Response({
                'error': 'student_id parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)

        results = self.get_queryset().filter(
            student_id=student_id, is_submitted=True, marks_obtained__isnull=False
        ).select_related('exam', 'exam__subject', 'exam__subject__class_obj', 'student', 'graded_by')

        serializer = self.get_serializer(results, many=True)

        subject_map = {}
        for r in results:
            subj = r.exam.subject
            key = subj.id
            if key not in subject_map:
                subject_map[key] = {
                    'subject_id': subj.id,
                    'subject_name': subj.name,
                    'subject_code': getattr(subj, 'subject_code', getattr(subj, 'code', subj.name)),
                    'total_marks_obtained': 0,
                    'total_possible_marks': 0,
                    'exams_taken': 0,
                }
            subject_map[key]['total_marks_obtained'] += float(r.marks_obtained)
            subject_map[key]['total_possible_marks'] += r.exam.total_marks
            subject_map[key]['exams_taken'] += 1

        for subj_data in subject_map.values():
            possible = subj_data['total_possible_marks']
            obtained = subj_data['total_marks_obtained']
            pct = (obtained / possible * 100) if possible > 0 else 0
            subj_data['percentage'] = round(pct, 2)
            subj_data['grade'] = self._calculate_overall_grade(pct)

        subject_summaries = sorted(subject_map.values(), key=lambda x: x['subject_name'])

        grand_total_obtained = sum(s['total_marks_obtained'] for s in subject_map.values())
        grand_total_possible = sum(s['total_possible_marks'] for s in subject_map.values())
        overall_percentage = (grand_total_obtained / grand_total_possible * 100) if grand_total_possible > 0 else 0
        overall_grade = self._calculate_overall_grade(overall_percentage)

        return Response({
            'count': results.count(),
            'results': serializer.data,
            'subject_summaries': subject_summaries,
            'overall_summary': {
                'total_marks_obtained': grand_total_obtained,
                'total_possible_marks': grand_total_possible,
                'overall_percentage': round(overall_percentage, 2),
                'overall_grade': overall_grade,
                'total_subjects': len(subject_summaries),
                'total_exams_taken': results.count(),
            },
        })

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def mark_notification_as_read(self, request, pk=None):

        exam_result = self.get_object()

        if exam_result.student != request.user:
            return Response({
                'error': 'You can only mark your own exam result notification as read'
            }, status=status.HTTP_403_FORBIDDEN)

        if not exam_result.is_submitted or exam_result.marks_obtained is None:
            return Response(
                {
                    'error': 'This exam result has not been graded yet'
                },status=status.HTTP_400_BAD_REQUEST
            )

        read_status, created = ExamResultNotificationReadStatus.objects.get_or_create(
            user= request.user,
            exam_result=exam_result
        )
        return Response({
            'status':'success',
            'message': 'Notification marked as read' if created else 'Already marked as read',
            'read_at': read_status.read_at,
            'exam_result_id':exam_result.id,
            'exam_title':exam_result.exam.title
        })

    @action(detail=True, methods=['post'], permission_classes = [IsAuthenticated])
    def mark_notification_as_unread(self, request, pk=None):
        exam_result = self.get_object()

        if exam_result.student != request.user:
            return Response(
                {
                    'error': 'You can only mark your own exam result notification as unread.'
                },
                status=status.HTTP_403_FORBIDDEN
            )

        deleted_count = ExamResultNotificationReadStatus.objects.filter(
            user=request.user,
            exam_result=exam_result
        ).delete()[0]

        return Response({
            'status': 'success',
            'message': 'Notification marked as unread' if deleted_count > 0 else 'Was not marked as read',
            'deleted_count': deleted_count,
            'exam_result_id':exam_result.id,
            'exam_title':exam_result.exam.title
        })

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def unread_notifications(self, request):

        if request.user.role != 'student':
            return Response({
                'error': 'Only students can access their unread notifications'
            }, status=status.HTTP_403_FORBIDDEN)

        
        read_result_ids = ExamResultNotificationReadStatus.objects.filter(
            user =request.user
        ).values_list('exam_result_id', flat=True)

        unread_results = ExamResult.objects.filter(
            student= request.user,
            is_submitted= True,
            marks_obtained__isnull = False
        ).exclude(
            id__in = read_result_ids
        ).select_related('exam', 'exam__subject', 'exam__subject__class_obj', 'graded_by').order_by('-graded_at')

        serializer = self.get_serializer(unread_results, many=True)

        return Response({
            'count': unread_results.count(),
            'results':serializer.data
        })

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def mark_all_as_read(self, request):

        if request.user.role != 'student':
            return Response({
                'error': 'Only students can mark notifications as read'
            }, status=status.HTTP_403_FORBIDDEN)

        graded_results = ExamResult.objects.filter(
            student = request.user,
            is_submitted=True,
            marks_obtained__isnull = False
        )

        created_count = 0

        with transaction.atomic():
            for result in graded_results:
                _, created = ExamResultNotificationReadStatus.objects.get_or_create(
                    user = request.user,
                    exam_result=result
                )
                if created:
                    created_count +=1

        return Response({
            'status': 'success',
            'message': f'Marked {created_count} notification as read',
            'marked_count': created_count,
            'total_results': graded_results.count()
        })



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

class ClassNoticeViewSet(NoticeActionMixin, viewsets.ModelViewSet):

    serializer_class = ClassNotificationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['class_obj', 'is_active', 'priority', 'subject']
    search_fields = ['title', 'content']
    ordering_fields = ['created_at', 'priority']
    ordering = ['-created_at']

    read_status_model = ClassNoticeReadStatus
    read_status_fk_name = 'class_notice'

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsAdminOrInstructor()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = ClassNotice.all_objects.select_related(
            'class_obj', 'subject', 'created_by',
        ).filter(
            self._not_expired_q(),
        )
        user = self.request.user
        if not user.is_authenticated:
            return qs.none()

        if user.role == 'superadmin':
            school = get_current_school()
            if school:
                qs = qs.filter(school=school)
        elif user.school:
            qs = qs.filter(school=user.school)
        else:
            return qs.none()

        if user.role == 'instructor':
            qs = qs.filter(
                Q(class_obj__instructor=user) | Q(subject__instructor=user)
            )
        elif user.role == 'student':
            enrolled_class_ids = Enrollment.all_objects.filter(
                student=user, is_active=True,
            ).values_list('class_obj_id', flat=True)
            qs = qs.filter(class_obj_id__in=enrolled_class_ids, is_active=True)

        return self._annotate_read_status(qs)

    def _get_base_queryset_unfiltered(self):
        qs = ClassNotice.all_objects.select_related(
            'class_obj', 'subject', 'created_by',
        )
        user = self.request.user

        if user.role == 'superadmin':
            school = get_current_school()
            if school:
                qs = qs.filter(school=school)
        elif user.school:
            qs = qs.filter(school=user.school)
        else:
            return qs.none()

        if user.role == 'instructor':
            qs = qs.filter(
                Q(class_obj__instructor=user) | Q(subject__instructor=user)
            )

        return qs

    def perform_create(self, serializer):
        school = get_current_school() or self.request.user.school
        serializer.save(school=school, created_by=self.request.user)

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
        queryset = ExamReport.all_objects.select_related(
            'subject', 'class_obj', 'created_by'
        ).all()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()

        if user.role == 'superadmin':
            school = get_current_school()
            if school:
                return queryset.filter(school=school)
            return queryset

        if user.school:
            queryset = queryset.filter(school=user.school)
            if user.role == 'instructor':
                queryset = queryset.filter(subject__instructor=user)
            return queryset

        return queryset.none()

    def perform_create(self, serializer):
        school = get_current_school()
        serializer.save(school=school, created_by = self.request.user)

    
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
                'student_rank': enrollment.student.rank,
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

    def list(self, request):
        if request.user.role != 'instructor':
            return Response({'error': 'Instructors only'}, status=403)

        user = request.user
        school = user.school
        hod_dept_ids = list(
            DepartmentMembership.objects.filter(
                user=user, role=DepartmentMembership.Role.HOD, is_active=True,
            ).values_list('department_id', flat=True)
        )

        class_q = Q(instructor=user) | Q(subjects__instructor=user)
        subject_q = Q(instructor=user)
        exam_q = Q(subject__instructor=user)
        attendance_q = (
            Q(session__class_obj__instructor=user) |
            Q(session__subject__instructor=user)
        )
        if hod_dept_ids:
            class_q |= Q(department__in=hod_dept_ids)
            subject_q |= Q(class_obj__department__in=hod_dept_ids)
            exam_q |= Q(subject__class_obj__department__in=hod_dept_ids)
            attendance_q |= Q(session__class_obj__department__in=hod_dept_ids)

        my_classes = Class.all_objects.filter(
            class_q,
            school=school,
            is_active=True
        ).distinct()

        my_subjects = Subject.all_objects.filter(
            subject_q,
            school=school,
            is_active=True
        ).distinct()

        my_students_count = Enrollment.all_objects.filter(
            class_obj__in=my_classes,
            is_active=True
        ).values('student').distinct().count()

        my_exams = Exam.all_objects.filter(
            exam_q,
            school=school,
            is_active=True
        ).distinct()

        pending_results = ExamResult.all_objects.filter(
            exam__subject__instructor=user,
            school=school,
            is_submitted=False
        ).count()

        today = timezone.now().date()

        attendance_today = SessionAttendance.all_objects.filter(
            attendance_q,
            marked_at__date=today
        ).distinct().count()

        pending_edit_requests_count = 0
        if hod_dept_ids:
            pending_edit_requests_count = ResultEditRequest.objects.filter(
                exam_result__exam__subject__class_obj__department__in=hod_dept_ids,
                status=ResultEditRequest.Status.PENDING,
            ).count()

        return Response({
            'total_classes': my_classes.count(),
            'total_subjects': my_subjects.count(),
            'total_students': my_students_count,
            'total_exams': my_exams.count(),
            'pending_results': pending_results,
            'attendance_today': attendance_today,
            'pending_edit_requests': pending_edit_requests_count,
            'is_hod': bool(hod_dept_ids),
            'hod_departments': hod_dept_ids,
            'classes': ClassSerializer(my_classes, many=True).data,
            'subjects': SubjectSerializer(my_subjects, many=True).data
        })

    @action(detail=False, methods=['get'])
    def summary(self, request):
        if request.user.role != 'instructor':
            return Response(
                {'error': 'Only instructors can access the dashboard.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user= request.user
        hod_dept_ids = list(
            DepartmentMembership.objects.filter(
                user=user, role=DepartmentMembership.Role.HOD, is_active=True,
            ).values_list('department_id', flat=True)
        )

        class_q = Q(instructor=user) | Q(subjects__instructor=user)
        subject_q = Q(instructor=user)
        exam_q = Q(subject__instructor=user)
        attendance_q = (
            Q(session__class_obj__instructor=user) |
            Q(session__subject__instructor=user)
        )
        if hod_dept_ids:
            class_q |= Q(department__in=hod_dept_ids)
            subject_q |= Q(class_obj__department__in=hod_dept_ids)
            exam_q |= Q(subject__class_obj__department__in=hod_dept_ids)
            attendance_q |= Q(session__class_obj__department__in=hod_dept_ids)

        classes_count = Class.objects.filter(
            class_q,
            is_active=True
        ).distinct().count()

        subjects_count = Subject.objects.filter(
            subject_q,
            is_active=True
        ).distinct().count()

        instructor_class_ids = Class.objects.filter(
            class_q,
            is_active=True
        ).distinct().values_list('id', flat=True)

        students_count = Enrollment.objects.filter(
            class_obj_id__in=instructor_class_ids,
            is_active=True
        ).values('student').distinct().count()

        exams_count = Exam.objects.filter(
            exam_q,
            is_active=True
        ).distinct().count()

        pending_grading = ExamResult.objects.filter(
            exam__subject__instructor=user,
            is_submitted=False
        ).count()

        today = timezone.now().date()

        attendance_today = SessionAttendance.all_objects.filter(
            attendance_q,
            marked_at__date=today
        ).distinct().count()

        pending_edit_requests_count = 0
        if hod_dept_ids:
            pending_edit_requests_count = ResultEditRequest.objects.filter(
                exam_result__exam__subject__class_obj__department__in=hod_dept_ids,
                status=ResultEditRequest.Status.PENDING,
            ).count()

        return Response({
            'classes': classes_count,
            'subjects': subjects_count,
            'students': students_count,
            'exams': exams_count,
            'pending_grading': pending_grading,
            'attendance_today': attendance_today,
            'pending_edit_requests': pending_edit_requests_count,
            'is_hod': bool(hod_dept_ids),
        })

# students
class StudentDashboardViewset(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsStudent]

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
        today = timezone.now()

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

        show_all = request.query_params.get('show_all', 'false').lower() == 'true'

        active_enrollments = Enrollment.objects.filter(
            student=request.user,
            is_active=True
        ).values_list('class_obj_id', flat=True)

        if show_all:
            results = ExamResult.objects.filter(
                student=request.user,
                is_submitted=True
            ).select_related('exam', 'exam__subject', 'exam__subject__class_obj', 'graded_by')
        else:
            results = ExamResult.objects.filter(
                student=request.user,
                is_submitted=True,
                exam__subject__class_obj_id__in=active_enrollments
            ).select_related('exam', 'exam__subject', 'exam__subject__class_obj', 'graded_by')

        subject_id = request.query_params.get('subject_id')
        exam_id = request.query_params.get('exam_id')
        class_id = request.query_params.get('class_id')
        show_unread_only = request.query_params.get('unread_only', 'false').lower() == 'true'

        if subject_id:
            results = results.filter(exam__subject_id=subject_id)
        if exam_id:
            results = results.filter(exam_id=exam_id)
        if class_id:
            results = results.filter(exam__subject__class_obj_id=class_id)
            
        if show_unread_only:
            read_result_ids = ExamResultNotificationReadStatus.objects.filter(
                user=request.user
            ).values_list('exam_result_id', flat=True)
            results = results.exclude(id__in=read_result_ids)

        results = results.order_by('-graded_at')

        read_result_ids = ExamResultNotificationReadStatus.objects.filter(
            user=request.user
        ).values_list('exam_result_id', flat=True)
        
        if show_all:
            unread_count = ExamResult.objects.filter(
                student=request.user,
                is_submitted=True,
                marks_obtained__isnull=False
            ).exclude(
                id__in=read_result_ids
            ).count()
        else:
            unread_count = ExamResult.objects.filter(
                student=request.user,
                is_submitted=True,
                marks_obtained__isnull=False,
                exam__subject__class_obj_id__in=active_enrollments
            ).exclude(
                id__in=read_result_ids
            ).count()

        serializer = ExamResultSerializer(
            results, 
            many=True, 
            context={'request': request}
        )

        if results.exists():
            total_marks = sum(float(r.marks_obtained) for r in results if r.marks_obtained)
            total_possible = sum(r.exam.total_marks for r in results)
            average = (total_marks / total_possible * 100) if total_possible > 0 else 0

            stats = {
                'total_exams': results.count(),
                'average_percentage': round(average, 2),
                'total_marks_obtained': total_marks,
                'total_possible_marks': total_possible,
                'unread_notifications': unread_count
            }
        else:
            stats = {
                'total_exams': 0,
                'average_percentage': 0,
                'total_marks_obtained': 0,
                'total_possible_marks': 0,
                'unread_notifications': unread_count
            }
            
        return Response({
            'count': results.count(),
            'stats': stats,
            'results': serializer.data
        })
        
    def list(self, request):
        if request.user.role != 'student':
            return Response({
                'error': 'Only students can access the Student Dashboard'
            }, status=status.HTTP_401_UNAUTHORIZED)

        user = request.user

        enrollments = Enrollment.objects.filter(
            student = user,
            is_active=True
        ).select_related('class_obj', 'class_obj__course', 'class_obj__instructor')

        enrolled_class_ids = enrollments.values_list('class_obj_id',flat=True)

        active_enrollment = enrollments.first()
        active_class_id = None
        active_class_name = None
        active_course_name = None

        if active_enrollment:
            active_class_id = active_enrollment.class_obj.id
            active_class_name = active_enrollment.class_obj.name
            active_course_name = active_enrollment.class_obj.course.name


        subjects = Subject.objects.filter(
            class_obj_id__in = enrolled_class_ids,
            is_active=True
        ).select_related('instructor', 'class_obj')

        today = timezone.now()

        upcoming_exams = Exam.objects.filter(
            subject__class_obj_id__in = enrolled_class_ids,
            is_active=True,
            exam_date__gte = today,
            exam_date__lte = today + timedelta(days=30)
        ).select_related('subject', 'subject__class_obj').order_by('exam_date')

        recent_results = ExamResult.objects.filter(
            student = user,
            is_submitted=True
        ).select_related(
            'exam', 'exam__subject', 'graded_by'
        ).order_by(
            '-exam__exam_date'
        )[:10]

        total_attendance = SessionAttendance.objects.filter(
            student=user
        )
        present_count  = total_attendance.filter(
            status='present'
        ).count()
        late_count = total_attendance.filter(
            status='late'
        ).count()

        total_count = total_attendance.count()
        attendance_rate = ((present_count + late_count)/total_count * 100) if total_count > 0 else 0

        recent_notices = ClassNotice.objects.filter(
            class_obj_id__in = enrolled_class_ids,
            is_active=True
        ).filter(
            Q(expiry_date__isnull = True) |
            Q(expiry_date__gte = today)
        ).select_related(
            'class_obj', 'subject', 'created_by'
        ).order_by(
            '-created_at'
        ) [:10]

        general_notices = Notice.objects.filter(
            is_active=True
        ).filter(
            Q(expiry_date__isnull=True) | Q(expiry_date__gte=today)
        ).select_related('created_by').order_by('-created_at')[:5]

        personal_notifications = PersonalNotification.objects.filter(
            user=user,
            is_active = True
        ).select_related('created_by', 'exam_result', 'exam_result__exam').order_by('-created_at')[:10]

        unread_personal_notifications_count = PersonalNotification.objects.filter(
            user=user,
            is_active=True,
            is_read=False
        ).count()

        read_result_ids = ExamResultNotificationReadStatus.objects.filter(
            user=user
        ).values_list('exam_result_id', flat=True)

        unread_exam_results_count = ExamResult.objects.filter(
            student=user,
            is_submitted=True,
            marks_obtained__isnull=False
        ).exclude(
            id__in=read_result_ids
        ).count()

        read_notice_ids = ClassNoticeReadStatus.objects.filter(
            user=user
        ).values_list('class_notice_id', flat=True)
        
        unread_class_notices_count = ClassNotice.objects.filter(
            class_obj_id__in=enrolled_class_ids,
            is_active=True
        ).exclude(
            id__in=read_notice_ids
        ).filter(
            Q(expiry_date__isnull=True) | Q(expiry_date__gte=today)
        ).count()

        stats  = {
            'total_classes': enrollments.count(),
            'total_subjects': subjects.count(),
            'total_exams_taken':ExamResult.objects.filter(
                student=user,
                is_submitted=True
            ).count(),
            'pending_exams':upcoming_exams.count(),
            'attendance_rate':round(attendance_rate, 2),
            'total_attendance_records': total_count,
            'present_days': present_count,
            'absent_days':total_attendance.filter(status='absent').count(),
            'late_days':total_attendance.filter(status='late').count(),

        }

        stats['unread_notifications'] = {
            'exam_results': unread_exam_results_count,
            'class_notices': unread_class_notices_count,
            'personal_notifications': unread_personal_notifications_count,
            'total': unread_exam_results_count + unread_class_notices_count
        }

        if active_class_id:
            active_class_results = ExamResult.objects.filter(
                student=user,
                is_submitted=True,
                marks_obtained__isnull = False,
                exam__subject__class_obj_id = active_class_id
            )

            if active_class_results.exists():
                total_marks = sum(r.marks_obtained for r in active_class_results)
                total_possible = sum(r.exam.total_marks for r in active_class_results)
                average_percentage = (total_marks / total_possible * 100) if total_possible > 0 else 0

                if average_percentage >=91:
                    grade_letter = 'A'
                elif average_percentage >=86:
                    grade_letter = 'A-'
                elif average_percentage >= 81:
                    grade_letter = 'B+'
                elif average_percentage >= 76:
                    grade_letter = 'B'
                elif average_percentage >= 71:
                    grade_letter = 'B-'
                elif average_percentage >= 65:
                    grade_letter = 'C+'
                elif average_percentage >= 60:
                    grade_letter = 'C'
                elif average_percentage >= 50:
                    grade_letter = 'C-'
                else:
                    grade_letter = 'F'

                stats['active_class_id'] = active_class_id
                stats['active_class_name'] = active_class_name
                stats['active_course_name'] = active_course_name
                stats['average_grade'] = round(average_percentage, 2)
                stats['average_grade_letter'] = grade_letter
                stats['total_marks_obtained'] = total_marks
                stats['total_possible_marks'] = total_possible

            else:
                stats['active_class_id'] = active_class_id
                stats['active_class_name'] = active_class_name
                stats['active_course_name'] = active_course_name
                stats['average_grade'] = 0
                stats['average_grade_letter'] = 'N/A'
                stats['total_marks_obtained']= 0
                stats['total_possible_marks']= 0

        else:
            stats['average_grade'] = 0
            stats['average_grade_letter'] = 'N/A'
            stats['total_marks_obtained']= 0
            stats['total_possbile_marks'] = 0

        return Response({
            'stats':stats,
            'enrollments':EnrollmentSerializer(enrollments, many=True).data,
            'subjects':SubjectSerializer(subjects, many=True).data,
            'upcoming_exams':ExamSerializer(upcoming_exams, many=True).data,
            'recent_results':ExamResultSerializer(recent_results, many=True, context={'request': request}).data,
            'general_notices':NoticeSerializer(general_notices, many=True).data
        })

    @action(detail=False, methods=['get'])
    def my_attendance(self, request):

        if request.user.role != 'student':
            return Response({
                'error': 'Only students can access this endpoint'
            }, status=status.HTTP_403_FORBIDDEN)

        attendance = SessionAttendance.objects.filter(
            student=request.user,
        ).select_related('session', 'session__class_obj', 'session__subject', 'marked_by')

        class_id = request.query_params.get('class_id')
        subject_id = request.query_params.get('subject_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')


        if class_id:
            attendance = attendance.filter(session__class_obj_id = class_id)
        if subject_id:
            attendance = attendance.filter(session__subject_id = subject_id)
        if start_date:
            attendance = attendance.filter(marked_at__date__gte=start_date)
        if end_date:
            attendance = attendance.filter(marked_at__date__lte=end_date)

        status_order = Case(
            When(status='absent', then=Value(1)),
            When(status='late', then=Value(2)),
            When(status='present', then=Value(3)),
            When(status='excused', then=Value(4)),
            default=Value(5),
            output_field=IntegerField()
        )

        attendance = attendance.annotate(status_priority=status_order).order_by('status_priority', '-marked_at')

        serializer = SessionAttendanceSerializer(attendance, many=True)

        total = attendance.count()
        present = attendance.filter(status='present').count()
        absent = attendance.filter(status='absent').count()
        late = attendance.filter(status='late').count()
        excused = attendance.filter(status='excused').count()

        stats ={
            'total_records': total,
            'present': present,
            'absent': absent,
            'late': late,
            'excused': excused,
            'attendance_rate': round(((present + late) / total) * 100,2) if total > 0 else 0

        }

        return Response({
            'count':total,
            'stats':stats,
            'results': serializer.data
        })    

    @action(detail=False, methods=['get'])
    def my_notices(self, request):

        if request.user.role == 'student':
                
            enrolled_class_ids = Enrollment.objects.filter(
                student=request.user,
                is_active=True
            ).values_list('class_obj_id', flat=True)

            today = timezone.now()

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

            
            general_notices = general_notices.order_by('-created_at')

            context  ={'request': request}

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
        else:
            if request.user.role == "admin":
                notices = Notice.objects.filter(is_active=True)

            elif request.user.role  == "instructor":
                notices = Notice.objects.filter(
                    Q(created_by = request.user) | Q(created_by__isnull=True),
                    is_active=True
                )
            else:
                notices = Notice.objects.filter(is_active=True)

            notices = notices.filter(
                Q(expiry_date__isnull = True) | Q(expiry_date__gte=timezone.now())

            ).select_related('created_by').order_by('-created_at')


            context = {'request':request}

            serializer = NoticeSerializer(notices, many=True, context = context)

            return Response({
                'count':notices.count(),
                'results':serializer.data
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
        today = timezone.now()
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
        ).select_related('subject', 'subject__class_obj').order_by('exam_date')

        return Response({
            'start_date':today,
            'end_date': end_date,
            'exam_count': upcoming_exams.count(),
            'exams':ExamSerializer(upcoming_exams, many=True).data
        })
    
# attendance
class AttendanceSessionViewSet(viewsets.ModelViewSet):

    queryset = AttendanceSession.objects.select_related(
        'class_obj', 'subject', 'created_by'
    ).all()
    permission_classes = [IsAuthenticated, IsAdminOrInstructor]
    filterset_fields = ['class_obj', 'subject', 'session_type', 'status', 'is_active']
    search_fields = ['title', 'description']
    ordering_fields = ['scheduled_start', 'created_at']
    ordering  = ['-scheduled_start']

    def get_serializer_class(self):
        if self.action == "list":
            return AttendanceSessionListSerializer
        return AttendanceSessionSerializer

    def get_queryset(self):
        queryset = AttendanceSession.all_objects.select_related(
            'class_obj', 'subject', 'created_by'
        ).all()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()

        if user.role == 'superadmin':
            school = get_current_school()
            if school:
                queryset = queryset.filter(school=school)
        elif user.school:
            queryset = queryset.filter(school=user.school)
        else:
            return queryset.none()

        if user.role == 'instructor':
            queryset = queryset.filter(
                Q(class_obj__instructor=user) | Q(subject__instructor=user) | Q(created_by=user)
            ).distinct()
        elif user.role == 'student':
            enrolled_classes = Enrollment.all_objects.filter(
                student=user,
                is_active=True
            ).values_list('class_obj_id', flat=True)
            queryset = queryset.filter(class_obj_id__in=enrolled_classes)

        return queryset

    def perform_create(self, serializer):
        school = get_current_school() or self.request.user.school
        session = serializer.save(school=school, created_by=self.request.user)
        
        AttendanceSessionLog.objects.create(
            school=school,
            session=session,
            action='session_created',
            performed_by=self.request.user,
            description=f"Session '{session.title}' created"
        )

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):

        session = self.get_object()

        if session.start_session():
            AttendanceSessionLog.objects.create(
                session= session,
                action = 'session_started',
                performed_by = request.user,
                description = f"Session started",
                ip_address = request.META.get('REMOTE_ADDR')
            )

            serializer = self.get_serializer(session)
            return Response(
                {
                    'status': 'success',
                    'message': 'Session started successfully',
                    'session': serializer.data
                }
            )

        return Response(
            {
                'status':'error',
                'message': 'Session cannot be started. Check session status.'
            }, status=status.HTTP_400_BAD_REQUEST
        )

    @action(detail=True, methods=['post'])
    def end(self, request, pk=None):
        session = self.get_object()

        if session.end_session():

            marked_student_ids = session.session_attendances.values_list('student_id', flat=True)
            unmarked_students = User.objects.filter(
                enrollments__class_obj = session.class_obj,
                enrollments__is_active = True,
                role='student',
                is_active = True
            ).exclude(id__in=marked_student_ids)

            absent_records = []
            for student in unmarked_students:
                absent_records.append(SessionAttendance(
                    session=session,
                    student=student,
                    status='absent',
                    marking_method = 'admin',
                    marked_by =request.user,
                    remarks = 'Automatically marked absent when session ended'
                ))

            if absent_records:
                SessionAttendance.objects.bulk_create(absent_records)

            AttendanceSessionLog.objects.create(
                session=session,
                action = 'session_ended',
                performed_by = request.user,
                description = f"Session ended. {len(absent_records)} students marked absent automatically",
                ip_address= request.META.get('REMOTE_ADDR'),
                metadata = {'absent_count': len(absent_records)}
            )

            serializer = self.get_serializer(session)
            return Response({
                'status': "success",
                'message':'Session ended successuflly. {len(absent_records)} students marked absent.',
                'absent_marked': len(absent_records),
                'session': serializer.data
            })
        return Response({
            'status':'error',
            'message':'Session cannot be ended. Check session status'
        }, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def qr_code(self, request, pk=None):
        session = self.get_object()

        if session.status != 'active':
            return Response({
                'error': 'QR Scanning is not enabled for this session'
            }, status=status.HTTP_400_BAD_REQUEST)


        token = session.generate_qr_token()

        elapsed = (timezone.now() - session.qr_last_generated).total_seconds()\

        expires_time = max(0, int(session.qr_refresh_interval - elapsed))

        AttendanceSessionLog.objects.create(
            session=session,
            action='qr_generated',
            performed_by=request.user,
            description=f"QR code generated (count: {session.qr_generation_count})",
            metadata = {'token': token, 'expires_in': expires_time}

        )
        return Response({
            'session_id':str(session.session_id),
            'qr_token':token,
            'expires_time':expires_time,
            'refresh_interval':session.qr_refresh_interval,
            'generated_at':session.qr_last_generated,
            'generation_count':session.qr_generation_count
        })

    @action(detail=True, methods=['get'])
    def statistics(self, request, pk=None):
        session = self.get_object()

        attendances = session.session_attendances.all()

        status_counts = attendances.aggregate(
            present = Count(Case(When(status='present', then=1), output_field=IntegerField())),
            late= Count(Case(When(status='late', then=1), output_field=IntegerField())),
            absent = Count(Case(When(status='absent', then=1), output_field=IntegerField())),
            excused = Count(Case(When(status='excused', then=1), output_field=IntegerField()))
        )
        
        method_counts = attendances.aggregate(
            qr_scan=Count(Case(When(marking_method='qr_scan', then=1), output_field=IntegerField())),
            manual = Count(Case(When(marking_method='manual', then=1), output_field=IntegerField())),
            biometric = Count(Case(When(marking_method='biometric', then=1), output_field=IntegerField())),
            admin = Count(Case(When(marking_method='admin', then=1), output_field=IntegerField()))
        )

        total_students = session.total_students
        marked_count = attendances.count()

        attendance_rate = (marked_count /total_students * 100) if total_students > 0 else 0
        on_time_rate = (status_counts['present'] / marked_count * 100) if marked_count > 0 else 0

        statistics = {
            'total_students': total_students,
            'marked_count':marked_count,
            'present_count':status_counts['present'],
            'late_count': status_counts['late'],
            'absent_count': status_counts['absent'],
            'excused_count':status_counts['excused'],
            'attendance_rate':round(attendance_rate, 2),
            'on_time_rate':round(on_time_rate, 2),
            'qr_scan_count':method_counts['qr_scan'],
            'manual_count':method_counts['manual'],
            'biometric_count':method_counts['biometric'],
            'admin_count':method_counts['admin']
        }
        serializer = SessionAttendanceSerializer(attendances, many=True)
        
        return Response({
            'statistics':statistics,
            'session': AttendanceSessionSerializer(session).data,
            'count':attendances.count(),
            'attendances':serializer.data
        })

    @action(detail=True, methods=['get'])
    def unmarked_students(self, request, pk=None):
        session = self.get_object()

        marked_student_ids = session.session_attendances.values_list('student_id', flat=True)

        enrolled_students = User.objects.filter(
            enrollments__class_obj = session.class_obj,
            enrollments__is_active = True,
            role='student',
            is_active=True
        ).exclude(id__in=marked_student_ids).order_by('first_name', 'last_name')

        from .serializers import UserListSerializer

        serializer = UserListSerializer(enrolled_students, many=True)

        return Response({
            'session_id':session.id,
            'session_title':session.title,
            'count':enrolled_students.count(),
            'unmarked_students':serializer.data
        })

    @action(detail=True, methods=['post'])
    def mark_absent(self, request, pk=None):
        session = self.get_object()

        if session.status != 'completed':
            return Response({
                'error': 'Session must be completed before marking absent students'
            }, status= status.HTTP_400_BAD_REQUEST)


        marked_student_ids = session.session_attendances.values_list('student_id', flat=True)
        unmarked_students = User.objects.filter(
            enrollments__class_obj = session.class_obj,
            enrollments__is_active = True,
            role='student',
            is_active=True
        ).exclude(id__in=marked_student_ids)

        absent_records = []

        for student in unmarked_students:
            absent_records.append(SessionAttendance(
                session=session,
                student= student,
                status = 'absent',
                marking_method = 'admin',
                marked_by = request.user,
                remarks = 'Automatically marked absent after session ended'
            ))

        SessionAttendance.objects.bulk_create(absent_records)

        AttendanceSessionLog.objects.create(
            session=session,
            action= 'bulk_import',
            performed_by=request.user,
            description = f"Marked {len(absent_records)} students as absent",
            metadata = {'count': len(absent_records)}
        )

        return Response({
            'status': 'success',
            'message':f'{len(absent_records)} students marked as absent',
            'count':len(absent_records)
        })

    @action(detail=True, methods=['get'])
    def export_csv(self, request, pk=None):

        session = self.get_object()

        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow(
            [
                'Student Name', 'Rank', 'SVC Number', 'Email', 'Status',
                'Marking Method', 'Marked At', 'Minutes Late', 'Remarks', 'Time'
            ]
        )

        attendances = session.session_attendances.select_related('student').order_by('student__last_name')
        for attendance in attendances:

            minutes_late = ''
            if attendance.status == 'late':
                delta = attendance.marked_at - session.scheduled_start
                minutes_late = round(delta.total_seconds() / 60,1)

            writer.writerow([
                attendance.student.get_full_name(),
                attendance.student.get_rank_display() if attendance.student.rank else '',
                attendance.student.svc_number,
                attendance.student.email,
                attendance.get_status_display(),
                attendance.get_marking_method_display(),
                attendance.marked_at.strftime('%Y-%m-%d %H:%M:%S'),
                minutes_late,
                attendance.remarks or ''
            ])

        output.seek(0)
        response = HttpResponse(output.getvalue(), content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="attendance_{session.session_id}.csv"'

        return response

    @action(detail=False, methods=['get'])
    def my_sessions(self, request):

        if request.user.role != 'instructor':
            return Response({
                'error': 'only instructors can access this endpoint'
            }, status=status.HTTP_403_FORBIDDEN)

        sessions = self.get_queryset().filter(
            Q(class_obj__instructor=request.user)|
            Q(subject__instructor=request.user)|
            Q(created_by=request.user)
            ).annotate(
                marked_count_db=Count('session_attendances', distinct=True)
            )

        status_filter = request.query_params.get('status')
        if status_filter:
            sessions = sessions.filter(status=status_filter)

        serializer = self.get_serializer(sessions, many=True)

        return Response({
            'count':sessions.count(),
            'sessions':serializer.data
        })

    @action(detail=False, methods=['get'])
    def active_sessions(self, request):

        active_sessions = self.get_queryset().filter(
            status='active', is_active=True)

        serializer = self.get_serializer(active_sessions, many=True)
        return Response(
            {
                'count':active_sessions.count(),
                'sessions':serializer.data
            }
        )

    @action(detail=True, methods=['get'])
    def attendances(self, request, pk=None):
        session = self.get_object()
        attendances = session.session_attendances.select_related(
            'student', 'marked_by'
        ).all()

        serializer = SessionAttendanceSerializer(attendances, many=True)
        return Response(
            {
                'session_id':session.id,
                'session_title':session.title,
                'count':attendances.count(),
                'attendances':serializer.data
            }
        )

    @action(detail=True, methods=['get'])
    def detailed_view(self, request, pk=None):
        session = self.get_object()
        
        attendances = session.session_attendances.select_related('student', 'marked_by').all()
        
        total_students = session.total_students
        marked_count = attendances.count()
        
        status_counts = {
            'present': attendances.filter(status='present').count(),
            'late': attendances.filter(status='late').count(),
            'absent': attendances.filter(status='absent').count(),
            'excused': attendances.filter(status='excused').count()
        }
        
        method_counts = {
            'qr_scan': attendances.filter(marking_method='qr_scan').count(),
            'manual': attendances.filter(marking_method='manual').count(),
            'biometric': attendances.filter(marking_method='biometric').count(),
            'admin': attendances.filter(marking_method='admin').count()
        }
        
        marked_student_ids = attendances.values_list('student_id', flat=True)
        unmarked_students = User.objects.filter(
            enrollments__class_obj=session.class_obj,
            enrollments__is_active=True,
            role='student',
            is_active=True
        ).exclude(id__in=marked_student_ids)
        
        from .serializers import UserListSerializer
        
        return Response({
            'session': AttendanceSessionSerializer(session).data,
            'statistics': {
                'total_students': total_students,
                'marked_count': marked_count,
                'unmarked_count': total_students - marked_count,
                'attendance_rate': round((marked_count / total_students * 100), 2) if total_students > 0 else 0,
                'on_time_rate': round((status_counts['present'] / marked_count * 100), 2) if marked_count > 0 else 0,
                'status_breakdown': status_counts,
                'method_breakdown': method_counts
            },
            'attendances': SessionAttendanceSerializer(attendances, many=True).data,
            'unmarked_students': UserListSerializer(unmarked_students, many=True).data
        })

class SessionAttendanceViewset(viewsets.ModelViewSet):

    queryset = SessionAttendance.objects.select_related(
        'session', 'student', 'marked_by'
    ).all()

    serializer_class = SessionAttendanceSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, FormParser, MultiPartParser]
    filter_backends  = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['session', 'student', 'status', 'marking_method']
    search_fields = ['student__first_name', 'student__last_name', 'student__svc_number']
    ordering = ['marked_at']
    ordering_fields = ['marked_at', 'student__last_name']

    def get_queryset(self):
        queryset = SessionAttendance.all_objects.select_related(
            'session', 'student', 'marked_by'
        ).all()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()

        if user.role == 'superadmin':
            school = get_current_school()
            if school:
                queryset = queryset.filter(school=school)
        elif user.school:
            queryset = queryset.filter(school=user.school)
        else:
            return queryset.none()

        if user.role == 'instructor':
            queryset = queryset.filter(
                Q(session__class_obj__instructor=user) | Q(session__subject__instructor=user)
            )
        elif user.role == 'student':
            queryset = queryset.filter(student=user)

        return queryset

    def perform_create(self, serializer):
        
        school = get_current_school()
        attendance = serializer.save(marked_by=self.request.user)

        AttendanceSessionLog.objects.create(
            session=attendance.session,
            action='attendance_marked',
            performed_by=self.request.user,
            description=f"Attendance marked for {attendance.student.get_full_name()}",
            metadata ={
                'student_id':attendance.student.id,
                'status':attendance.status,
                'method':attendance.marking_method
            }
        )

    @action(detail=False, methods=['post'])
    def mark_qr(self, request):
        
        serializer = QRAttendanceMarkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        session = serializer.validated_data['session']
        student = request.user


        if not Enrollment.objects.filter(
            student=student,
            class_obj=session.class_obj,
            is_active=True
        ).exists():
            return Response({
                'error': 'You are not enrolled in this class'
            }, status=status.HTTP_403_FORBIDDEN)

        if SessionAttendance.objects.filter(session=session, student=student).exists():
            return Response({
                'error': 'You have already marked attendance for this session.'
            }, status=status.HTTP_400_BAD_REQUEST)


        attendance_time = timezone.now()
        attendance_status = session.get_attendance_status_for_time(attendance_time)

        attendance = SessionAttendance.objects.create(
            session=session,
            student=student,
            status= attendance_status,
            marking_method = 'qr_scan',
            marked_by = student,
            latitude = serializer.validated_data.get('latitude'),
            longitude = serializer.validated_data.get('longitude'),
            ip_address = request.META.get('REMOTE_ADDR'),
            user_agent= request.META.get('HTTP_USER_AGENT', '')


        )

        return Response({
            'status': 'success',
            'message':f'Attendance marked as {attendance.get_status_display()}',
            'attendance':SessionAttendanceSerializer(attendance).data
        })

    @action(detail=False, methods=['post'])
    def bulk_mark(self, request):

        serializer = BulkSessionAttendanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)


        session = AttendanceSession.objects.get(id=serializer.validated_data['session_id'])
        records = serializer.validated_data['attendance_records']

        created_count = 0
        updated_count = 0
        errors =[]

        for record in records:
            try:
                student = User.objects.get(id=record['student_id'], role='student')

                if not Enrollment.objects.filter(
                    student=student,
                    class_obj=session.class_obj,
                    is_active=True
                ).exists():
                    errors.append(f"Student {student.get_full_name()} is not enrolled.")
                    continue

                attendance, created  =SessionAttendance.objects.update_or_create(
                    session = session,
                    student = student,
                    defaults = {
                        'status': record['status'],
                        'marking_method': 'manual',
                        'marked_by': request.user,
                        'remarks':record.get('remarks', '')
                    }
                )

                if created:
                    created_count += 1
                else:
                    updated_count += 1

            except User.DoesNotExist:
                errors.append(f"Student ID {record['student_id']} not found")
            except Exception as e:
                errors.append(f"Error processing student{record['student_id']}: {str(e)}")


        AttendanceSessionLog.objects.create(
            session=session,
            action = 'bulk_import',
            performed_by=request.user,
            metadata = {
                'created':created_count,
                'updated':updated_count,
                'errors':len(errors)
            }
        )    


        return Response({
            'status':'success',
            'created':created_count,
            'updated':updated_count,
            'errors':errors
        })

    @action(detail=False, methods=['get'])
    def my_attendance(self, request):

        if request.user.role != 'student':
            return Response({
                'error':'Only students can access this endpoint'
            }, status=status.HTTP_403_FORBIDDEN)

        attendances = self.get_queryset().filter(student=request.user).order_by('-marked_at')

        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        if start_date:
            attendances = attendances.filter(marked_at__gte=start_date)
        if end_date:
            attendances = attendances.filter(marked_at__lte=end_date)
        
        attendance_status = request.query_params.get('status')
        if attendance_status:
            attendances = attendances.filter(status=attendance_status)

        serializer = self.get_serializer(attendances, many=True)

        total = attendances.count()
        present= attendances.filter(status='present').count()
        late = attendances.filter(status='late').count()

        return Response({
            'count':total,
            'statistics':{
                'total':total,
                'present':present,
                'late':late,
                'absent':attendances.filter(status='absent').count(),
                'excused':attendances.filter(status='excused').count(),
                'attendance_rate':round((present + late) / total * 100, 2) if total > 0 else 0
            },
            'attendances': serializer.data
        })

class BiometricRecordViewset(viewsets.ModelViewSet):

    queryset = BiometricRecord.objects.select_related(
        'student', 'session', 'session_attendance'
    ).all()

    serializer_class = BiometricRecordSerializer
    permission_classes = [IsAuthenticated, IsAdminOrInstructor]
    filterset_fields =['device_id', 'device_type', 'student', 'session', 'processed']
    search_fields = ['student__first_name', 'student__last_name', 'biometric_id']
    ordering = ['-scan_time']

    def get_queryset(self):
        queryset = BiometricRecord.all_objects.select_related('student', 'session').all()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()

        if user.role == 'superadmin':
            school = get_current_school()
            if school:
                return queryset.filter(school=school)
            return queryset

        if user.school:
            return queryset.filter(school=user.school)

        return queryset.none()

    @action(detail=False, methods=['post'])
    def sync(self, request):
        serializer = BiometricSyncSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        device_id = serializer.validated_data['device_id']
        device_type = serializer.validated_data['device_type']
        records = serializer.validated_data['records']

        created_count = 0
        processed_count = 0
        errors = []

        for record in records:
            try:

                scan_time = parser.parse(record['scan_time'])

                student = User.objects.filter(
                    svc_number=record['biometric_id'],
                    role='student',
                    is_active=True
                ).first()

                if not student:
                    errors.append(f"Student not found for biometric ID: {record['biometric_id']}")
                    continue
                biometric_record, created = BiometricRecord.objects.get_or_create(
                    device_id = device_id,
                    biometric_id = record['biometric_id'],
                    scan_time = scan_time,
                    defaults = {
                        'device_type': device_type,
                        'student': student,
                        'verification_type': record.get('verification_type', ''),
                        'verification_score':record.get('verification_score'),
                        'raw_data': record
                    }
                )

                if created:
                    created_count +=1

                    attendance = biometric_record.process_to_attendance()
                    if attendance:
                        processed_count +=1
            except Exception as e:
                errors.append(f"Error processing record for {record.get('biometric_id')}: {str(e)}")
        
        return Response({
            'status': 'success',
            'created': created_count,
            'processed': processed_count,
            'errors':errors
        })

    @action(detail=False, methods=['post'])
    def process_pending(self, request):
        pending_records = BiometricRecord.objects.filter(
            processed = False
        ).select_related('student')

        processed_count =0 
        failed_count = 0
        errors = []

        for record in pending_records:
            try:
                attendance  =record.process_to_attendance()
                if attendance:
                    processed_count +=1
                else:
                    failed_count +=1
                    if record.error_message:
                        errors.append(f"Record {record.id}: {record.error_message}")
            except Exception as e:
                failed_count += 1
                errors.append(f"Record {record.id}: {str(e)}")

        return Response({
            'status':'success',
            'processed':processed_count,
            'failed': failed_count,
            'errors':errors
        })

    @action(detail=False, methods=['get'])
    def unprocessed(self, request):
        unprocessed = self.get_queryset().filter(processed=False)
        serializer = self.get_serializer(unprocessed, many=True)

        return Response(
            {
                'count':unprocessed.count(),
                'records':serializer.data
            }
        )

class AttendanceReportViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsAdminOrInstructor]

    @action(detail=False, methods=['get'])
    def class_summary(self, request):
        class_id = request.query_params.get('class_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        if not class_id:
            return Response({
                'error': 'class_id parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            class_obj = Class.objects.get(id=class_id)

        except Class.DoesNotExist:
            return Response({
                'error': 'Class not found'
            }, status=status.HTTP_404_NOT_FOUND)


        session_qs = AttendanceSession.objects.filter(class_obj=class_obj)

        # Interpret start_date/end_date as inclusive dates. Use the
        # scheduled_start__date lookup so sessions scheduled anytime during
        # the given day are included (avoids excluding sessions later in the day).
        if start_date:
            session_qs = session_qs.filter(scheduled_start__date__gte=start_date)
        if end_date:
            session_qs = session_qs.filter(scheduled_start__date__lte=end_date)
            session_qs = session_qs.filter(scheduled_start__date__lte=end_date)


        sessions = session_qs.order_by('-scheduled_start')

        enrolled_students = User.objects.filter(
            enrollments__class_obj = class_obj,
            enrollments__is_active = True,
            role='student',
            is_active=True
        ).distinct()

        student_stats =[]

        for student in enrolled_students:
            attendances = SessionAttendance.objects.filter(
                session__in =sessions,
                student = student
            )

            total_sessions = sessions.count()
            attended = attendances.count()
            present = attendances.filter(status='present').count()
            late = attendances.filter(status='late').count()
            absent = total_sessions - attended

            attendance_rate = (attended / total_sessions * 100) if total_sessions > 0 else 0
            punctuality_rate  =(present/attended * 100) if attended > 0 else 0

            student_stats.append({
                'student_id': student.id,
                'student_name':student.get_full_name(),
                'svc_number':student.svc_number,
                'total_sessions':total_sessions,
                'attended':attended,
                'present':present,
                'late':late,
                'absent':absent,
                'excused':attendances.filter(status='excused').count(),
                'attendance_rate':round(attendance_rate, 2),
                'punctuality_rate':round(punctuality_rate, 2)

                            })

        student_stats.sort(key=lambda x: x['attendance_rate'], reverse=True)

        total_sessions_count = sessions.count()
        total_attendances = SessionAttendance.objects.filter(
            session__in = sessions
        ).count()
        expected_attendances = total_sessions_count * enrolled_students.count()

        class_attendance_rate = (total_attendances / expected_attendances * 100) if expected_attendances > 0 else 0

        return Response({
            'class':{
                'id': class_obj.id,
                'name': class_obj.name,
                'course': class_obj.course.name if hasattr(class_obj, 'course') else None
            },
            'period':{
                'start_date':start_date,
                'end_date':end_date,
                'total_sessions':total_sessions_count
            },
            'overall_statistics':{
                'total_students':enrolled_students.count(),
                'total_sessions':total_sessions_count,
                'expected_attendances':expected_attendances,
                'actual_attendances':total_attendances,
                'class_attendance_rate':round(class_attendance_rate, 2)
            },
            'student_statistics': student_stats
        })

    @action(detail=False, methods=['get'])
    def student_detail(self, request):
        
        student_id = request.query_params.get('student_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        if not student_id:
            return Response({
                'error': 'student__id parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            student = User.objects.get(id=student_id, role='student')
        except User.DoesNotExist:
            return Response({
                'error': 'Student not found'
            }, status = status.HTTP_404_NOT_FOUND)


        enrolled_classes = Class.objects.filter(
            enrollments__student = student,
            enrollments__is_active = True
        ).distinct()

        attendances_qs = SessionAttendance.objects.filter(student=student)

        if start_date:
            attendances_qs = attendances_qs.filter(marked_at__gte=start_date)
        if end_date:
            attendances_qs = attendances_qs.filter(marked_at__lte=end_date)


        attendances  =attendances_qs.select_related('session', 'session__class_obj', 'session__subject')

        total_attendances = attendances.count()
        status_breakdown ={
            'present':attendances.filter(status='present').count(),
            'late':attendances.filter(status='late').count(),
            'absent':attendances.filter(status='absent').count(),
            'excused':attendances.filter(status='excused').count()
        }

        method_breakdown = {
            'qr_scan': attendances.filter(marking_method='qr_scan').count(),
            'manual': attendances.filter(marking_method='manual').count(),
            'biometric':attendances.filter(marking_method='biometric').count(),
            'admin':attendances.filter(marking_method='admin').count()
                     }


        class_breakdown = []
        for class_obj in enrolled_classes:
            class_attendances = attendances.filter(session__class_obj=class_obj)
            class_sessions = AttendanceSession.objects.filter(
                class_obj=class_obj
            )

            if start_date:
                class_sessions = class_sessions.filter(scheduled_start__gte = start_date)
            if end_date:
                class_sessions = class_sessions.filter(scheduled_start__lte=end_date)

            total_class_sessions = class_sessions.count()
            attended = class_attendances.count()
            attendance_rate = (attended / total_class_sessions * 100) if total_class_sessions > 0 else 0

            class_breakdown.append({
                'class_id':class_obj.id,
                'class_name':class_obj.name,
                'total_sessions':total_class_sessions,
                'attended':attended,
                'present':class_attendances.filter(status='present').count(),
                'late':class_attendances.filter(status='late').count(),
                'absent':total_class_sessions - attended,
                'attendance_rate':round(attendance_rate, 2)
            })
        # recent attendances across all classes (most recent 20)
        recent = attendances.order_by('-marked_at')[:20]

        # Build by_class mapping expected by frontend: { class_name: { rate, present, late, absent } }
        by_class = {}
        total_sessions_all = 0
        for cb in class_breakdown:
            cname = cb.get('class_name') or str(cb.get('class_id'))
            by_class[cname] = {
                'rate': cb.get('attendance_rate', 0),
                'present': cb.get('present', 0),
                'late': cb.get('late', 0),
                'absent': cb.get('absent', 0)
            }
            total_sessions_all += cb.get('total_sessions', 0)

        # Derive top-level counts expected by frontend
        present_count = status_breakdown.get('present', 0)
        late_count = status_breakdown.get('late', 0)
        absent_count = status_breakdown.get('absent', 0)

        overall_attendance_rate = 0
        if total_sessions_all > 0:
            overall_attendance_rate = round((total_attendances / total_sessions_all) * 100, 2)

        return Response({
            'student_name': student.get_full_name(),
            'student': {
                'id': student.id,
                'svc_number': student.svc_number,
                'email': student.email
            },
            'period': {
                'start_date': start_date,
                'end_date': end_date
            },
            'attendance_rate': overall_attendance_rate,
            'present_count': present_count,
            'late_count': late_count,
            'absent_count': absent_count,
            'by_class': by_class,
            'overall_statistics': {
                'total_attendances': total_attendances,
                'status_breakdown': status_breakdown,
                'method_breakdown': method_breakdown
            },
            'class_breakdown': class_breakdown,
            'recent_attendances': SessionAttendanceSerializer(recent, many=True).data
        })
            
    @action(detail=False, methods=['get'])
    def session_comparison(self, request):

        session_ids = request.query_params.getlist('session_ids')

        if not session_ids:
            return Response({
                'error':'sesssion_ids parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)


        sessions = AttendanceSession.objects.filter(
            id__in=session_ids
        ).prefetch_related('session_attendances')\

        comparison = []

        for session in sessions:
            attendances = session.session_attendances.all()
            total_students = session.total_students

            comparison.append(
                {
                    'session_id':session.id,
                    'title':session.title,
                    'session_type':session.get_session_type_display(),
                    'scheduled_start':session.scheduled_start,
                    'total_students':total_students,
                    'marked_count':attendances.count(),
                    'present':attendances.filter(status='present').count(),
                    'late':attendances.filter(status='late').count(),
                    'absent':attendances.filter(status='absent').count(),
                    'attendance_rate':round((attendances.count() / total_students * 100), 2) if total_students > 0 else 0

                }
            )

        return Response({
            'session_count':len(comparison),
            'comparison': comparison
        })

    @action(detail=False, methods=['get'])
    def trend_analysis(self, request):

        class_id = request.query_params.get('class_id')
        days = int(request.query_params.get('days', 30))

        if not class_id:
            return Response({
                'error': 'class_id parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        try:
            class_obj = Class.objects.get(id=class_id)
        except Class.DoesNotExist:
            return Response({
                'error': 'Class not found'
            }, status=status.HTTP_404_NOT_FOUND)

        end_date = timezone.now()
        start_date = end_date -timedelta(days=days)

        sessions = AttendanceSession.objects.filter(
            class_obj = class_obj,
            scheduled_start__gte = start_date,
            scheduled_start__lte = end_date
        ).prefetch_related('session_attendances').order_by('scheduled_start')

        trend_data = []

        for session in sessions:
            attendances = session.session_attendances.all()
            total_students = session.total_students

            present_count = attendances.filter(status='present').count()
            late_count = attendances.filter(status='late').count()
            attended_count = present_count + late_count

            absent_count = attendances.filter(status='absent').count()

            not_recorded = total_students - attendances.count()
            total_absent = absent_count + not_recorded

            trend_data.append({
                'date':session.scheduled_start.date(),
                'session_title':session.title,
                'total_students':total_students,
                'present':present_count,
                'late':late_count,
                'absent':total_absent,
                'attendance_rate':round(float((attendances.count() / total_students) * 100), 2) if total_students > 0  else 0
                
            })

        if len(trend_data) >=3:
            for i in range(2, len(trend_data)):
                window = trend_data[i-2:i+1]
                avg_rate = sum(d['attendance_rate'] for d in window) / 3
                trend_data[i]['moving_average'] = round(avg_rate, 2)

        return Response({
            'class':{
                'id':class_obj.id,
                'name':class_obj.name
            },
            'period':{
                'start_date':start_date.date(),
                'end_date':end_date.date(),
                'days':days
            },
            'trend_data': trend_data,
        })

    @action(detail=False, methods=['get'])
    def low_attendance_alert(self, request):
        class_id = request.query_params.get('class_id')
        threshold = float(request.query_params.get('threshold', 75.0))
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        if not class_id:
            return Response({
                'error':'class_id parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)


        date_filter = {}
        if start_date:
            try:
                date_filter['date__gte'] = datetime.strptime(start_date, '%Y-%m-%d').date()
            except ValueError:
                return Response({
                    'error':'Invalid start_date format. Use YYYY-MM-DD'
                }, status=status.HTTP_400_BAD_REQUEST)

        if end_date:
            try:
                date_filter['date__lte'] = datetime.strptime(end_date, '%Y-%m-%d').date()
            except ValueError:
                return Response({
                    'error': 'Invalid end_date format. Use YYYY-MM-DD'
                }, status=status.HTTP_400_BAD_REQUEST)

        try:
            class_obj = Class.objects.get(id=class_id)
        except Class.DoesNotExist:
            return Response({
                'error': "Class Not Found"
            }, status=status.HTTP_404_NOT_FOUND)

        sessions = AttendanceSession.objects.filter(
            class_obj = class_obj,
            **date_filter
        )
        total_sessions = sessions.count()

        if total_sessions == 0:
            return Response({
                'message': 'No Sessions Found for this class in the specified date range',
                'students': []
            })

        
        enrolled_students = User.objects.filter(
            enrollments__class_obj = class_obj,
            enrollments__is_active = True,
            role ='student',
            is_active=True
        ).distinct()

        attendance_data = SessionAttendance.objects.filter(
            session__in=sessions
        ).values('student').annotate(
            attended_count = Count('id')
        )

        attendance_lookup = {
            item['student']: item['attended_count']
            for item in attendance_data
        }

        low_attendance_students =[]
        
        for student in enrolled_students:
            attended = attendance_lookup.get(student.id, 0)
            attendance_rate = (attended / total_sessions * 100) if total_sessions > 0 else 0
            
            if attendance_rate < threshold:
                low_attendance_students.append({
                    'id':student.id,
                    'student_id':student.id,
                    'student_name': student.get_full_name(),
                    'name':student.get_full_name(),
                    'first_name': student.first_name,
                    'last_name':student.last_name,
                    'svc_number':student.svc_number,
                    'email':student.email,
                    'class_name':class_obj.name,
                    'total_sessions':total_sessions,
                    'attended':attended,
                    'missed':total_sessions - attended,
                    'attendance_rate':round(attendance_rate, 2),
                    'status': 'critical' if attendance_rate < 50 else 'warning'
                })

        low_attendance_students.sort(key=lambda x:x['attendance_rate'])

        return Response({
            'class':{
                'id':class_obj.id,
                'name':class_obj.name
            },
            'date_range':{
                'start_date': start_date,
                'end_date': end_date
            },
            'threshold':threshold,
            'total_sessions':total_sessions,
            'count':len(low_attendance_students),
            'students':low_attendance_students
        })
# personalnotification
class PersonalNotificationViewSet(viewsets.ModelViewSet):

    serializer_class = PersonalNotificationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['notification_type', 'priority', 'is_read', 'is_active']
    search_fields = ['title', 'content']
    ordering = ['-created_at']

    def get_queryset(self):
        return PersonalNotification.objects.filter(
            user=self.request.user,
            is_active = True
        ).select_related('created_by', 'exam_result', 'exam_result__exam')

    @action(detail=False, methods=['get'])
    def unread(self, request):

        unread = self.get_queryset().filter(is_read=False)
        serializer = self.get_serializer(unread, many=True)
        return Response({
            'count':unread.count(),
            'results':serializer.data
        })

    @action(detail=True, methods=['post'])
    def mark_as_read(self, request, pk=None):

        notification = self.get_object()
        notification.is_read = True
        notification.read_at = timezone.now()
        notification.save()

        return Response({
            'status':'success',
            'message':'Notification marked as read',
            'notification': self.get_serializer(notification).data
        })

    @action(detail=False, methods=['post'])
    def mark_all_as_read(self, request):

        updated = self.get_queryset().filter(is_read=False).update(
            is_read=True,
            read_at=timezone.now()
        )

        return Response({
            'status':'success',
            'message':f"{updated} notification marked as read",
            'count':updated
        })

    @action(detail=False, methods=['get'])
    def exam_results(self, request):

        notifications = self.get_queryset().filter(notification_type='exam_result')
        serializer = self.get_serializer(notifications, many=True)
        return Response({
            'count': notifications.count(),
            'results':serializer.data
        })

    @action(detail=False, methods=['get'])
    def stats(self, request):

        queryset = self.get_queryset()
        stats ={
            'total':queryset.count(),
            'unread':queryset.filter(is_read=False).count(),
            'by_type':{
                'exam_result':queryset.filter(notification_type='exam_result').count(),
                'general': queryset.filter(notification_type='general').count(),
                'alert': queryset.filter(notification_type='alert').count(),
            },
            'unread_by_priority':{
                'high':queryset.filter(is_read=False, priority='high').count(),
                'medium':queryset.filter(is_read=False, priority='medium').count(),
                'low':queryset.filter(is_read=False, priority='low').count(),
            }

        }
        return Response(stats)

class CertificateTemplateViewSet(viewsets.ModelViewSet):

    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['template_type', 'is_active', 'is_default']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'created_at']
    ordering = ['-created_at']

    def get_queryset(self):
        qs = CertificateTemplate.all_objects.select_related('school').all()
        user = self.request.user
        if not user.is_authenticated:
            return qs.none()
        if user.active_role == 'superadmin':
            school = get_current_school()
            return qs.filter(school=school) if school else qs
        if user.school:
            return qs.filter(school=user.school)
        return qs.none()

    def get_serializer_class(self):
        if self.action == 'list':
            return CertificateTemplateSerializer
        return CertificateTemplateSerializer

    def perform_create(self, serializer):
        school = get_current_school() or self.request.user.school
        if serializer.validated_data.get('is_default'):
            CertificateTemplate.objects.filter(
                school=school, is_default=True,
            ).update(is_default=False)
        serializer.save(school=school)

    @action(detail=True, methods=['post'])
    def set_default(self, request, pk=None):
        template = self.get_object()
        CertificateTemplate.objects.filter(
            school=template.school, is_default=True,
        ).update(is_default=False)
        template.is_default = True
        template.save(update_fields=['is_default', 'updated_at'])
        return Response({
            'status': 'success',
            'message': f'Template "{template.name}" set as default',
        })

    @action(detail=True, methods=['get'])
    def preview(self, request, pk=None):
        template = self.get_object()
        from .services import CertificateImageResolver
        resolver = CertificateImageResolver(template.school)
        branding = resolver.get_school_branding()
        preview_data = {
            **branding,
            'certificate_number': 'SAMPLE-2024-00001',
            'verification_code': 'SAMPLE123456789ABCDEF',
            'student_name': 'John Doe',
            'student_svc_number': 'SVC-12345',
            'student_rank': 'Sergeant',
            'course_name': 'Sample Course',
            'class_name': 'Sample Class 2024',
            'final_grade': 'A',
            'final_percentage': 92.5,
            'completion_date': timezone.now().date(),
            'issued_at': timezone.now(),
            'header_text': template.header_text,
            'signatory_name': template.signatory_name,
            'signatory_title': template.signatory_title,
        }
        return Response(preview_data)

class CertificateViewSet(viewsets.ReadOnlyModelViewSet):

    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'student', 'class_obj']
    search_fields = ['certificate_number', 'student_name', 'course_name', 'class_name']
    ordering_fields = ['issued_at', 'created_at', 'certificate_number']
    ordering = ['-issued_at']

    def get_queryset(self):
        qs = Certificate.all_objects.select_related(
            'school', 'student', 'class_obj', 'enrollment',
            'template', 'issued_by', 'revoked_by',
        )
        user = self.request.user
        if not user.is_authenticated:
            return qs.none()
        if user.active_role == 'superadmin':
            school = get_current_school()
            return qs.filter(school=school) if school else qs
        if user.active_role == 'student':
            return qs.filter(student=user)
        if user.school:
            return qs.filter(school=user.school)
        return qs.none()

    def get_serializer_class(self):
        if self.action == 'list':
            return CertificateListSerializer
        return CertificateSerializer

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        certificate = self.get_object()
        user = request.user

        if user.active_role == 'student' and certificate.student != user:
            return Response(
                {'error': 'You can only download your own certificates'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Generate on-demand if no file exists
        if not certificate.certificate_file:
            try:
                generator = CertificateGenerator(certificate)
                generator.save_to_model()
                certificate.refresh_from_db()
            except Exception as e:
                logger.error(f"Error generating certificate: {e}", exc_info=True)
                return Response(
                    {'error': 'Failed to generate certificate'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        # Audit log
        CertificateDownloadLog.objects.create(
            school=certificate.school,
            certificate=certificate,
            downloaded_by=user,
            download_type='pdf',
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )
        certificate.record_download()

        response = FileResponse(
            certificate.certificate_file.open('rb'),
            content_type='application/pdf',
        )
        safe_number = certificate.certificate_number.replace('/', '_')
        response['Content-Disposition'] = (
            f'attachment; filename="certificate_{safe_number}.pdf"'
        )
        return response

    @action(detail=True, methods=['get'])
    def preview(self, request, pk=None):
        certificate = self.get_object()
        generator = CertificateGenerator(certificate)
        html_bytes, _ = generator.generate(fmt='html')
        certificate.record_view()
        return HttpResponse(html_bytes, content_type='text/html')

    @action(detail=True, methods=['post'])
    def regenerate(self, request, pk=None):
        certificate = self.get_object()
        try:
            generator = CertificateGenerator(certificate)
            generator.save_to_model()
            return Response({
                'status': 'success',
                'message': 'Certificate regenerated successfully',
            })
        except Exception as e:
            logger.error(f"Error regenerating certificate: {e}", exc_info=True)
            return Response(
                {'error': 'Failed to regenerate certificate'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        certificate = self.get_object()
        if certificate.status == 'revoked':
            return Response(
                {'error': 'Certificate is already revoked'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = request.data.get('reason', '')
        certificate.revoke(request.user, reason)
        return Response({
            'status': 'success',
            'message': 'Certificate revoked',
            'certificate': CertificateSerializer(
                certificate, context={'request': request},
            ).data,
        })

    @action(detail=False, methods=['get'], url_path='verify/(?P<verification_code>[A-Z0-9]+)')
    def verify(self, request, verification_code=None):
        try:
            certificate = Certificate.all_objects.select_related(
                'school',
            ).get(verification_code=verification_code.upper())
        except Certificate.DoesNotExist:
            return Response({
                'is_valid': False,
                'error': 'Certificate not found',
                'message': 'No certificate exists with this verification code.',
            }, status=status.HTTP_404_NOT_FOUND)

        data = {
            'is_valid': certificate.is_valid,
            'certificate_number': certificate.certificate_number,
            'student_name': certificate.student_name,
            'student_svc_number': certificate.student_svc_number,
            'student_rank': certificate.student_rank,
            'course_name': certificate.course_name,
            'class_name': certificate.class_name,
            'school_name': certificate.school.name if certificate.school else '',
            'final_grade': certificate.final_grade,
            'final_percentage': certificate.final_percentage,
            'issued_at': certificate.issued_at,
            'completion_date': certificate.completion_date,
            'status': certificate.status,
            'status_display': certificate.get_status_display(),
        }
        if certificate.status == 'revoked':
            data['revocation_reason'] = certificate.revocation_reason
            data['revoked_at'] = certificate.revoked_at
        return Response(data)

    @action(detail=False, methods=['get'])
    def my_certificates(self, request):
        if request.user.active_role != 'student':
            return Response(
                {'error': 'Only students can access this endpoint'},
                status=status.HTTP_403_FORBIDDEN,
            )
        certificates = Certificate.objects.filter(
            student=request.user, status='issued',
        ).order_by('-issued_at')
        serializer = CertificateListSerializer(
            certificates, many=True, context={'request': request},
        )
        return Response({
            'count': certificates.count(),
            'results': serializer.data,
        })


    @action(detail=False, methods=['get'])
    def stats(self, request):
        school = get_current_school() or request.user.school
        qs = Certificate.all_objects.all()
        if school:
            qs = qs.filter(school=school)

        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

        data = {
            'total_certificates': qs.count(),
            'issued_count': qs.filter(status='issued').count(),
            'revoked_count': qs.filter(status='revoked').count(),
            'total_downloads': qs.aggregate(t=Sum('download_count'))['t'] or 0,
            'total_views': qs.aggregate(t=Sum('view_count'))['t'] or 0,
            'certificates_this_month': qs.filter(created_at__gte=month_start).count(),
            'certificates_this_year': qs.filter(created_at__gte=year_start).count(),
        }
        return Response(data)

    @action(detail=False, methods=['get'])
    def download_logs(self, request):
        school = get_current_school() or request.user.school
        qs = CertificateDownloadLog.all_objects.select_related(
            'certificate', 'downloaded_by',
        ).order_by('-downloaded_at')
        if school:
            qs = qs.filter(school=school)

        page_size = min(int(request.query_params.get('page_size', 20)), 100)
        page = max(int(request.query_params.get('page', 1)), 1)
        start = (page - 1) * page_size

        logs = qs[start:start + page_size]
        serializer = CertificateDownloadLogSerializer(logs, many=True)
        return Response({
            'count': qs.count(),
            'page': page,
            'page_size': page_size,
            'results': serializer.data,
        })

class EnrollmentCertificateView(APIView):

    permission_classes = [IsAuthenticated]

    def get(self, request, enrollment_id):
        try:
            enrollment = Enrollment.all_objects.select_related(
                'student', 'class_obj', 'class_obj__course',
            ).get(id=enrollment_id)
        except Enrollment.DoesNotExist:
            return Response(
                {'error': 'Enrollment not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        user = request.user
        if user.active_role == 'student' and enrollment.student != user:
            return Response(
                {'error': 'You can only view your own enrollment'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            certificate = Certificate.all_objects.get(enrollment=enrollment)
            return Response({
                'has_certificate': True,
                'is_eligible': True,
                'certificate': CertificateSerializer(
                    certificate, context={'request': request},
                ).data,
            })
        except Certificate.DoesNotExist:
            pass

        is_eligible = enrollment.completion_date is not None
        return Response({
            'has_certificate': False,
            'is_eligible': is_eligible,
            'enrollment_id': enrollment.id,
            'student_name': enrollment.student.get_full_name(),
            'course_name': enrollment.class_obj.course.name,
            'class_name': enrollment.class_obj.name,
            'completion_date': enrollment.completion_date,
            'message': (
                'Eligible for certificate' if is_eligible
                else 'Enrollment not completed'
            ),
        })

    def post(self, request, enrollment_id):
        user = request.user
        if user.active_role not in ['admin', 'superadmin', 'instructor', 'commandant']:
            return Response(
                {'error': 'You do not have permission to issue certificates'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            enrollment = Enrollment.all_objects.select_related(
                'student', 'class_obj', 'class_obj__course', 'school',
            ).get(id=enrollment_id)
        except Enrollment.DoesNotExist:
            return Response(
                {'error': 'Enrollment not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Resolve optional template from request body
        template = None
        template_id = request.data.get('template_id')
        if template_id:
            try:
                template = CertificateTemplate.all_objects.get(
                    id=template_id, is_active=True,
                )
            except CertificateTemplate.DoesNotExist:
                return Response(
                    {'error': 'Template not found'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        certificate, error = issue_certificate(
            enrollment, user, template=template,
        )

        if error:
            return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'status': 'success',
            'message': 'Certificate issued successfully',
            'certificate': CertificateSerializer(
                certificate, context={'request': request},
            ).data,
        }, status=status.HTTP_201_CREATED)

class CertificatePublicVerificationView(APIView):

    permission_classes = [AllowAny]

    def get(self, request, verification_code):
        try:
            certificate = Certificate.all_objects.select_related('school').get(
                verification_code=verification_code.upper(),
            )
        except Certificate.DoesNotExist:
            return Response({
                'is_valid': False,
                'error': 'Certificate not found',
            }, status=status.HTTP_404_NOT_FOUND)

        return Response({
            'is_valid': certificate.is_valid,
            'certificate_number': certificate.certificate_number,
            'student_name': certificate.student_name,
            'course_name': certificate.course_name,
            'class_name': certificate.class_name,
            'school_name': certificate.school.name if certificate.school else '',
            'completion_date': certificate.completion_date,
            'status': certificate.status,
            'status_display': certificate.get_status_display(),
        })

# student indexes

class MarksEntryViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsAdminOrInstructor]

    def _get_serializer_class(self, request):
        if request.user.role in ["admin", "superadmin"]:
            return AdminMarksSerializer
        return InstructorMarksSerializer

    @action(detail=False, methods=["get"], url_path="exam/(?P<exam_id>[^/.]+)")
    def exam_results(self, request, exam_id=None):

        exam = get_object_or_404(Exam, pk=exam_id, is_active=True)

        if request.user.role == "instructor":
            if exam.subject.instructor != request.user:
                return Response(
                    {"error": "You are not the instructor for this subject."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        results = ExamResult.objects.filter(
            exam=exam,
            school=request.user.school,
        ).select_related(
            "exam", "exam__subject", "exam__subject__class_obj",
            "student", "graded_by",
        ).order_by("id")

        serializer_class = self._get_serializer_class(request)
        serializer = serializer_class(results, many=True, context={"request": request})

        return Response({
            "exam_id": exam.id,
            "exam_title": exam.title,
            "total_marks": exam.total_marks,
            "count": results.count(),
            "results": serializer.data,
        })

    def partial_update(self, request, pk=None):

        result = get_object_or_404(
            ExamResult,
            pk=pk,
            school=request.user.school,
        )

        if request.user.role == "instructor":
            if result.exam.subject.instructor != request.user:
                return Response(
                    {"error": "You can only grade results for your own subjects."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        serializer_class = self._get_serializer_class(request)
        serializer = serializer_class(
            result,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)

        instance = serializer.save(
            graded_by=request.user,
            graded_at=timezone.now(),
        )

        return Response(
            serializer_class(instance, context={"request": request}).data
        )

    @action(detail=False, methods=["post"], url_path="bulk-submit")
    def bulk_submit(self, request):
        exam_id = request.data.get("exam_id")
        results_data = request.data.get("results", [])

        if not exam_id:
            return Response(
                {"error": "exam_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        exam = get_object_or_404(Exam, pk=exam_id, school=request.user.school)

        if request.user.role == "instructor":
            if exam.subject.instructor != request.user:
                return Response(
                    {"error": "You are not the instructor for this exam."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        serializer_class = self._get_serializer_class(request)
        updated = []
        errors = []

        with transaction.atomic():
            for item in results_data:
                result_id = item.get("id")
                try:
                    result = ExamResult.objects.select_for_update().get(
                        pk=result_id,
                        exam=exam,
                        school=request.user.school,
                    )
                except ExamResult.DoesNotExist:
                    errors.append({"id": result_id, "error": "Result not found."})
                    continue

                serializer = serializer_class(
                    result,
                    data=item,
                    partial=True,
                    context={"request": request},
                )
                if serializer.is_valid():
                    instance = serializer.save(
                        is_submitted=True,
                        submitted_at=timezone.now(),
                        graded_by=request.user,
                        graded_at=timezone.now(),
                    )
                    updated.append(
                        serializer_class(instance, context={"request": request}).data
                    )
                else:
                    errors.append({"id": result_id, "errors": serializer.errors})

        return Response({
            "updated_count": len(updated),
            "error_count": len(errors),
            "results": updated,
            "errors": errors,
        }, status=status.HTTP_200_OK if not errors else status.HTTP_207_MULTI_STATUS)


class AdminRosterViewSet(viewsets.ViewSet):

    permission_classes = [IsAuthenticated, IsAdminOnly]

    def retrieve(self, request, pk=None):
        class_obj = get_object_or_404(Class, pk=pk, school=request.user.school)

        indexes = StudentIndex.objects.filter(
            class_obj=class_obj,
            enrollment__is_active=True,
        ).select_related(
            "enrollment", "enrollment__student", "class_obj",
        ).order_by("index_number")

        serializer = AdminStudentIndexRosterSerializer(indexes, many=True)

        return Response({
            "class_id": class_obj.id,
            "class_name": class_obj.name,
            "index_prefix": class_obj.index_prefix or "",
            "index_start_from": class_obj.index_start_from,      
            "next_index_preview": class_obj.next_index_preview,
            "total_students": indexes.count(),
            "roster": serializer.data,
        })

    @action(detail=True, methods=["post"], url_path="assign")
    def assign_indexes(self, request, pk=None):

        class_obj = get_object_or_404(Class, pk=pk, school=request.user.school)
        created = bulk_assign_indexes(class_obj)
        return Response({
            "message": f"Assigned {len(created)} new indexes in {class_obj.name}.",
            "newly_indexed": [
                {"index_number": idx.index_number, "enrollment_id": str(idx.enrollment_id)}
                for idx in created
            ],
        }, status=status.HTTP_201_CREATED)


    @action(detail=True, methods=["patch"], url_path="update-index/(?P<index_id>[^/.]+)")
    def update_index(self, request, pk=None, index_id=None):
        class_obj = get_object_or_404(Class, pk=pk, school=request.user.school)
        student_index = get_object_or_404(
            StudentIndex, pk=index_id, class_obj=class_obj
        )

        new_number = request.data.get("index_number")
        if not new_number:
            return Response(
                {"error": "index_number is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        new_number = str(new_number).strip().zfill(3)
        if not new_number.isdigit():
            return Response(
                {"error": "Index number must contain only digits."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    
        if (
            StudentIndex.all_objects.filter(class_obj=class_obj, index_number=new_number)
            .exclude(pk=student_index.pk)
            .exists()
        ):
            return Response(
                {"error": f"Index {class_obj.format_index(int(new_number))} is already assigned to another student in this class."},
                status=status.HTTP_409_CONFLICT,
            )

        student_index.index_number = new_number
        student_index.save(update_fields=["index_number"])

        return Response({
            "message": f"Index updated to {class_obj.format_index(int(new_number))}.",
            "id": str(student_index.pk),
            "index_number": student_index.index_number,
            "formatted_index": class_obj.format_index(int(new_number)),
        })
# Departments

class DepartmentViewSet(viewsets.ModelViewSet):

    serializer_class = DepartmentSerializer
    permission_classes = [IsAuthenticated, BelongsToSameSchool]

    def get_queryset(self):
        user = self.request.user
        qs = Department.objects.select_related('school').prefetch_related(
            'department_memberships__user'
        )
        if user.role in ('instructor',):
            qs = qs.filter(
                department_memberships__user=user,
                department_memberships__is_active=True,
            ).distinct()
        return qs

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated(), BelongsToSameSchool()]

    def perform_create(self, serializer):
        serializer.save(school=self.request.user.school)

    @action(detail=True, methods=['get'], url_path='courses',
            permission_classes=[IsAuthenticated, IsHODOrAdmin])
    def courses(self, request, pk=None):
        dept = self.get_object()
        self._assert_hod_of_dept(request.user, dept)
        from .serializers import CourseSerializer
        courses = dept.courses.filter(is_active=True)
        return Response(CourseSerializer(courses, many=True).data)

    @action(detail=True, methods=['get'], url_path='classes',
            permission_classes=[IsAuthenticated, IsHODOrAdmin])
    def classes(self, request, pk=None):
        dept = self.get_object()
        self._assert_hod_of_dept(request.user, dept)
        from .serializers import ClassSerializer
        classes = dept.classes.filter(is_active=True).select_related('course', 'instructor')
        return Response(ClassSerializer(classes, many=True).data)

    @action(detail=True, methods=['get'], url_path='students',
            permission_classes=[IsAuthenticated, IsHODOrAdmin])
    def students(self, request, pk=None):
        dept = self.get_object()
        self._assert_hod_of_dept(request.user, dept)
        from .models import Enrollment
        from .serializers import EnrollmentSerializer
        enrollments = Enrollment.objects.filter(
            class_obj__department=dept,
            is_active=True
        ).select_related('student', 'class_obj')
        return Response(EnrollmentSerializer(enrollments, many=True).data)

    @action(detail=True, methods=['get'], url_path='results',
            permission_classes=[IsAuthenticated, IsHODOrAdmin])
    def results(self, request, pk=None):
        dept = self.get_object()
        self._assert_hod_of_dept(request.user, dept)
        results = ExamResult.objects.filter(
            exam__subject__class_obj__department=dept,
            is_submitted=True
        ).select_related('student', 'exam', 'exam__subject')
        from .serializers import ExamResultSerializer
        return Response(ExamResultSerializer(results, many=True).data)

    @action(detail=True, methods=['get'], url_path='pending-edit-requests',
            permission_classes=[IsAuthenticated, IsHODOrAdmin])
    def pending_edit_requests(self, request, pk=None):
        dept = self.get_object()
        self._assert_hod_of_dept(request.user, dept)
        requests = ResultEditRequest.objects.filter(
            exam_result__exam__subject__class_obj__department=dept,
            status=ResultEditRequest.Status.PENDING,
        ).select_related('exam_result__exam', 'requested_by')
        return Response(ResultEditRequestSerializer(requests, many=True).data)

    def _assert_hod_of_dept(self, user, dept):
        if user.role in ('admin', 'superadmin'):
            return
        is_hod = DepartmentMembership.objects.filter(
            department=dept,
            user=user,
            role=DepartmentMembership.Role.HOD,
            is_active=True,
        ).exists()
        if not is_hod:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You are not the HOD of this department.")

class DepartmentMembershipViewSet(viewsets.ModelViewSet):

    serializer_class = DepartmentMembershipSerializer
    permission_classes = [IsAuthenticated, IsAdmin]

    def get_queryset(self):
        return DepartmentMembership.objects.select_related(
            'department', 'user', 'assigned_by'
        ).filter(is_active=True)

    def perform_create(self, serializer):
        serializer.save(assigned_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)

class ResultEditRequestViewSet(viewsets.ModelViewSet):
    serializer_class = ResultEditRequestSerializer
    permission_classes = [IsAuthenticated, BelongsToSameSchool]

    def get_queryset(self):
        user = self.request.user
        base = ResultEditRequest.objects.select_related(
            'exam_result__exam__subject',
            'exam_result__exam__subject__class_obj__department',
            'exam_result__student',
            'requested_by', 'reviewed_by',
        )
        if user.role in ('admin', 'superadmin'):
            return base
        hod_depts = DepartmentMembership.objects.filter(
            user=user, role=DepartmentMembership.Role.HOD, is_active=True
        ).values_list('department_id', flat=True)
        if hod_depts.exists():
            return base.filter(
                exam_result__exam__subject__class_obj__department__in=hod_depts
            )
        return base.filter(requested_by=user)

    def get_permissions(self):
        if self.action == 'review':
            return [IsAuthenticated(), IsHODOrAdmin()]
        if self.action in ('update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated(), BelongsToSameSchool()]

    def perform_create(self, serializer):
        user = self.request.user
        if user.role not in ('instructor', 'admin', 'superadmin'):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only instructors can request result edits.")
        serializer.save(
            requested_by=user,
            school=user.school,
        )

    @action(detail=True, methods=['post'], url_path='review',
            permission_classes=[IsAuthenticated, IsHODOrAdmin])
    def review(self, request, pk=None):

        edit_request = self.get_object()

        if edit_request.status != ResultEditRequest.Status.PENDING:
            return Response(
                {'detail': f'Request is already {edit_request.status}.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = ResultEditRequestReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action_choice = serializer.validated_data['action']
        note = serializer.validated_data.get('note', '')

        dept = edit_request.exam_result.exam.subject.class_obj.department
        if request.user.role not in ('admin', 'superadmin') and dept:
            is_hod = DepartmentMembership.objects.filter(
                department=dept,
                user=request.user,
                role=DepartmentMembership.Role.HOD,
                is_active=True,
            ).exists()
            if not is_hod:
                return Response(
                    {'detail': 'You are not the HOD of this department.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        with transaction.atomic():
            if action_choice == 'approve':
                edit_request.approve(hod_user=request.user, note=note)
                msg = 'Request approved. The result is now unlocked for editing.'
            else:
                edit_request.reject(hod_user=request.user, note=note)
                msg = 'Request rejected.'

        return Response(
            {
                'detail': msg,
                'request': ResultEditRequestSerializer(edit_request).data,
            },
            status=status.HTTP_200_OK
        )

class ExamResultViewSetPatch:

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.is_locked:
            return Response(
                {
                    'detail': (
                        'This result is locked. Submit a ResultEditRequest '
                        'and wait for HOD approval before editing.'
                    )
                },
                status=status.HTTP_403_FORBIDDEN
            )
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    @action(detail=False, methods=['post'], url_path='submit')
    def submit(self, request):

        from .models import Exam, ExamResult, User as UserModel
        from .serializers import ExamResultSerializer

        exam_id = request.data.get('exam')
        results_data = request.data.get('results', [])

        if not exam_id:
            return Response({'detail': 'exam field is required.'}, status=400)

        exam = get_object_or_404(Exam, pk=exam_id, school=request.user.school)

        is_class_instructor = exam.subject.class_obj.instructor == request.user
        is_subject_instructor = exam.subject.instructor == request.user
        if request.user.role == 'instructor' and not (is_class_instructor or is_subject_instructor):
            return Response({'detail': 'You are not the instructor for this exam.'}, status=403)

        created, updated, errors = [], [], []

        with transaction.atomic():
            for item in results_data:
                student_id = item.get('student')
                marks = item.get('marks_obtained')

                try:
                    student = UserModel.objects.get(pk=student_id, school=request.user.school)
                except UserModel.DoesNotExist:
                    errors.append({'student': student_id, 'error': 'Student not found.'})
                    continue

                result, is_new = ExamResult.all_objects.get_or_create(
                    exam=exam,
                    student=student,
                    defaults={'school': exam.school},
                )

                if result.is_locked:
                    errors.append({
                        'student': student_id,
                        'error': 'Result is locked. Request HOD approval to edit.',
                    })
                    continue

                result.marks_obtained = marks
                result.remarks = item.get('remarks', result.remarks)
                result.is_submitted = True
                result.submitted_at = timezone.now()
                result.graded_by = request.user
                result.graded_at = timezone.now()
                result.is_locked = True  
                result.save()

                if is_new:
                    created.append(str(result.pk))
                else:
                    updated.append(str(result.pk))

        return Response({
            'created': created,
            'updated': updated,
            'errors': errors,
        }, status=status.HTTP_200_OK)