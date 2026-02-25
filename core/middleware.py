from django.utils.deprecation import MiddlewareMixin
from django.http import JsonResponse
from .models import School, User, Enrollment,SchoolMembership
from .managers import set_current_school, get_current_school,clear_current_school
from .cookie_utils import ACCESS_COOKIE_NAME
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
import logging
from django.conf import settings
logger = logging.getLogger(__name__)

def get_user_from_jwt(request):

    raw_token = None

    cookie_name = getattr(settings, 'JWT_ACCESS_COOKIE_NAME', 'access_token')
    raw_token = request.COOKIES.get(cookie_name)

    if not raw_token:
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            raw_token = auth_header[7:]

    if not raw_token:
        return None

    try:
        access_token = AccessToken(raw_token)
        user_id = access_token.get('user_id')

        if user_id:
            user = User.all_objects.filter(id=user_id, is_active=True).first()
            if user:
                logger.debug(
                    "JWT validated - User: %s, School: %s",
                    user.username, user.school,
                )
            else:
                logger.warning("No active user found for user_id: %s", user_id)
            return user
        else:
            logger.warning("No user_id in token payload")
            return None

    except TokenError as e:
        logger.debug("Token validation error: %s", e)
        return None

    except Exception as e:
        logger.error(
            "Unexpected error in JWT validation: %s", e, exc_info=True,
        )
        return None

class CookieJWTAuthenticationMiddleware(MiddlewareMixin):

    def process_request(self, request):
        if hasattr(request, 'user') and request.user.is_authenticated:
            return None

        user = get_user_from_jwt(request)
        if user:
            request.user = user
            request._jwt_user = user
        else:
            request._jwt_user = None

        return None

class TenantMiddleware(MiddlewareMixin):

    EXEMPT_PATHS = [
        '/api/auth/',
        '/admin/',
        '/static/',
        '/media/',
        '/api/schools/',
    ]

    def process_request(self, request):

        clear_current_school()

        for path in self.EXEMPT_PATHS:
            if request.path.startswith(path):
                return None

        user = getattr(request, '_jwt_user', None) or get_user_from_jwt(request)
        request._jwt_user = user

        school = None
        school_code = request.headers.get('X-School-Code')

        if school_code:
            try:
                school = School.objects.get(code=school_code, is_active=True)
            except School.DoesNotExist:
                return JsonResponse({
                    'error': 'Invalid school code',
                    'detail': f'School with code "{school_code}" not found or inactive',
                }, status=400)

        elif user:
            if user.role == 'superadmin':
                school = None
            else:
                membership = user.active_membership
                school = membership.school if membership else None

        set_current_school(school)
        request.school = school

        if user and school:
            request.membership = (
                user.school_memberships.filter(
                    school=school, status='active',
                ).first()
            )
        else:
            request.membership = None

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
                {'error': 'No school context'}, status=403,
            )

        has_membership = SchoolMembership.all_objects.filter(
            user=user,
            school=current_school,
            status='active',
        ).exists()

        if not has_membership:
            return JsonResponse({
                'error': 'Access Denied',
                'detail': 'No active membership at this school',
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
            class_obj__is_active=True,
        ).exists()

        if not has_active_enrollment:
            logger.warning(
                "Student %s denied access - no active enrollment",
                user.username,
            )
            return JsonResponse({
                'error': 'Enrollment Required',
                'detail': (
                    'Your enrollment is not active. '
                    'Please contact your school administrator.'
                ),
            }, status=403)

        return None






