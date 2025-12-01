from django.http import HttpResponseNotFound
from .models import School


class SchoolSubdomainMiddleware:

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        host = request.get_host().split(":")[0]
        parts = host.split('.')

        subdomain = None
        if len(parts) > 2:
            subdomain = parts[0]
        
        if subdomain =="superadmin":
            request.school = None
        elif subdomain:
            request.school = School.objects.filter(subdomain=subdomain).first()
        else:
            request.school = None

        return self.get_response(request)