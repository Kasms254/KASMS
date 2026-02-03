from django.db import models
from django.contrib.auth.models import UserManager, BaseUserManager
import threading


def get_current_school():
    return getattr(threading.current_thread(), '_school_context', None)


def set_current_school(school):
    threading.current_thread()._school_context = school


class TenantAwareUserManager(UserManager):
 

    def get_queryset(self):
        queryset = super().get_queryset()
        school = get_current_school()
        if school:
            return queryset.filter(school=school)
        return queryset
    
    def get_by_natural_key(self, username):
 
        school = get_current_school()
        if school:
            return self.get(**{self.model.USERNAME_FIELD: username, 'school': school})
        else:
            return self.model.all_objects.get(**{self.model.USERNAME_FIELD: username})
    
    def create_user(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        return self._create_user(username, email, password, **extra_fields)
    
    def create_superuser(self, username, email=None, password=None, **extra_fields):

        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'superadmin')
        extra_fields['school'] = None  
        
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')
        
        return self._create_user(username, email, password, **extra_fields)
    
    def _create_user(self, username, email, password, **extra_fields):
        if not username:
            raise ValueError('The given username must be set')
        
        email = self.normalize_email(email) if email else ''
        username = self.model.normalize_username(username)
        
        user = self.model(username=username, email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user


class TenantAwareManager(models.Manager):

    def get_queryset(self):
        queryset = super().get_queryset()
        school = get_current_school()
        if school:
            return queryset.filter(school=school)
        return queryset
    
    def create(self, **kwargs):

        if 'school' not in kwargs or kwargs['school'] is None:
            school = get_current_school()
            if school:
                kwargs['school'] = school
        return super().create(**kwargs)


class SimpleTenantAwareManager(models.Manager):


    def get_queryset(self):
        queryset = super().get_queryset()
        school = get_current_school()
        if school:
            return queryset.filter(school=school)
        return queryset


TenantAwareManager = TenantAwareManager
