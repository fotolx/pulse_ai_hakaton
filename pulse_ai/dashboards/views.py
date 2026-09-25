from django.shortcuts import redirect, render
from django.views import View
from django.views.generic import CreateView
from django.http import JsonResponse
from django.core.serializers import serialize
from django.http import HttpResponse
from django.utils.decorators import method_decorator  
from django.views.decorators.csrf import csrf_exempt 
from django.utils import timezone
from datetime import datetime,timedelta
from .models import *
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping
import pandas as pd
import numpy as np
from django.conf import settings
import time
import pickle
import os
import joblib
import json

def mobile(request):
    return render(request, 'mobile.html')   

@method_decorator(csrf_exempt, name='dispatch')
class DetectorDataCreateView(CreateView):
    context_object_name = "detector_data"
    fields = '__all__'

    def post(self, request, *args, **kwargs):
        return HttpResponse("Success", status=200)
 
@method_decorator(csrf_exempt, name='dispatch')
class RisksValuesView(View):
    def get(self, request, *args, **kwargs):
        risks = {"status": "Success",}      
        return HttpResponse(serialize("json", [risks]), content_type="application/json", status=200)
    
    def post(self, request, *args, **kwargs):
        result = {
            "status": "Success",
            "message": "Настройки сохранены успешно.",
            }
        return HttpResponse(json.dumps(result), content_type="application/json", status=200)

@method_decorator(csrf_exempt, name='dispatch')
class TasksView(View):
    def get(self, request, *args, **kwargs):
        tasks = {
  "items": [
    {
      "id": "task-107-001",
      "technicianName": "Иванов Иван",
      "position": "Техник",
      "nodeId": "107",
      "nodeName": "Узел 107",
      "district": "Первомайский",
      "task": "Плановое ТО",
      "closedAt": "2026-09-25T08:15:00.000Z",
      "statusMap": {
        "door": "norm",
        "smoke": "norm",
        "temp": "norm",
        "motion": "norm",
        "gas": "norm",
        "ups": "fault"
      },
      "checklist": [
        { "id": "door", "label": "КД Дверь", "status": "norm" },
        { "id": "ups", "label": "ИБП", "status": "fault" }
      ],
      "comment": "ИБП требует замены батареи",
      "photos": [],
      "receivedAt": "2026-09-25T08:15:03.000Z"
    }
  ]
}      
        return HttpResponse(serialize("json", [tasks]), content_type="application/json", status=200)


@method_decorator(csrf_exempt, name='dispatch')
class ArrivalsView(View):
    def get(self, request, *args, **kwargs):
        arrivals = {
  "items": [
    {
      "id": "arrival-107-001",
      "technicianName": "Иванов Иван",
      "position": "Техник",
      "nodeId": "107",
      "nodeName": "Узел 107",
      "district": "Первомайский",
      "task": "Плановое ТО",
      "arrivedAt": "2026-09-25T07:30:00.000Z",
      "receivedAt": "2026-09-25T07:30:02.000Z"
    }
  ]
}    
        return HttpResponse(serialize("json", [arrivals]), content_type="application/json", status=200)