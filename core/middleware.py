from threading import local
from django.utils.deprecation import MiddlewareMixin
from django.http import JsonResponse
from .models import School

_thread_locals = local()

def get_current_school():

    return getattr(_thread_locals, 'school', None)

def set_current_school(school):

    _thread_locals.school = school


class TenantMiddleware(MiddlewareMixin):

    def process_request(self, request):
        
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

        elif request.user.is_authenticated:
            if request.user.role =='superadmin':

                if not school_code:
                    return JsonResponse({
                        'error':'School code required',
                        'detail': 'Superadmins must specify X-school-code header'
                    }, status=400)

            else:
                school = request.user.school


        set_current_school(school)

        request.school = school

        return None

    def process_response(self, request, response):

        set_current_school(None)
        return response

class SchoolAccessMiddleware(MiddlewareMixin):

    EXEMPT_PATHS=[
        '/api/auth/login',
        '/api/auth/register',
        '/admin',
        '/static',
        '/media',
    ]

    def process_request(self, request):

        for path in self.EXEMPT_PATHS:

            if request.path.startswith(path):
                return None

            
        if not request.user.is_authenticated:
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

        