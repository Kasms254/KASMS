from django.db import models
from django.db.models import Q


class SchoolQuerySet(models.QuerySet):

    def for_school(self, school):
        if school:
            return self.filter(school=school)
        return self

    def active(self):
        return self.filter(is_active=True)


class SchoolManager(models.Manager):

    def get_queryset(self):
        return SchoolQuerySet(self.model, using=self._db)

    def for_school(self, school):
        return self.get_queryset().for_school(school)

    def active(self):
        return self.get_queryset().active()

    def for_current_school(self):
        from core.middleware import get_current_school
        school = get_current_school()
        return self.for_school(school)

        