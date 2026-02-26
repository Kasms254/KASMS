from django.utils.deprecation import MiddlewareMixin
from django.http import JsonResponse
from .models import School, User, Enrollment,SchoolMembership
from .managers import set_current_school, get_current_school,clear_current_school
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
import logging
from django.core.cache import cache


logger = logging.getLogger(__name__)

def get_user_from_jwt(request):

    auth_header = request.headers.get('Authorization', '')
    
    if not auth_header.startswith('Bearer '):
        logger.debug("No Bearer token in Authorization header")
        return None
    
    token = auth_header[7:]  
    
    if not token:
        logger.debug("Empty token after Bearer prefix")
        return None
    
    try:
        access_token = AccessToken(token)
        user_id = access_token.get('user_id')
        
        if user_id:
            user = User.all_objects.filter(id=user_id, is_active=True).first()
            if user:
                logger.debug(f"JWT validated - User: {user.username}, School: {user.school}")
            else:
                logger.warning(f"No active user found for user_id: {user_id}")
            return user
        else:
            logger.warning("No user_id in token payload")
            return None
            
    except TokenError as e:
        logger.debug(f"Token validation error: {e}")
        return None
        
    except Exception as e:
        logger.error(f"Unexpected error in JWT validation: {e}", exc_info=True)
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
                return None
        
        user = get_user_from_jwt(request)
        request._jwt_user = user  
        
        school = None
        school_code = request.headers.get('X-School-Code')
                
        if school_code:
            
            cache_key = f'school_by_code:{school_code}'
            school = cache.get(cache_key)
            if school is None:  
                try:
                    school = School.objects.get(code=school_code, is_active=True)
                except School.DoesNotExist:
                    return JsonResponse({
                        'error': 'Invalid school code',
                        'detail': f'School with code "{school_code}" not found or inactive'
                    }, status=400)
        
        elif user:
            if user.role == 'superadmin':
                school = None
            else:
                membership = user.active_membership
                school = membership.school if membership else None
        
        set_current_school(school)
        request.school = school

        membership = None
        if user and school:
            cache_key = f'membership:{user.id}:{school.id}'
            membership = cache.get(cache_key)
            if membership is None:
                membership = (
                    user.school_memberships.filter(school=school, status='active').first()
                )
                if membership:
                    cache.set(cache_key, membership, timeout=600)  
        request.membership = membership

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
        if not user or user.role == 'superadmin':
            return None

        current_school = get_current_school()
        if not current_school:
            return JsonResponse(
                {'error': 'No school context'}, status=403
            )

        has_membership = getattr(request, 'membership', None) is not None

        if not has_membership:
            return JsonResponse({
                'error': 'Access Denied',
                'detail': 'No active membership at this school'
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






