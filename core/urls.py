from django.urls import path, include
from django.http import HttpResponse
from rest_framework.routers import DefaultRouter
from .views import (
    # for the admin
    UserViewSet, CourseViewSet, ClassViewSet, EnrollmentViewSet, SubjectViewSet, NoticeViewSet, SchoolMembershipViewSet, MarksEntryViewSet,AdminRosterViewSet,
    # for the instructor
    ExamViewSet,ClassViewSet,ClassNoticeViewSet,ProfileViewSet,CertificateViewSet,CertificateTemplateViewSet, EnrollmentCertificateView, CertificatePublicVerificationView,
    ExamReportViewSet, ExamResultViewSet, InstructorDashboardViewset, ExamAttachmentViewSet, StudentDashboardViewset, PersonalNotificationViewSet,SchoolViewSet, SchoolAdminViewSet,
    # departments
    DepartmentViewSet, DepartmentMembershipViewSet, ResultEditRequestViewSet,
AttendanceSessionViewSet, SessionAttendanceViewset, BiometricRecordViewset, AttendanceReportViewSet
    )
from .auth_views import (
   csrf_token_view,login_view, logout_view, current_user_view, change_password_view, token_refresh_view, verify_token_view)
from .performance_viewsets import(
    SubjectPerformanceViewSet, ClassPerformanceViewSet)
from .auth_urls import auth_urlpatterns

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
# router.register(r'attendance', AttendanceViewSet, basename='attendance')
router.register(r'class-notices', ClassNoticeViewSet, basename='class_notice')
router.register(r'exam-reports', ExamReportViewSet, basename='exam_report')
router.register(r'exam-results', ExamResultViewSet, basename='exam_result')
router.register(r'instructor-dashboard', InstructorDashboardViewset, basename='instructor_dashboard')
router.register(r'exam-attachments', ExamAttachmentViewSet, basename='exam_attachment')

# stduent routes
router.register(r'student-dashboard', StudentDashboardViewset, basename='student-dashboard')
app_name = 'core'

# performance summary
router.register(r'subject-performance', SubjectPerformanceViewSet, basename='subject-performance')
router.register(r'class-performance', ClassPerformanceViewSet, basename='class-performance')

# attendance
router.register(r'attendance-sessions', AttendanceSessionViewSet, basename='attendance-session')
router.register(r'session-attendances', SessionAttendanceViewset, basename='session-attendance')
router.register(r'biometric-records', BiometricRecordViewset, basename='biometric-record')
router.register(r'attendance-reports', AttendanceReportViewSet, basename='attendance-report')

#PersonalNotification
router.register(r'personal-notifications', PersonalNotificationViewSet, basename='personal-notification') 

# schools
router.register(r'schools', SchoolViewSet, basename='school')
router.register(r'school-admins',SchoolAdminViewSet, basename='school-admin')

# membership
router.register(r'memberships', SchoolMembershipViewSet, basename='membership' )

# certificate templates
router.register(r'certificate_templates', CertificateTemplateViewSet, basename='certificate_template')

# certificates 
router.register(r'certificates', CertificateViewSet, basename='certificate')

# indexes
router.register(r"marks-entry", MarksEntryViewSet, basename="marks-entry")
router.register(r"admin/roster", AdminRosterViewSet, basename="admin-roster")


# departments
router.register(r'departments', DepartmentViewSet, basename='department')
router.register(r'department-memberships', DepartmentMembershipViewSet, basename='department-membership')
router.register(r'result-edit-requests', ResultEditRequestViewSet, basename='result-edit-request')

def home(request):
    return HttpResponse("Welcome to the KASMS API")

urlpatterns = [
    path('', include(router.urls)),
    path("", home),
    # path('auth/login/', login_view, name='login'),
    # path('auth/logout/', logout_view, name='logout'),
    # path('auth/me/', current_user_view, name='current_user'),
    # path('auth/change-password/', change_password_view, name='change_password'),
    # path('auth/token/refresh/', token_refresh_view, name='token-refresh'),
    # path('auth/token/verify/', verify_token_view, name='token-verify'),

    path('profile/me/', ProfileViewSet.as_view({'get': 'retrieve', 'patch': 'partial_update','put': 'update',}), name='profile-me'
    ,),
    path('auth/', include((auth_urlpatterns, 'auth'))),


]

