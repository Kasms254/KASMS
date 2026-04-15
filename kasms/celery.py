from celery import Celery
import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'kasms.settings')

app = Celery('kasms')
app.config_from_object('django.conf:settings', 
namespace='CELERY')
app.autodiscover_tasks()

