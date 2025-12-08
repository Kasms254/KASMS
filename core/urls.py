from django.urls import path, include
from django.http import HttpResponse
from rest_framework.routers import DefaultRouter
from .views import (UserViewSet, CourseViewSet, ClassViewSet, EnrollmentViewSet, SubjectViewSet, NoticeViewSet,
    # for the instructor
    ExamViewSet,ClassViewSet,ClassNoticeViewSet
, ExamReportViewSet, ExamResultViewSet, InstructorDashboardViewset, ExamAttachmentViewSet, StudentDashboardViewset,AttendanceSessionViewSet,EnhancedAttendanceViewSet,BiometricDeviceViewSet,BiometricUserMappingViewSet
    )
from .auth_views import (
    login_view, logout_view, current_user_view, change_password_view, token_refresh_view, verify_token_view)


router = DefaultRouter()

# admin routes
router.register(r'users', UserViewSet, basename='user')
router.register(r'courses', CourseViewSet, basename='course')
router.register(r'classes', ClassViewSet, basename='class')
router.register(r'enrollments', EnrollmentViewSet, basename='enrollment')
router.register(r'subjects', SubjectViewSet, basename='subject')
router.register(r'notices', NoticeViewSet, basename='notice')


# instructor routes
router.register(r'exams', ExamViewSet, basename='exam')
router.register(r'class-notices', ClassNoticeViewSet, basename='class_notice')
router.register(r'exam-reports', ExamReportViewSet, basename='exam_report')
router.register(r'exam-results', ExamResultViewSet, basename='exam_result')
router.register(r'instructor-dashboard', InstructorDashboardViewset, basename='instructor_dashboard')
router.register(r'exam-attachments', ExamAttachmentViewSet, basename='exam_attachment')

# stduent routes
router.register(r'student-dashboard', StudentDashboardViewset, basename='student-dashboard')

# attendance
router.register(r'attendance-sessions', AttendanceSessionViewSet, basename='attendance-session')
router.register(r'attendances', EnhancedAttendanceViewSet, basename='attendance')
router.register(r'biometric-devices', BiometricDeviceViewSet, basename='biometric-device')
router.register(r'biometric-mappings', BiometricUserMappingViewSet, basename='biometric-mapping')
app_name = 'core'

def home(request):
    return HttpResponse("Welcome to the KASMS API")

urlpatterns = [
    path('', include(router.urls)),
    path("", home),
    path('auth/login/', login_view, name='login'),
    path('auth/logout/', logout_view, name='logout'),
    path('auth/me/', current_user_view, name='current_user'),
    path('auth/change-password/', change_password_view, name='change_password'),
    path('auth/token/refresh/', token_refresh_view, name='token-refresh'),
    path('auth/token/verify/', verify_token_view, name='token-verify'),

    
]

