from .views import *
from django.urls import path
from django.views.generic import TemplateView

urlpatterns = [
    path('', TemplateView.as_view(template_name='index.html'), name='main'),
    path('events/', TemplateView.as_view(template_name='events.html'), name='events'),
    path('equipment/', TemplateView.as_view(template_name='equipment.html'), name='equipment'),
    path('pickets/', TemplateView.as_view(template_name='pickets.html'), name='pickets'),
    path('scheme/', TemplateView.as_view(template_name='scheme.html'), name='scheme'),
    path('api/tasks', TasksView.as_view(), name='tasks'),
    path('api/arrivals', ArrivalsView.as_view(), name='arrivals'),
    path('m/', mobile, name="mobile"),
]