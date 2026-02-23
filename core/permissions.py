from rest_framework.permissions import BasePermission
from rest_framework import permissions
from rest_framework.permissions import BasePermission, SAFE_METHODS
from .managers import get_current_school
from .models import DepartmentMembership


class IsSuperAdmin(BasePermission):

    message = "Only superadmins can perform this action."
    
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated and 
            request.user.role == 'superadmin'
        )

class IsSchoolAdmin(BasePermission):

    message = "Only school administrators can perform this action."
    
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.user.role in ['admin', 'superadmin']

class IsAdmin(BasePermission):
    
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['admin', 'superadmin']
    
class IsAdminOrInstructor(BasePermission):

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['admin', 'instructor', 'superadmin']
    
class IsInstructor(BasePermission):

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'instructor'
    
class IsInstructorofClass(BasePermission):
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        
        if request.user.role != 'instructor':
            return False

        if obj.instructor == request.user:
            return True
        
        teaches_subject = obj.subjects.filter(instructor=request.user).exists()
        return teaches_subject
    
class IsStudent(BasePermission):

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'student'
    
class IsCommandant(BasePermission):

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'commandant'
    
class IsOwnerOrAdmin(permissions.BasePermission):

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True

        if hasattr(obj, 'owner'):
            return obj.owner == request.user or request.user.role == 'admin'

        return request.user.role == 'admin'

class IsInstructorOfClassOrAdmin(BasePermission):
    def has_object_permission(self, request, view, obj):
        return(
            request.user.is_authenticated and (
                request.user.role == 'admin' or 

                obj.instructor == request.user
            )
        )
        
class IsAdminOrCommandant(BasePermission):

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['admin', 'commandant', 'superadmin']

class  ReadOnlyForCommandant(permissions.BasePermission):

    def has_permission(self, request, view):

        if not request.user or not request.user.is_authenticated:
            return False

        user_role = getattr(request.user, 'role', None)

        if user_role == 'admin':
            return True

        
        if user_role == "commandant":
            return request.method in permissions.SAFE_METHODS

        return False


    message = "You do not have permission to perform this action"

class BelongsToSameSchool(BasePermission):

    message = "You can only access resources from your school."
    
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        
        if request.user.role == 'superadmin':
            return True
        
        if not request.user.school:
            return False
        
        return True
    
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        
        if request.user.role == 'superadmin':
            return True
        
        if hasattr(obj, 'school'):
            return obj.school == request.user.school
        
        return True

class CanAccessSchoolData(BasePermission):

    message = "You do not have permission to access this data."
    
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        
        if request.user.role == 'superadmin':
            return True
        
        if not request.user.school:
            return False
        
        current_school = get_current_school()
        if current_school and current_school != request.user.school:
            return False
        
        return True
    
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        
        if request.user.role == 'superadmin':
            return True
        
        if hasattr(obj, 'school') and obj.school:
            return obj.school == request.user.school
        
        return True

class ForcePasswordChangePermission(BasePermission):

    def has_permission(self, request, view):

        user = request.user

        if not user or not user.is_authenticated:
            return True

        allowed_views = [
            "change_password_view",
            "logout_view",
            "verify_token_view",
            "token_refresh_view",
        ]

        if user.must_change_password:
            return view.__name__ in allowed_views

        return True

# department permission

class IsHOD(BasePermission):

    message = "Only a Head of Department can perform this action."

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return DepartmentMembership.objects.filter(
            user=request.user,
            role=DepartmentMembership.Role.HOD,
            is_active=True,
        ).exists()

class IsHODOfDepartment(BasePermission):

    message = "You are not the HOD of this department."

    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        if request.user.role in ('admin', 'superadmin'):
            return True
        department = getattr(obj, 'department', None)
        if department is None:
            return False
        return DepartmentMembership.objects.filter(
            department=department,
            user=request.user,
            role=DepartmentMembership.Role.HOD,
            is_active=True,
        ).exists()

class IsHODOrAdmin(BasePermission):

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.user.role in ('admin', 'superadmin'):
            return True
        return DepartmentMembership.objects.filter(
            user=request.user,
            role=DepartmentMembership.Role.HOD,
            is_active=True,
        ).exists()



