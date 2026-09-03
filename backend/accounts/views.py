"""
Serves the workspace pages.

Every page checks the session before rendering, so typing a workspace URL
directly gets you nowhere without the right role. The frontend does its own
check as well, but only so the browser is not left on a dead page — this is
the one that counts.
"""

from django.shortcuts import redirect, render

from .api import can_manage
from .models import Role

LOGIN_URL = "/login/"
MANAGEMENT_LOGIN_URL = "/management/login/"


def _guard(request, role):
    """Returns a redirect when this user may not open the page, else None."""
    if not request.user.is_authenticated:
        return redirect(LOGIN_URL)
    if request.user.role != role and not request.user.is_superuser:
        # Signed in, but this is somebody else's workspace.
        return redirect(request.user.workspace_url)
    return None


# ---------------------------------------------------------------- public

def landing(request):
    """The public site, including the sign-in panel."""
    return render(request, "index.html")


def login_page(request):
    if request.user.is_authenticated:
        return redirect(request.user.workspace_url)
    return render(request, "index.html")


# ---------------------------------------------------------------- workspaces

def admin_workspace(request):
    blocked = _guard(request, Role.ADMIN)
    return blocked or render(request, "admin/admin.html")


def staff_workspace(request):
    blocked = _guard(request, Role.DOCTOR)
    return blocked or render(request, "staff/staff.html")


def pharmacy_workspace(request):
    blocked = _guard(request, Role.PHARMACIST)
    return blocked or render(request, "pharmacy/pharmacy.html")


def research_workspace(request):
    blocked = _guard(request, Role.RESEARCHER)
    return blocked or render(request, "research/research.html")


# ---------------------------------------------------------------- management

def management_login(request):
    if request.user.is_authenticated and can_manage(request.user):
        return redirect("/management/")
    return render(request, "management/management_login.html")


def management_portal(request):
    if not request.user.is_authenticated or not can_manage(request.user):
        return redirect(MANAGEMENT_LOGIN_URL)
    return render(request, "management/management.html")