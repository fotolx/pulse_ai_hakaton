from django.contrib import admin
from .models import *
    
class ProfileAdmin(admin.ModelAdmin):
    list_display = ('id', 'fio', 'user', 'avatar', 'about',)
    list_filter = ('avatar', 'about',)

    def fio(self, row):
        return f'{row.user.first_name} {row.user.last_name}'

class UsersAdmin(admin.ModelAdmin):
    list_display = ('id', 'username', 'first_name', 'last_name', 'email', 'reg_date', )
    list_filter = ('reg_date',)

    def fio(self, row):
        return f'{row.user.first_name} {row.user.last_name}'
    
    def __str__(self, row):
        return f'{row.user.first_name} {row.user.last_name}'
    
# Register your models here.
admin.site.register(Profile, ProfileAdmin)
admin.site.register(Users, UsersAdmin)
