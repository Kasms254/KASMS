
from pathlib import Path
from datetime import timedelta
import os
# from decouple import Config, RepositoryEnv
from dotenv import load_dotenv
import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv('SECRET_KEY') or 'dev-secret-key'

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.getenv("DEBUG", "True") == "True"


ALLOWED_HOSTS = os.getenv(
    "ALLOWED_HOSTS",
    "localhost,127.0.0.1,192.168.2.254"
).split(",")


# Application definition

INSTALLED_APPS = [
    "corsheaders",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "core",
    # 'rest_framework.authtoken',
    "rest_framework",
    "django_filters",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "core.middleware.TenantMiddleware",
    "core.middleware.SchoolAccessMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "kasms.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "kasms.wsgi.application"


# Database
# https://docs.djangoproject.com/en/4.2/ref/settings/#databases



# AUTH_USER_MODEL = "users.User"

DATABASES = {
    "default": {
        # "ENGINE": "django.db.backends.sqlite3",
        # "NAME": BASE_DIR / "db.sqlite3",
        "ENGINE":os.getenv('ENGINE', default='django.db.backends.postgresql'),
        "NAME": os.getenv('DB_NAME', default='kasms_db'),
        "USER": os.getenv('DB_USER', default='kasms_user'),
        "PASSWORD": os.getenv('DB_PASSWORD', default='kasms_password'),
        "HOST": os.getenv('HOST', default='localhost'),
        "PORT": os.getenv('PORT', default='5432'),
        "CONN_MAX_AGE": 600,
        
    }
    #  "default": dj_database_url.config(
    #     default=os.environ.get("DATABASE_URL")
    # )
}

CACHES = {
    "default": {
        "BACKEND": os.getenv(
            "CACHE_BACKEND",
            "django.core.cache.backends.redis.RedisCache"
            if os.getenv("REDIS_URL")
            else "django.core.cache.backends.locmem.LocMemCache",
        ),
        "LOCATION": os.getenv("REDIS_URL", "unique-snowflake"),
        "TIMEOUT": 300,  
        "OPTIONS": {
            "MAX_ENTRIES": 5000,
        },
    }
}

# Password validation
# https://docs.djangoproject.com/en/4.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# Internationalization
# https://docs.djangoproject.com/en/4.2/topics/i18n/

LANGUAGE_CODE = "en-us"

TIME_ZONE = "Africa/Nairobi"

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/4.2/howto/static-files/

STATIC_URL = "static/"
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# Default primary key field type
# https://docs.djangoproject.com/en/4.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "core.User"

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME':timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME':timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION':True,
    'UPDATE_LAST_LOGIN': True,

    'ALGORITHM': 'HS256',
    'SIGNING_KEY' : SECRET_KEY,
    'VERIFYING_KEY': None,
    'AUDIENCE': None,
    'ISSUER': None,

    'AUTH_HEADER_TYPES': ('Bearer',),
    'AUTH_HEADER_NAME': 'HTTP_AUTHORIZATION',
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',

    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
    'TOKEN_TYPE_CLAIM': 'token_type',
}

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'core.authentication.CookieJWTAuthentication',
        
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'core.permissions.ForcePasswordChangePermission',

    ],

    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 10,
}

CORS_ALLOWED_ORIGINS = os.getenv("CORS_ALLOWED_ORIGINS", ",".join([
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:8000",
])).split(",")

CORS_ALLOW_CREDENTIALS = True

CORS_ALLOW_METHODS = [
    "DELETE",
    "GET",
    "OPTIONS",
    "PATCH",
    "POST",
    "PUT",
]

CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
    "x-school-code",
]

CORS_EXPOSE_HEADERS = ["X-CSRFToken"]
CORS_PREFLIGHT_MAX_AGE = 86400


MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

AUTHENTICATION_BACKENDS = [
    'core.backends.SvcNumberBackend',
    'django.contrib.auth.backends.ModelBackend',
]
CSRF_TRUSTED_ORIGINS = os.getenv("CSRF_TRUSTED_ORIGINS", ",".join([
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:8000",
])).split(",")

CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_NAME = "csrftoken"
CSRF_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SAMESITE = 'None' if not DEBUG else 'Lax'
SESSION_COOKIE_SAMESITE = 'None' if not DEBUG else 'Lax'


JWT_COOKIE_SECURE = not DEBUG
JWT_COOKIE_SAMESITE = 'None' if not DEBUG else 'Lax'
JWT_COOKIE_DOMAIN = os.getenv('COOKIE_DOMAIN', None) 
JWT_ACCESS_COOKIE_NAME = 'access_token'
JWT_REFRESH_COOKIE_NAME = 'refresh_token'

AUTHENTICATION_BACKENDS = [
    'core.backends.SvcNumberBackend',
    'django.contrib.auth.backends.ModelBackend',
]

EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')       
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '') 
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', EMAIL_HOST_USER)

# 2FA settings
TWO_FA_CODE_LENGTH = int(os.getenv('TWO_FA_CODE_LENGTH', 6))
TWO_FA_CODE_EXPIRY_MINUTES = int(os.getenv('TWO_FA_CODE_EXPIRY_MINUTES', 5))
TWO_FA_MAX_ATTEMPTS = int(os.getenv('TWO_FA_MAX_ATTEMPTS', 5))
