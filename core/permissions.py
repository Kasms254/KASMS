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
        
