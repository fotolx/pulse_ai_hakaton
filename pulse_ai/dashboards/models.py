from django.db import models
from django.utils import timezone

# Create your models here.

def user_directory_path(instance, filename):
    return 'saved_models/user_{0}/%Y-%m-%d-%H-%M-%S-{1}'.format(instance.user.id, filename)

# class SavedModel(models.Model):
#     timestamp = models.DateTimeField(default=timezone.now)
#     name = models.CharField(max_length=100)
#     description = models.TextField(default="", blank=True)
#     accuracy = models.FloatField(default=0.0)
#     model_file = models.FileField(upload_to=user_directory_path, max_length=255)
#     metadata_file = models.FileField(upload_to=user_directory_path, max_length=255)
#     def __str__(self):
#         return self.timestamp.__str__()+" - "+self.name