from django.urls import path
from .adms_views import adms_cdata, adms_getrequest, adms_devicecmd

app_name = 'adms'

urlpatterns = [
    path('cdata', adms_cdata, name='adms-cdata'),
    path('cdata/', adms_cdata, name='adms-cdata-slash'),
    path('getrequest', adms_getrequest, name='adms-getrequest'),
    path('getrequest/', adms_getrequest, name='adms-getrequest-slash'),
    path('devicecmd', adms_devicecmd, name='adms-devicecmd'),
    path('devicecmd/', adms_devicecmd, name='adms-devicecmd-slash'),
]