# from django.contrib import admin


# def admin_register(namespace):
#     for name, model_admin in namespace.copy().items():
#         if name.endswith("Admin"):
#             model = namespace[name[:-5]]
#             try:admin.site.register(model, model_admin)
#             except:raise