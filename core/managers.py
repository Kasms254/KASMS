from django.db import models
from django.contrib.auth.models import UserManager
import threading
from contextvars import ContextVar
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from .models import School

_current_school: ContextVar[Optional['School']] = ContextVar('current_school', default=None)


def get_current_school() -> Optional['School']:

    return _current_school.get()

def set_current_school(school: Optional['School']) -> None:

    _current_school.set(school)


def clear_current_school() -> None:

    _current_school.set(None)

class TenantAwareQuerySet(models.QuerySet):
    
    def for_school(self, school):
        if school is None:
            return self
        return self.filter(school=school)
    
    def for_current_school(self):
        school = get_current_school()
        if school is None:
            return self
        return self.filter(school=school)

class TenantAwareUserManager(UserManager):

    def get_queryset(self):
        queryset = super().get_queryset()
        school = get_current_school()

        if school is not None:
            return queryset.filter(
                school_memberships__school=school,
                school_memberships__status='active'
            ).distinct()
        return queryset
    
    def get_by_natural_key(self, username):

        school = get_current_school()
        if school:
            try:
                return self.get(**{self.model.USERNAME_FIELD: username, 'school': school})
            except self.model.DoesNotExist:
                pass
        return self.model.all_objects.get(**{self.model.USERNAME_FIELD: username})
    
    def create_user(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        extra_fields.pop('school', None)
        return self._create_user(username, email, password, **extra_fields)
    
    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'superadmin')
        extra_fields.pop('school', None)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self._create_user(username, email, password, **extra_fields)
    
    def _create_user(self, username, email, password, **extra_fields):
        if not username:
            raise ValueError('The given username must be set')

        extra_fields.pop('school', None)

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

    def for_school(self, school):
        return super().get_queryset().filter(school=school)

    def create(self, **kwargs):
        if 'school' not in kwargs or kwargs['school'] is None:
            school = get_current_school()
            if school:
                kwargs['school'] = school
        return super().create(**kwargs)

    def get_or_create(self, defaults=None, **kwargs):

        if 'school' not in kwargs:
            school = get_current_school()
            if school is not None:
                kwargs['school'] = school
        return super().get_or_create(defaults=defaults, **kwargs)
    
    def update_or_create(self, defaults=None, **kwargs):

        if 'school' not in kwargs:
            school = get_current_school()
            if school is not None:
                kwargs['school'] = school
        return super().update_or_create(defaults=defaults, **kwargs)
 
# class SimpleTenantAwareManager(models.Manager):

#     def get_queryset(self):
#         queryset = super().get_queryset()
#         school = get_current_school()
#         if school:
#             return queryset.filter(school=school)
#         return queryset

#     def create(self, **kwargs):
#         if 'school' not in kwargs or kwargs['school'] is None:
#             school = get_current_school()
#             if school:
#                 kwargs['school'] = school
#         return super().create(**kwargs)

SimpleTenantAwareManager = TenantAwareManager
