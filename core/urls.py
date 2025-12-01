from django.urls import path, include
from django.http import HttpResponse
from rest_framework.routers import DefaultRouter
from .views import (
    # for the admin
    UserViewSet, CourseViewSet, ClassViewSet, EnrollmentViewSet, SubjectViewSet, NoticeViewSet,LoginView,LogoutView,CurrentUserView,
    # for the instructor
    ExamViewSet, AttendanceViewSet,ClassViewSet,ClassNoticeViewSet
, ExamReportViewSet, ExamResultViewSet, InstructorDashboardViewset
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
router.register(r'attendance', AttendanceViewSet, basename='attendance')
router.register(r'class-notices', ClassNoticeViewSet, basename='class_notice')
router.register(r'exam-reports', ExamReportViewSet, basename='exam_report')
router.register(r'exam-results', ExamResultViewSet, basename='exam_result')
router.register(r'instructor-dashboard', InstructorDashboardViewset, basename='instructor_dashboard')

app_name = 'core'

def home(request):
    return HttpResponse("Welcome to the KASMS API")

urlpatterns = [

    path('login/', LoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('api/me/', CurrentUserView.as_view(), name='current_user'),
    path('change-password/', change_password_view, name='change_password'),
    path('token/refresh/', token_refresh_view, name='token-refresh'),
    path('token/verify/', verify_token_view, name='token-verify'),

    path('', include(router.urls)),
    path("", home),
]

