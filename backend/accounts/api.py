"""
Sign-in endpoints used by the login pages.

Everything is checked here rather than in the browser: whether the password
is right, whether the account is still active, and whether it is allowed to
reach the portal it asked for.
"""

import json

from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from .models import Role

# Who may open the management portal.
MANAGEMENT_ROLES = {Role.IT_SUPPORT}


def can_manage(user):
    return bool(user.is_superuser or user.role in MANAGEMENT_ROLES)


def describe(user):
    return {
        "user_id": user.user_id,
        "full_name": user.full_name,
        "role": user.role,
        "role_label": user.get_role_display(),
        "facility": user.facility,
        "must_change_password": user.must_change_password,
        "can_manage": can_manage(user),
        "redirect": "/management/" if can_manage(user) else user.workspace_url,
    }


@require_GET
@ensure_csrf_cookie
def csrf(request):
    """Called before the first POST so the browser has a CSRF cookie."""
    return JsonResponse({"detail": "ok"})


@require_POST
def login_view(request):
    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "Send the request as JSON."}, status=400)

    user_id = (payload.get("user_id") or "").strip().upper()
    password = payload.get("password") or ""
    scope = payload.get("scope") or ""
    expected_role = payload.get("expected_role") or ""

    if not user_id or not password:
        return JsonResponse({"detail": "Enter your ID and password."}, status=400)

    user = authenticate(request, user_id=user_id, password=password)

    # One message for a wrong ID and a wrong password, so nobody can use this
    # endpoint to work out which staff IDs exist.
    if user is None:
        return JsonResponse(
            {"detail": "Those details did not work. Check the ID and try again."},
            status=401,
        )

    if not user.is_active:
        return JsonResponse(
            {"detail": "This account has been revoked. Speak to IT support."},
            status=403,
        )

    if scope == "management" and not can_manage(user):
        return JsonResponse(
            {"detail": "This account cannot open the management portal."},
            status=403,
        )

    # The login page asks people to pick a role first, so say plainly when the
    # credentials are fine but the wrong block was chosen.
    if expected_role and user.role != expected_role and not user.is_superuser:
        return JsonResponse(
            {
                "detail": f"That is a {user.get_role_display().lower()} account. "
                          f"Choose the {user.get_role_display()} option instead."
            },
            status=403,
        )

    login(request, user)
    return JsonResponse(describe(user))


@require_POST
def logout_view(request):
    logout(request)
    return JsonResponse({"detail": "signed out"})


@require_GET
def me(request):
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Not signed in."}, status=401)
    return JsonResponse(describe(request.user))