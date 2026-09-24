from .views import *
from django.urls import path
from django.views.generic import TemplateView

urlpatterns = [
    path('', TemplateView.as_view(template_name='flatpages/home.html'), name='main'),
    path('m/', mobile, name="mobile"),
]