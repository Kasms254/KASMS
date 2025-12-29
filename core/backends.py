from django.contrib.auth.backends import ModelBackend
from .models import User

class SvcNumberBackend(ModelBackend):
    
    def authenticate(self, request, svc_number=None, password=None, **kwargs):

        if svc_number is None or password is None:
            return None

        school = None
        school_subdomain = kwargs.get('school_subdomain')
        school_id = kwargs.get('school_id')

        if school_subdomain:
            try:
                school = School.objects.get(subdomain=school_subdomain, is_active=True)

            except School.DoesNotExist:
                return None

        elif school_id:
            try:
                school = School.objects.get(id=school_id, is_active=True)
            except School.DoesNotExist:
                return None

        
        user = None

        try:
            user = User.objects.get(svc_number=svc_number)
        
        except User.DoesNotExist:
            try:
                user = User.objects.get(svc_number=svc_number)

            except User.DoesNotExist:
                try:
                    user = User.objects.get(email=svc_number)

                except User.DoesNotExist:
                    return None


        if school and user.school.id != school.id:
            return None


        if not user.school.is_active:
            return None


        if user.check_password(password) and self.user_can_authenticate(user):
            return user

        return None


    def get_user(self, user_id):

        try:
            user = User.objects.get(pk=user_id)
            if user.school and user.school.is_active:
                return user

        except User.DoesNotExist:
            return None



        return None



class SchoolAwareModelBackend(ModelBackend):

    def authenticate(self, request, password=None, **kwargs):



        school = None
        if request:
            school = getattr( request, 'school', None)
            if not school:
                subdomain = request.headers.get('X-School-Subdomain')
                if subdomain:
                    try:
                        school = School.objects.get(subdomain=subdomain, is_active=True)
                    except School.DoesNotExist:
                        pass

        try:
            user = User.objects.get(svc_number=svc_number)

        except User.DoesNotExist:
            return None


        if school and user.school.id != school.id:
            return None


        if not user.school.is_active:
            return None

        if user.check_password(password) and self.user_can_authenticate(user):
            return user

        return None

