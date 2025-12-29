from django.utils.deprecation import MiddlewareMixin
from django.shortcuts import redirect
from django.http import JsonResponse
from core.models import School
import threading

_thread_locals = threading.local()

def get_current_school():
    
    return getattr(_thread_locals, 'school', None)

def set_current_school(school):
    _thread_locals.school = school

class SchoolMiddleware(MiddlewareMixin):
    
    def process_request(self, request):
        if request.path.startswith('/admin/') or \
            request.path.startswith('/static/') or \
            request.path.startswith('/media/'):
                return None

        school = None

        subdomain_header = request.headers.get('X-School-Subdomain')
        if subdomain_header:
            try:
                school = School.objects.get(
                    subdomain==subdomain_header,
                    is_active=True
                )
            except School.DoesNotExist:
                return JsonResponse({
                    'error': 'Invalid school subdomain',
                    'subdomain':subdomain_header
                }, status=400)

        if not school:
            host  = request.get_host().split(':') [0]
            parts = host.split('.')

            if len(parts) > 2 and parts [0] not in ['www', 'localhost', '127']:
                subdomain = parts[0]
                try:
                    school = School.objects.get(
                        subdomain=subdomain,
                        is_active=True
                    )
                except School.DoesNotExist:
                    if not request.path.startswith('/api'):
                        return JsonResponse({
                            'error':'School Not Found',
                            'subdomain':subdomain
                        }, status=404)


        if not school and hasattr(request, 'user') and request.user.is_authenticated:
            if hasattr(request.user, 'school') and request.user.school:
                school = request.user.school

        if school:
            set_current_school(school)
            request.school = school

        else:

            set_current_school(None)
            request.school = None

        return None


class SchoolAccessMiddleware(MiddlewareMixin):

    def process_request(self, request):

        if not hasattr(request, 'user') or \
            not request.user.is_authenticated or \
                request.path.startswith('/admin/'):
                return None

        if '/api/schools/' in request.path:
            return None

        user = request.user
        request_school = getattr(request, 'school', None)


        if user.school and request_school:
            if user.school.id != request_school.id:
                return JsonResponse({
                    'error':'Access Denied',
                    'detail':'You cannot access data from another school'
                }, status=403)

        return None

        
