from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from django.contrib.auth import authenticate
from django.views.decorators.csrf import csrf_exempt
from .serializers import UserSerializer, UserListSerializer
from .models import Enrollment


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
    school_code = request.data.get('school_code')  # Optional for explicit school selection
    
    if not svc_number or not password:
        return Response(
            {'error': 'Service Number and password are required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Authenticate user using custom backend (SvcNumberBackend)
    user = authenticate(request, svc_number=svc_number, password=password)
    
    if user is None:
        return Response(
            {'error': 'Invalid credentials'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    
    if not user.is_active:
        return Response(
            {'error': 'User account is disabled'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    if user.role != 'superadmin' and user.school:
        if not user.school.is_active:
            return Response(
                {'error': 'Your school account is currently inactive. Please contact support.'},
                status=status.HTTP_403_FORBIDDEN
            )
    
    can_login, error_message = check_student_can_login(user)
    if not can_login:
        return Response(
            {'error': error_message},
            status=status.HTTP_403_FORBIDDEN
        )
    
    tokens = get_tokens_for_user(user)
    
    user_data = UserListSerializer(user).data
    
    return Response({
        'message': 'Login successful',
        'access': tokens['access'],
        'refresh': tokens['refresh'],
        'user': user_data
    }, status=status.HTTP_200_OK)


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
