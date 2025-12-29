from rest_framework.permissions import BasePermission
from rest_framework import permissions

class IsAdmin(BasePermission):
    
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'admin'
    

class IsAdminOrInstructor(BasePermission):

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['admin', 'instructor']
    

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


class IsInstructorOfSubject(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False

        
        if request.user.role == "admin":
            return True
        
        if request.user.role != "instructor":
            return False


        if hasattr(obj, 'instructor'):
            return obj.instructor == request.user

        if hasattr(obj, 'subject'):
            return obj.subject.instructor == request.user

        return False
        
    
class IsStudent(BasePermission):

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'student'
    

class IsCommandant(BasePermission):

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'commandant'
    

class IsOwnerOrAdmin(permissions.BasePermission):


    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.role == 'admin':
            return True

        if hasattr(obj, 'student'):
            return obj.student == request.user

        if hasattr(obj, 'created_by'):
            return obj.created_by == request.user

        return False

class CanManageSchoolUsers(permissions.BasePermission):

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.role == 'admin':
            return True

        if request.user.role == 'instructor':
            return request.method in permissions.SAFE_METHODS

        return False
 
class SchoolResourcePermission(permissions.BasePermission):

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        request_school = getattr(request, 'school', None)
        if request_school and request.user.school:
            if request.user.school.id != request_school.id:
                return False

        
        if request.user.role == 'admin':
            return True


        if request.user.role == 'student':
            return request.method in permissions.SAFE_METHODS

        return False


    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False

        if hasattr(obj, 'school'):
            if obj.school.id != request.user.school.id:
                return False

        if request.user.role == 'admin':
            return True


        if request.user.role == 'instructor':
            if hasattr(obj, 'instructor') and obj.instructor == request.user:
                return True
            if hasattr(obj, 'created_by') and obj.created_by == request.user:
                return True

            return request.method in permissions.SAFE_METHODS


        if request.user.role == 'student':
            return request.method in permissions.SAFE_METHODS

        return False

