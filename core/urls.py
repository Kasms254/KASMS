from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, CourseViewSet, ClassViewSet, EnrollmentViewSet, SubjectViewSet, NoticeViewSet
from .auth_views import login_view, logout_view, current_user_view, change_password_view
router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'courses', CourseViewSet, basename='course')
router.register(r'classes', ClassViewSet, basename='class')
router.register(r'enrollments', EnrollmentViewSet, basename='enrollment')
router.register(r'subjects', SubjectViewSet, basename='subject')
router.register(r'notices', NoticeViewSet, basename='notice')

app_name = 'core'

urlpatterns = [
    path('', include(router.urls)),
    path('auth/login/', login_view, name='login'),
    path('auth/logout/', logout_view, name='logout'),
    path('auth/me/', current_user_view, name='current_user'),
    path('auth/change-password/', change_password_view, name='change_password'),
    
]

