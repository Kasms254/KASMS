from rest_framework_simplejwt.tokens import RefreshToken

def get_tokens_for_user(user):

    if user is None:
        return {
            "refresh":None,
            "access":None,}
    
    refresh = RefreshToken.for_user(user)

    refresh["role"] = user.role
    refresh["school_id"] = user.school.id if user.school else None

    access = refresh.access_token
    access["role"] = user.role
    access["school_id"] = user.school.id if user.school else None


    return {
        "refresh":str(refresh),
        "access":str(access),
    }