from django.db import models


class AuditAction(models.TextChoices):

    CREATE = 'create', 'Create'
    UPDATE = 'update', 'Update'
    DELETE = 'delete', 'Delete'
    OTHER = 'other', 'Other'

    DELETE_USER = 'delete_user', 'User Deleted'
    DELETE_EXAM = 'delete_exam', 'Exam Deleted'
    DELETE_COURSE = 'delete_course', 'Course Deleted'
    DELETE_CLASS = 'delete_class', 'Class Deleted'
    DELETE_CERTIFICATE = 'delete_certificate', 'Certificate Deleted'

    CREATE_USER = 'create_user', 'User Created'
    ROLE_CHANGED = 'role_changed', 'Role Changed'
    USER_DEACTIVATED = 'user_deactivated', 'User Deactivated'
    USER_ACTIVATED = 'user_activated', 'User Activated'
    PRIVILEGE_CHANGED = 'privilege_changed', 'Privilege Changed'

    MEMBERSHIP_ROLE_CHANGED = 'membership_role_changed', 'School Membership Role Changed'
    MEMBERSHIP_TRANSFERRED = 'membership_transferred', 'School Membership Transferred'
    DEPARTMENT_ROLE_CHANGED = 'department_role_changed', 'Department Membership Role Changed'
    OIC_ASSIGNED = 'oic_assigned', 'OIC Assigned'
    OIC_UNASSIGNED = 'oic_unassigned', 'OIC Unassigned'

    MARKS_CHANGED = 'marks_changed', 'Marks Changed'
    BULK_MARKS_CHANGED = 'bulk_marks_changed', 'Marks Changed (Bulk)'
    RESULT_EDIT_APPROVED = 'result_edit_approved', 'Result Edit Request Approved'
    RESULT_EDIT_REJECTED = 'result_edit_rejected', 'Result Edit Request Rejected'

    EXPORT = 'export', 'Data Exported'

    LOGIN = 'login', 'Login'
    LOGIN_FAILED = 'login_failed', 'Login Failed'
    LOGOUT = 'logout', 'Logout'
