from rest_framework.permissions import BasePermission
from rest_framework import permissions
from rest_framework.permissions import BasePermission, SAFE_METHODS
from .managers import get_current_school
from .models import DepartmentMembership
from rest_framework.permissions import BasePermission, SAFE_METHODS
from .models import OICAssignment


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
        return request.user.is_authenticated and request.user.role in ['admin', 'instructor', 'superadmin', 'commandant', 'chief_instructor', 'oic']
    
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
        return request.user.is_authenticated and request.user.role in ['admin', 'commandant', 'chief_instructor','oic','superadmin']

class ReadOnlyForCommandant(BasePermission):

    def has_permission(self, request, view):

        if not request.user or not request.user.is_authenticated:
            return False

        user_role = getattr(request.user, 'role', None)

        if user_role in ('admin', 'superadmin'):
            return True

        if user_role in ('commandant', 'chief_instructor', 'oic'):
            return request.method in SAFE_METHODS

        return False

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

            "login_view",
            "verify_2fa_view",
            "resend_2fa_view",
            "csrf_token_view",
        ]

        if user.must_change_password:
            return view.__name__ in allowed_views

        return True

class IsInstructorOfSubject(BasePermission):
    
    message = "You can only enter the marks for subjects assigned to you"

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in ["instructor", "admin", "superadmin"]
        )

    def has_object_permission(self, request, view, obj):
        if request.user.role in ["admin", "superadmin"]:
            return True
        return obj.exam.subject.instructor == request.user
             
class IsAdminOnly(BasePermission):
    message = "Only administrators can access this resource."

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in ["admin", "superadmin"]
        )
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

class IsChiefInstructor(BasePermission):
    message = "Only the Chief Instructor can perform this action."

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role == 'chief_instructor'
        )

class IsCommandantOrChiefInstructor(BasePermission):

    message = "Only Commandant, Chief Instructor, or Admin can access this."

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in [
                'commandant', 'chief_instructor', 'oic','admin', 'superadmin'
            ]
        )

class ReadOnlyForCommandantOrChiefInstructor(BasePermission):

    message = "You do not have permission to perform this action."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        user_role = getattr(request.user, 'role', None)

        if user_role in ('admin', 'superadmin'):
            return True

        if user_role in ('commandant', 'chief_instructor', 'oic'):
            return request.method in SAFE_METHODS

        return False

# oic

class IsOIC(BasePermission):

    message = 'Only an Officer in Charge (OIC) can perform this action.'

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role == 'oic'
        )

class IsOICOfClass(BasePermission):

    message = 'You are not assigned as the OIC for this class.'

    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False

        if request.user.role in ('admin', 'superadmin'):
            return True

        if request.user.role != 'oic':
            return False

        class_obj = getattr(obj, 'class_obj', None)
        if class_obj is None and hasattr(obj, 'pk') and obj.__class__.__name__ == 'Class':
            class_obj = obj

        if class_obj is None:
            return False

        return OICAssignment.all_objects.filter(
            oic=request.user,
            class_obj=class_obj,
            is_active=True,
        ).exists()

class IsOICOrAdmin(BasePermission):

    message = 'Only an OIC or administrator can perform this action.'

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in ('oic', 'admin', 'superadmin')
        )

class IsOICOrAdminOrCommandant(BasePermission):

    message = 'You do not have permission to perform this action.'

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in (
                'oic', 'commandant', 'chief_instructor',
                'admin', 'superadmin',
            )
        )

class ReadOnlyForOIC(BasePermission):

    message = 'OICs have read-only access to this resource.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        user_role = getattr(request.user, 'role', None)

        if user_role in ('admin', 'superadmin'):
            return True

        if user_role == 'oic':
            return request.method in SAFE_METHODS

        return False
