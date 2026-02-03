from django.utils.deprecation import MiddlewareMixin
from django.http import JsonResponse
from .models import School
from .managers import set_current_school, get_current_school


class TenantMiddleware(MiddlewareMixin):

    
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

        school = None
        school_code = request.headers.get('X-School-Code')

        if school_code:
            try:
                school = School.objects.get(code=school_code, is_active=True)
            except School.DoesNotExist:
                return JsonResponse({
                    'error': 'Invalid school code',
                    'detail': f'School with code "{school_code}" not found or inactive'
                }, status=400)

        elif hasattr(request, 'user') and request.user.is_authenticated:
            if request.user.role == 'superadmin':

                pass
            else:
                school = request.user.school

        set_current_school(school)
        request.school = school

        return None

    def process_response(self, request, response):
        set_current_school(None)
        return response


class SchoolAccessMiddleware(MiddlewareMixin):

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

        if not hasattr(request, 'user') or not request.user.is_authenticated:
            return None

        school = get_current_school()

        if request.user.role == 'superadmin':
            return None

        if school and request.user.school != school:
            return JsonResponse({
                'error': 'Access Denied',
                'detail': 'You do not have access to this school'
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

        if not hasattr(request, 'user') or not request.user.is_authenticated:
            return None

        if request.user.role != 'student':
            return None

        from .models import Enrollment
        has_active_enrollment = Enrollment.all_objects.filter(
            student=request.user,
            is_active=True,
            class_obj__is_active=True
        ).exists()

        if not has_active_enrollment:
            return JsonResponse({
                'error': 'Enrollment Required',
                'detail': 'Your enrollment is not active. Please contact your school administrator.'
            }, status=403)

        return None
