from django.utils.deprecation import MiddlewareMixin
from django.http import JsonResponse
from .models import School, User, Enrollment
from .managers import set_current_school, get_current_school,clear_current_school
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
import logging

logger = logging.getLogger(__name__)

def get_user_from_jwt(request):

    raw_token = None
    raw_token = request.COOKIES.get(ACCESS_COOKIE_NAME)

    if not raw_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            raw_token = auth_header[7:]

    if not raw_token:
        return None

    try:
        access_token = AccessToken(raw_token)
        user_id = access_token.get("user_id")

        if user_id:
            user = User.all_objects.filter(id=user_id, is_active=True). first()
            if user:
                logger.debug(f"JWT validated -User: {user.username}, School: {user.school}")
            else:
                logger.warning(f"No active user found for user_id: {user_id}")
                return user
        else:
            logger.warning("No user_id in token payload")
            return None

    except TokenError as e:
        logger.debug(f"Token validation error: {e}")
        return None

class TenantMiddleware(MiddlewareMixin):

    EXEMPT_PATHS = [
        '/api/auth/',
        '/admin/',
        '/static/',
        '/media/',
        '/api/schools/'
    ]

    def process_request(self, request):

        clear_current_school()
        
        for path in self.EXEMPT_PATHS:
            if request.path.startswith(path):
                logger.debug(f"Path {request.path} is exempt from tenant middleware")
                return None
        
        user = get_user_from_jwt(request)
        request._jwt_user = user  
        
        school = None
        school_code = request.headers.get('X-School-Code')
        
        logger.debug(f"Processing request: path={request.path}, X-School-Code={school_code}, user={user}")
        
        if school_code:
            try:
                school = School.objects.get(code=school_code, is_active=True)
                logger.debug(f"School from X-School-Code header: {school.name} ({school.code})")
            except School.DoesNotExist:
                logger.warning(f"Invalid school code in header: {school_code}")
                return JsonResponse({
                    'error': 'Invalid school code',
                    'detail': f'School with code "{school_code}" not found or inactive'
                }, status=400)
        
        elif user:
            if user.role == 'superadmin':
                school = None
                logger.debug("Superadmin request without explicit school - global access")
            else:
                school = user.school
                if school:
                    logger.debug(f"Using user's assigned school: {school.name} ({school.code})")
                else:
                    logger.warning(f"User {user.username} has no school assigned")
        
        set_current_school(school)
        request.school = school
        
        logger.debug(f"School context set: {school.code if school else 'None (global)'}")
        
        return None

    def process_response(self, request, response):

        clear_current_school()
        return response
    
    def process_exception(self, request, exception):

        clear_current_school()
        return None

class SchoolAccessMiddleware(MiddlewareMixin):

    EXEMPT_PATHS = [
        '/api/auth/',
        '/admin/',
        '/static/',
        '/media/',
        '/api/schools/',
    ]

    def process_request(self, request):

        for path in self.EXEMPT_PATHS:
            if request.path.startswith(path):
                return None
        
        user = getattr(request, '_jwt_user', None)
        
        if not user:
            return None
        
        if user.role == 'superadmin':
            return None
        
        current_school = get_current_school()
        
        if current_school and user.school:
            if user.school.id != current_school.id:
                logger.warning(
                    f"Access denied: User {user.username} (school: {user.school.code}) "
                    f"attempted to access school: {current_school.code}"
                )
                return JsonResponse({
                    'error': 'Access Denied',
                    'detail': 'You do not have access to this school'
                }, status=403)
        
        if not user.school:
            logger.warning(f"Access denied: User {user.username} has no school assigned")
            return JsonResponse({
                'error': 'Access Denied',
                'detail': 'User is not associated with any school'
            }, status=403)
        
        return None
        
class StudentEnrollmentMiddleware(MiddlewareMixin):

    EXEMPT_PATHS = [
        '/api/auth/',
        '/admin/',
        '/static/',
        '/media/',
    ]

    def process_request(self, request):

        for path in self.EXEMPT_PATHS:
            if request.path.startswith(path):
                return None
        
        user = getattr(request, '_jwt_user', None)
        
        if not user:
            return None
        
        if getattr(user, 'role', None) != 'student':
            return None
        
        has_active_enrollment = Enrollment.all_objects.filter(
            student=user,
            is_active=True,
            class_obj__is_active=True
        ).exists()
        
        if not has_active_enrollment:
            logger.warning(f"Student {user.username} denied access - no active enrollment")
            return JsonResponse({
                'error': 'Enrollment Required',
                'detail': 'Your enrollment is not active. Please contact your school administrator.'
            }, status=403)
        
        return None






