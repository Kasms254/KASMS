from rest_framework import status
from rest_framework.response import Response
from django.db.models import Q


class SchoolFilterMixin:

    def get_queryset(self):
        queryset = super().get_queryset()

        school = getattr(self.request, 'school', None)

        if not school and self.request.user.is_authenticated:
            school = self.request.user.school

        
        if school and hasattr(queryset.model, 'school'):
            queryset = queryset.filter(school=school)

        
        return queryset


    def perform_create(self, serializer):
        school = getattr(self.request, 'school', None)

        if not school and self.request.user.is_authenticated:
            school = self.request.user.school


        if school and 'school' in serializer.validated_data.keys() or \
            (hasattr(serializer.Meta.model, 'school')):
            serializer.save(school=school)

        else:
            serializer.save()

class SchoolValidationMixin:
    
    def check_school_access(self, obj):
        if not hasattr(obj, 'school'):
            return True

        
        user_school = self.request.user.school
        obj_school = obj.school


        if user_school and obj_school:
            return user_school.id == obj_school.id


        return False

    def get_object(self):
        obj = super().get_object()

        if not self.check_school_access(obj):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(
                "YOu dont have permission this resource from another School"
            )

        return obj


class InstructorFilterMixin:

    def get_queryset(self):

        queryset = super().get_queryset()
        user  = self.request.user


        if user.role == "admin":
            return queryset


        if user.role == "instructor":
            model_name = queryset.model.__name__

            if model_name == "Class":
                queryset = queryset.filter(
                    Q(instructor=user) | Q(subjects__instructor=user)
                ).distinct()

            elif model_name == "Subject":
                queryset = queryset.filter(instructor=user)

            elif model_name == 'Exam':
                queryset = queryset.filter(subject__instructor=user)

            elif model_name == "ExamResult":
                queryset = queryset.filter(exam__subject__instructor=user)
            
            elif model_name == "Attendance":
                queryset = queryset.filter(
                    Q(class_obj__instructor=user) |
                    Q(subject__instructor=user)
                )

            elif model_name == "Enrollment":
                queryset = queryset.filter(
                    Q(class_obj__instructor = user )|
                    Q(class_obj__subjects__instructor=user)
                ).distinct()

        elif user.role == "student":
            model_name = queryset.model.__name__

            if model_name == "Enrollment":
                queryset = queryset.filter(student=user)

            elif model_name == "ExamResult":
                queryset = queryset.filter(student=user)

            elif model_name == "Attendance":
                queryset = queryset.filter(student=user)


            elif model_name in ['Class', 'Subject']:
                enrolled_class_ids = user.enrollemnts.filter(
                    is_active = True
                ).values_list('class_obj_id', flat=True)

                if model_name == "Class":
                    queryset = queryset.filter(id__in=enrolled_class_ids)
                else:
                    queryset= queryset.filter(class_obj_id = enrolled_class_ids)

            elif model_name == "Exam":
                enrolled_class_ids = user.enrollments.filter(
                    is_active = True
                ).values_list('class_obj_id', flat=True)
                queryset = queryset.filter(subject__class_obj_id__in=enrolled_class_ids)

        return queryset



class StudentEnrollmentValidationMixin:

    def perform_create(self, serializer):

        if school and role:
            is_valid, error_msg = self.validate_school_capacity(school, role)
            if not is_valid:
                from rest_framework.exceptions import ValidationError
                raise ValidationError ({
                    'school': error_msg
                })

        super().perform_create(serializer)


class BulkOperationMixin:

    def validate_bulk_school_access(self, items):
        
        user_school = self.request.user.school

        for item in items:
            if hasattr(item, 'school'):
                if item.school.id != user_school.id:
                    return False, f"Item {item.id} belongs to a different school"
        
        return True, None


    def perform_bulk_update(self, queryset, update_data):

        is_valid, error_msg = self.validate_bulk_school_access(queryset)
        if not is_valid:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(error_msg)

        return queryset.update(**update_data)
        
    