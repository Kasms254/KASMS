from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

def custom_exception_handler(exc, context):

    response = exception_handler(exc, context)

    if response is not None:
        
        custom_response_data = {
            'error': True,
            'status_code': response.status_code,
        }


        if isinstance(response.data, dict):
            if 'detail' in response.data:
                custom_response_data['message'] = response.data['detail']
                custom_response_data['errors'] = response.data

            else:
                custom_response_data['message'] = 'An error occurred'
                custom_response_data['errors'] = response.data
        elif isinstance(response.data, list):
            custom_response_data['message'] = response.data[0] if response.data else 'An error occured'
            custom_response_data['errors'] = response.data

        else:
            custom_response_data['message'] = str(response.data)
            custom_response_data['errors'] = {'detail':str(response.data)}

        response.data = custom_response_data

    return response


def get_school_from_request(request):

    if hasattr(request, 'school') and request.school:
        return request.school

    if hasattr(request, 'user') and request.user.is_authenticated:
        if hasattr(request.user, 'school') and request.user.school:
            return request.user.school

    subdomain = request.headers.get('X-School-Subdomain')
    if subdomain:
        from core.models import School
        try:
            return School.objects.get(subdomain=subdomain, is_active=True)
        except School.DoesNotExist:
            pass

    return None

def validate_school_access(user, obj):
    
    if not hasattr(obj, 'school'):
        return True

    if not hasattr(user, 'school') or not user.school:
        return False

    return user.school.id == obj.school.id


def generate_unique_code(prefix, model, field_name, school=None, length=6):


    import random
    import string

    while True:
        random_part = ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))
        code = f"{prefix}{random_part}"


        filter_kwargs = {field_name: code}
        if school:
            filter_kwargs['school'] = school

        if not model.objects.filter(**filter_kwargs).exists():
            return code

def format_duration(duration):

    if not duration:
        return "N/A"

    total_seconds = int(duration.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60

    parts = []
    if hours > 0:
        parts.append(f"{hours} hour {'s' if hours != 1 else ''}")
    if minutes > 0:
        parts.append(f"{minutes} minute {'s' if minutes != 1 else ''}")

    return " ".join(parts) if parts else "Less than a minute"



def calculate_grade_distribution(results):

    distribution = {'A':0, 'B':0, 'C':0, 'D':0, 'F':0}

    for result in results:
        if result.marks_obtained is not None:
            grade = result.grade
            distribution[grade] = distribution.get(grade, 0) + 1

    return distribution



def get_attendance_summary(attendance_queryset):
    
    total = attendance_queryset.count()

    if total == 0:
        return {
            'total':0,
            'present': 0,
            'absent': 0,
            'late': 0,
            'excused': 0,
            'attendance_rate': 0,
        }

    present = attendance_queryset.filter(status='present').count()
    absent = attendance_queryset.filter(status='absent').count()
    late = attendance_queryset.filter(status='late').count()
    excused = attendance_queryset.filter(status='excused').count()

    return{
        'total': total,
        'present': present,
        'absent': absent,
        'late': late,
        'excused': excused,
        'attendance_rate': round((present / total) * 100, 2),
        'present_percentage':round((present / total)* 100, 2),
        'absent_percentage': round((absent / total)* 100, 2),
        'late_percentage':round((late / total)* 100, 2 ),
        'excused_percentage':round((excused / total)* 100, 2)

    }