from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from django.contrib.auth import authenticate
from django.views.decorators.csrf import csrf_exempt
from .serializers import UserSerializer, UserListSerializer,SchoolMembershipSerializer
from .models import Enrollment,SchoolMembership


def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {
        'refresh': str(refresh),
        'access': str(refresh.access_token),
    }


def check_student_can_login(user):

    if user.role != 'student':
        return True, None
    
    has_active_enrollment = Enrollment.all_objects.filter(
        student=user,
        is_active=True,
        class_obj__is_active=True
    ).exists()
    
    if not has_active_enrollment:
        return False, "Your enrollment is not active. Please contact your school administrator."
    
    return True, None


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    svc_number = request.data.get('svc_number')
    password = request.data.get('password')

    user = authenticate(
        request, svc_number=svc_number, password=password
    )
    if user is None:
        return Response(
            {'error': 'Invalid credentials'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    if not user.is_active:
        return Response(
            {'error': 'Account disabled'},
            status=status.HTTP_403_FORBIDDEN
        )

    memberships = SchoolMembership.all_objects.filter(
        user=user, status='active'
    ).select_related('school')

    if user.role != 'superadmin' and not memberships.exists():
        history = SchoolMembership.all_objects.filter(
            user=user
        ).select_related('school').order_by('-ended_at')
        return Response({
            'error': 'No active school membership.',
            'school_history': SchoolMembershipSerializer(
                history, many=True
            ).data
        }, status=status.HTTP_403_FORBIDDEN)

    tokens = get_tokens_for_user(user)
    user_data = UserListSerializer(user).data

    response_data = {
        'message': 'Login successful',
        'access': tokens['access'],
        'refresh': tokens['refresh'],
        'must_change_password': user.must_change_password,
        'user': user_data,
    }

    if memberships.count() > 1:
        response_data['available_schools'] = [
            {'code': m.school.code, 'name': m.school.name,
             'role': m.role}
            for m in memberships
        ]

    return Response(response_data, status=status.HTTP_200_OK)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):

    try:
        refresh_token = request.data.get('refresh')
        if refresh_token:
            token = RefreshToken(refresh_token)
            token.blacklist()
        
        return Response({
            'message': 'Logout successful'
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({
            'error': 'Invalid token or token already blacklisted'
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def token_refresh_view(request):

    from rest_framework_simplejwt.serializers import TokenRefreshSerializer
    
    serializer = TokenRefreshSerializer(data=request.data)
    
    if serializer.is_valid():
        return Response(serializer.validated_data, status=status.HTTP_200_OK)
    
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_user_view(request):
    serializer = UserListSerializer(request.user)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):

    user = request.user
    old_password = request.data.get('old_password')
    new_password = request.data.get('new_password')
    new_password2 = request.data.get('new_password2')
    
    if not all([old_password, new_password, new_password2]):
        return Response(
            {'error': 'All password fields are required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if new_password != new_password2:
        return Response(
            {'error': 'New passwords do not match'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if not user.check_password(old_password):
        return Response(
            {'error': 'Old password is incorrect'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    from django.contrib.auth.password_validation import validate_password
    from django.core.exceptions import ValidationError
    
    try:
        validate_password(new_password, user)
    except ValidationError as e:
        return Response(
            {'error': list(e.messages)},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    user.set_password(new_password)
    user.must_change_password = False
    user.save()
    
    tokens = get_tokens_for_user(user)
    
    return Response({
        'message': 'Password changed successfully',
        'access': tokens['access'],
        'refresh': tokens['refresh']
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify_token_view(request):

    user = request.user
    
    if user.role == 'student':
        can_login, error_message = check_student_can_login(user)
        if not can_login:
            return Response({
                'valid': False,
                'error': error_message
            }, status=status.HTTP_403_FORBIDDEN)
    
    return Response({
        'message': 'Token is valid',
        'valid': True,
        'user': UserListSerializer(user).data
    }, status=status.HTTP_200_OK)
