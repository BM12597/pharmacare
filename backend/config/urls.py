"""Root URL configuration for PharmaCare+."""

from django.contrib import admin
from django.urls import include, path

from accounts import views as account_views

urlpatterns = [
    # Sign-in endpoints used by the login pages.
    path("api/auth/", include("accounts.urls")),

    # Public site and sign in.
    path("", account_views.landing, name="landing"),
    path("login/", account_views.login_page, name="login"),

    # Role workspaces. Each one turns away anybody with the wrong role.
    path("admin/", account_views.admin_workspace, name="admin-workspace"),
    path("staff/", account_views.staff_workspace, name="staff-workspace"),
    path("pharmacy/", account_views.pharmacy_workspace, name="pharmacy-workspace"),
    path("research/", account_views.research_workspace, name="research-workspace"),

    # IT support portal.
    path("management/login/", account_views.management_login, name="management-login"),
    path("management/", account_views.management_portal, name="management-portal"),

    # Django's own admin, moved aside so /admin/ can be the admin workspace.
    path("django-admin/", admin.site.urls),
]