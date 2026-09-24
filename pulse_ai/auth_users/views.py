from django.shortcuts import render, redirect
from django.urls import reverse_lazy
from django.views.generic import ListView, DetailView, UpdateView, CreateView, DeleteView, TemplateView
from .models import *
from django.contrib import messages
from django.views import View
from .forms import *
from django.contrib.auth.views import LoginView, PasswordResetView, PasswordChangeView
from django.contrib.messages.views import SuccessMessageMixin
from django.contrib.auth.decorators import login_required
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin


@login_required
def profile(request):
    if request.method == 'POST':
        user_form = UpdateUserForm(request.POST, instance=request.user)
        profile_form = UpdateProfileForm(request.POST, request.FILES, instance=request.user.profile)

        if user_form.is_valid() and profile_form.is_valid():
            user_form.save()
            profile_form.save()
            messages.success(request, 'Ваш профиль успешно обновлен')
            return redirect(to='users-profile')
    else:
        user_form = UpdateUserForm(instance=request.user)
        profile_form = UpdateProfileForm(instance=request.user.profile)

    return render(request, 'auth/profile.html', {'user_form': user_form, 'profile_form': profile_form})

class RegisterView(View):
    form_class = RegisterForm
    initial = {'key': 'value'}
    template_name = 'auth/register.html'

    def dispatch(self, request, *args, **kwargs):
        # will redirect to the home page if a user tries to access the register page while logged in
        if request.user.is_authenticated:
            return redirect(to='main')

        # else process dispatch as it otherwise normally would
        return super(RegisterView, self).dispatch(request, *args, **kwargs)


    def get(self, request, *args, **kwargs):
        # return redirect(to='login') # Blocking registration
        form = self.form_class(initial=self.initial)
        return render(request, self.template_name, {'form': form})

    def post(self, request, *args, **kwargs):
        # return redirect(to='login') # Blocking registration
        form = self.form_class(request.POST)

        if form.is_valid():
            form.save()

            username = form.cleaned_data.get('username')
            # email = form.cleaned_data.get('email')
            Users.objects.create(username=User.objects.get(username=username))
            # user.email = form.cleaned_data.get('email')
            # user.first_name = form.cleaned_data.get('first_name')
            # user.last_name = form.cleaned_data.get('last_name')
            # user.save()
            # Users.objects.create(email=User.objects.get(email=email))#, username = email)
            # messages.success(request, f'Аккаунт создан для {username}')
            # messages.success(request, f'Account for {username} created')

            return redirect(to='login')

        return render(request, self.template_name, {'form': form})

# Class based view that extends from the built in login view to add a remember me functionality
class CustomLoginView(LoginView):
    form_class = LoginForm

    def form_valid(self, form):
        remember_me = form.cleaned_data.get('remember_me')

        if not remember_me:
            # set session expiry to 0 seconds. So it will automatically close the session after the browser is closed.
            self.request.session.set_expiry(0)

            # Set session as modified to force data updates/cookie to be saved.
            self.request.session.modified = True

        # else browser session will be as long as the session cookie time "SESSION_COOKIE_AGE" defined in settings.py
        return super(CustomLoginView, self).form_valid(form)

class ResetPasswordView(SuccessMessageMixin, PasswordResetView):
    template_name = 'auth/password_reset.html'
    email_template_name = 'auth/password_reset_email.html'
    subject_template_name = 'auth/password_reset_subject'
    success_message = "We've emailed you instructions for setting your password, " \
                      "if an account exists with the email you entered. You should receive them shortly." \
                      " If you don't receive an email, " \
                      "please make sure you've entered the address you registered with, and check your spam folder."
    success_url = reverse_lazy('main')

class ChangePasswordView(SuccessMessageMixin, PasswordChangeView):
    template_name = 'auth/change_password.html'
    success_message = "Ваш пароль успешно изменен"
    success_url = reverse_lazy('main')
 
