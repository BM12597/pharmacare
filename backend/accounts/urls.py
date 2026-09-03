from django.urls import path

from . import api

app_name = "accounts"

urlpatterns = [
    path("csrf/", api.csrf, name="csrf"),
    path("login/", api.login_view, name="login"),
    path("logout/", api.logout_view, name="logout"),
    path("me/", api.me, name="me"),
]