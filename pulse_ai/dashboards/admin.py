from django.contrib import admin
from .utils import admin_register
from .models import *


admin_register(namespace=globals())