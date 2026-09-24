from django.apps import AppConfig


class auth_usersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'auth_users'

    def ready(self):
        import auth_users.signals