from django.http import HttpResponseNotFound
from .models import School


class SchoolSubdomainMiddleware:

    def __init__(self, get_response):
        self.get_response = get_response


    def __call__(self, request):
        host = request.get_host().split(":")[0]

        if 'localhost' in host or '127.0.0.1' in host:
            subdomain = request.GET.get('school') or request.headers.get('X-School-Subdomain')
            if subdomain == 'superadmin':
                request.school = None
            elif subdomain:
                request.school = School.objects.filter(
                    subdomain=subdomain
                ).first()
            else:
                request.school = None

        else:
            parts = host.split('.')
            if len(parts) > 2:
                subdomain = parts[0]
            elif len(parts) == 2:
                subdomain = parts [0]
            else:
                subdomain = None

            if subdomain == "superadmin":
                request.school = None
            elif subdomain:
                request.school = School.objects.filter(subdomain=subdomain).first()
            else:
                request.school = None
        return self.get_response(request)
    
    