"""
Endpoints for the IT support portal.

Everything here is restricted to IT support accounts and superusers, checked on
every request rather than trusted from the page that called it.

Figures that belong to parts of the system that do not exist yet — patient
files, prescriptions screened, workspace activity — are returned as
``{"available": false}`` with a reason. The portal draws an empty state for
those rather than a number nobody can justify, and they light up on their own
once the models behind them land.
"""

import json
import re
import secrets
from datetime import timedelta

from django.contrib.auth.password_validation import ValidationError as PasswordError
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.db.models import Count, Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from . import storage
from .models import ROLE_ID_PREFIX, ActivityLog, Role, SupportTicket, User, generate_user_id

# Roles a person may be given from this portal.
ASSIGNABLE_ROLES = {r.value for r in Role}

PASSWORD_WORDS = ["Safe", "Dose", "Care", "Script", "Ward", "Check", "Chart", "Round"]


# ---------------------------------------------------------------- guards

def may_manage(user):
    return bool(user.is_authenticated and (user.is_superuser or user.role == Role.IT_SUPPORT))


def _guard(request):
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Not signed in."}, status=401)
    if not may_manage(request.user):
        return JsonResponse({"detail": "This account cannot manage the system."}, status=403)
    return None


def _body(request):
    try:
        return json.loads(request.body or "{}"), None
    except json.JSONDecodeError:
        return None, JsonResponse({"detail": "Send the request as JSON."}, status=400)


# ---------------------------------------------------------------- shaping

def account_status(user):
    if not user.is_active:
        return "revoked"
    if user.last_login is None:
        return "pending"
    return "active"


def describe_account(user):
    return {
        "id": user.user_id,
        "name": user.full_name,
        "role": user.role,
        "role_label": user.get_role_display(),
        "facility": user.facility,
        "email": user.email,
        "phone": user.phone,
        "reg": user.registration_number,
        "status": account_status(user),
        "last_login": user.last_login.isoformat() if user.last_login else None,
        "date_joined": user.date_joined.isoformat() if user.date_joined else None,
        "must_change_password": user.must_change_password,
        "created_by": user.created_by.user_id if user.created_by else None,
        # The portal hides destructive actions on the account you are using.
        "is_self": False,
    }


def make_password():
    """
    Readable enough to dictate over a counter, long enough to pass the
    validators. The shortest word plus five digits plus the mark is ten
    characters, which is the minimum length Django is configured to accept.
    """
    return f"{secrets.choice(PASSWORD_WORDS)}{secrets.randbelow(90000) + 10000}!"


# ---------------------------------------------------------------- accounts

@require_GET
def list_accounts(request):
    blocked = _guard(request)
    if blocked:
        return blocked

    accounts = User.objects.select_related("created_by").all()

    role = (request.GET.get("role") or "").strip()
    if role in ASSIGNABLE_ROLES:
        accounts = accounts.filter(role=role)

    term = (request.GET.get("q") or "").strip()
    if term:
        accounts = accounts.filter(Q(user_id__icontains=term) | Q(full_name__icontains=term))

    results = []
    for account in accounts.order_by("role", "user_id"):
        shaped = describe_account(account)
        shaped["is_self"] = account.pk == request.user.pk
        results.append(shaped)

    return JsonResponse({"results": results, "count": len(results)})


@require_GET
def suggest_id(request):
    """A free staff ID for the role the portal is about to create."""
    blocked = _guard(request)
    if blocked:
        return blocked

    role = (request.GET.get("role") or "").strip()
    if role not in ASSIGNABLE_ROLES:
        return JsonResponse({"detail": "Pick a role first."}, status=400)

    facility_code = (request.GET.get("facility_code") or "DGMH").strip().upper()
    if not re.fullmatch(r"[A-Z]{2,8}", facility_code):
        facility_code = "DGMH"

    try:
        return JsonResponse({
            "user_id": generate_user_id(role, facility_code),
            "password": make_password(),
            "prefix": ROLE_ID_PREFIX.get(role, "ST"),
        })
    except RuntimeError:
        return JsonResponse(
            {"detail": "Could not find a free ID for that role. Try a different facility code."},
            status=409,
        )


@require_POST
def create_account(request):
    blocked = _guard(request)
    if blocked:
        return blocked

    data, error = _body(request)
    if error:
        return error

    name = (data.get("name") or "").strip()
    role = (data.get("role") or "").strip()
    user_id = (data.get("user_id") or "").strip().upper()
    password = data.get("password") or ""

    if not name:
        return JsonResponse({"detail": "Enter the person's full name."}, status=400)
    if role not in ASSIGNABLE_ROLES:
        return JsonResponse({"detail": "Choose a valid role."}, status=400)

    if not user_id:
        try:
            user_id = generate_user_id(role)
        except RuntimeError:
            return JsonResponse({"detail": "Could not generate a staff ID."}, status=409)

    if User.objects.filter(user_id=user_id).exists():
        return JsonResponse({"detail": f"{user_id} is already taken."}, status=409)

    if not password:
        password = make_password()

    try:
        validate_password(password)
    except PasswordError as error:
        return JsonResponse({"detail": " ".join(error.messages)}, status=400)

    fields = {
        "full_name": name,
        "role": role,
        "facility": (data.get("facility") or "").strip() or User._meta.get_field("facility").default,
        "email": (data.get("email") or "").strip(),
        "phone": (data.get("phone") or "").strip(),
        "registration_number": (data.get("reg") or "").strip(),
        "must_change_password": bool(data.get("must_change_password", True)),
        "created_by": request.user,
    }

    # IT support accounts also need Django admin access, since that is where
    # the system itself is administered.
    if role == Role.IT_SUPPORT:
        fields["is_staff"] = True

    try:
        account = User.objects.create_user(user_id=user_id, password=password, **fields)
    except ValidationError as error:
        messages = []
        for field, problems in getattr(error, "message_dict", {}).items():
            messages.extend(problems)
        return JsonResponse({"detail": " ".join(messages) or "That account could not be created."},
                            status=400)
    except IntegrityError:
        return JsonResponse({"detail": f"{user_id} is already taken."}, status=409)

    ActivityLog.record(
        ActivityLog.Action.ACCOUNT_CREATED, request.user, account.user_id,
        f"Issued {account.get_role_display()} account to {account.full_name}",
    )

    return JsonResponse({
        "account": describe_account(account),
        # Shown once, then never again.
        "credentials": {"user_id": account.user_id, "password": password},
    }, status=201)


@require_http_methods(["POST", "PATCH"])
def update_account(request, user_id):
    blocked = _guard(request)
    if blocked:
        return blocked

    account = User.objects.filter(user_id=user_id.upper()).first()
    if not account:
        return JsonResponse({"detail": "No account with that ID."}, status=404)

    data, error = _body(request)
    if error:
        return error

    changed = []

    if "name" in data:
        value = (data.get("name") or "").strip()
        if not value:
            return JsonResponse({"detail": "The name cannot be empty."}, status=400)
        if value != account.full_name:
            account.full_name = value
            changed.append("name")

    if "role" in data:
        role = (data.get("role") or "").strip()
        if role not in ASSIGNABLE_ROLES:
            return JsonResponse({"detail": "Choose a valid role."}, status=400)

        # Changing your own role out of IT support would lock you out of this
        # portal mid-session.
        if account.pk == request.user.pk and role != Role.IT_SUPPORT and not account.is_superuser:
            return JsonResponse(
                {"detail": "You cannot move your own account out of IT support while using it."},
                status=400,
            )

        if role != account.role:
            account.role = role
            account.is_staff = account.is_staff or role == Role.IT_SUPPORT
            changed.append("role")

    for key, field in [("facility", "facility"), ("email", "email"),
                       ("phone", "phone"), ("reg", "registration_number")]:
        if key in data:
            value = (data.get(key) or "").strip()
            if value != getattr(account, field):
                setattr(account, field, value)
                changed.append(key)

    if not changed:
        return JsonResponse({"account": describe_account(account), "changed": []})

    try:
        account.full_clean(exclude=["password", "last_login"])
    except ValidationError as error:
        messages = []
        for field, problems in getattr(error, "message_dict", {}).items():
            messages.extend(problems)
        return JsonResponse({"detail": " ".join(messages) or "Those details are not valid."},
                            status=400)

    account.save()

    ActivityLog.record(
        ActivityLog.Action.ACCOUNT_UPDATED, request.user, account.user_id,
        f"Updated {', '.join(changed)} for {account.full_name}",
    )

    return JsonResponse({"account": describe_account(account), "changed": changed})


@require_POST
def set_access(request, user_id):
    """Revoke or restore an account without deleting its history."""
    blocked = _guard(request)
    if blocked:
        return blocked

    account = User.objects.filter(user_id=user_id.upper()).first()
    if not account:
        return JsonResponse({"detail": "No account with that ID."}, status=404)

    data, error = _body(request)
    if error:
        return error

    active = bool(data.get("is_active"))

    if account.pk == request.user.pk and not active:
        return JsonResponse({"detail": "You cannot revoke your own access."}, status=400)

    # Losing the last way into this portal would mean a trip to the server.
    if not active and account.role == Role.IT_SUPPORT:
        remaining = User.objects.filter(
            Q(role=Role.IT_SUPPORT) | Q(is_superuser=True), is_active=True
        ).exclude(pk=account.pk).count()
        if remaining == 0:
            return JsonResponse(
                {"detail": "This is the last account that can manage the system. "
                           "Issue another one before revoking this."},
                status=400,
            )

    account.is_active = active
    account.save(update_fields=["is_active"])

    ActivityLog.record(
        ActivityLog.Action.ACCOUNT_RESTORED if active else ActivityLog.Action.ACCOUNT_REVOKED,
        request.user, account.user_id,
        f"{'Restored' if active else 'Revoked'} access for {account.full_name}",
    )

    return JsonResponse({"account": describe_account(account)})


@require_POST
def reset_password(request, user_id):
    blocked = _guard(request)
    if blocked:
        return blocked

    account = User.objects.filter(user_id=user_id.upper()).first()
    if not account:
        return JsonResponse({"detail": "No account with that ID."}, status=404)

    data, error = _body(request)
    if error:
        return error

    password = (data.get("password") or "").strip() or make_password()

    try:
        validate_password(password, user=account)
    except PasswordError as problem:
        return JsonResponse({"detail": " ".join(problem.messages)}, status=400)

    account.set_password(password)
    account.must_change_password = True
    account.save(update_fields=["password", "must_change_password"])

    ActivityLog.record(
        ActivityLog.Action.PASSWORD_RESET, request.user, account.user_id,
        f"Issued a new password for {account.full_name}",
    )

    return JsonResponse({
        "account": describe_account(account),
        "credentials": {"user_id": account.user_id, "password": password},
    })


@require_http_methods(["POST", "DELETE"])
def delete_account(request, user_id):
    """
    Permanent deletion.

    Revoking is almost always the right action instead, so the portal asks
    twice and this refuses the cases that would cause real damage.
    """
    blocked = _guard(request)
    if blocked:
        return blocked

    account = User.objects.filter(user_id=user_id.upper()).first()
    if not account:
        return JsonResponse({"detail": "No account with that ID."}, status=404)

    if account.pk == request.user.pk:
        return JsonResponse({"detail": "You cannot delete the account you are signed in with."},
                            status=400)

    if account.is_superuser:
        return JsonResponse({"detail": "Superuser accounts are deleted from the server, not here."},
                            status=400)

    label = f"{account.user_id} ({account.full_name})"
    account.delete()

    ActivityLog.record(
        ActivityLog.Action.ACCOUNT_DELETED, request.user, user_id.upper(),
        f"Deleted {label}",
    )

    return JsonResponse({"detail": f"{label} deleted."})


# ---------------------------------------------------------------- overview

def _not_yet(reason):
    return {"available": False, "detail": reason}


@require_GET
def overview(request):
    """Everything the Home panel draws, in one request."""
    blocked = _guard(request)
    if blocked:
        return blocked

    accounts = User.objects.all()
    today = timezone.localtime().date()

    by_role = {
        row["role"]: row["total"]
        for row in accounts.filter(is_active=True).values("role").annotate(total=Count("id"))
    }

    total = accounts.count()
    active = accounts.filter(is_active=True).count()
    revoked = total - active
    pending = accounts.filter(is_active=True, last_login__isnull=True).count()
    signed_in_today = accounts.filter(last_login__date=today).count()

    week_ago = timezone.now() - timedelta(days=7)
    failed_week = ActivityLog.objects.filter(
        action=ActivityLog.Action.LOGIN_FAILED, happened_at__gte=timezone.now() - timedelta(days=1)
    ).count()

    return JsonResponse({
        "accounts": {
            "total": total,
            "active": active,
            "revoked": revoked,
            "pending": pending,
            "signed_in_today": signed_in_today,
            "added_this_week": accounts.filter(date_joined__gte=week_ago).count(),
            "by_role": [
                {"role": role, "label": dict(Role.choices).get(role, role), "count": count}
                for role, count in sorted(by_role.items(), key=lambda item: -item[1])
            ],
        },

        "storage": storage.usage(),

        # These belong to sections that are not built yet. They are reported as
        # unavailable rather than zero, because zero reads as a fact.
        "patient_files": _not_yet("Patient files arrive once the admin workspace is connected."),
        "screening": _not_yet("Prescription screening counts arrive with the doctor workspace."),
        "daily_activity": _not_yet("Daily activity arrives once prescriptions are recorded."),
        "workspace_use": _not_yet("Workspace use arrives once sign-ins are recorded per section."),

        "support": {
            "open": SupportTicket.objects.filter(status=SupportTicket.Status.OPEN).count(),
            "closed": SupportTicket.objects.filter(status=SupportTicket.Status.CLOSED).count(),
        },

        "health": _health(failed_week),
        "generated_at": timezone.now().isoformat(),
    })


def _health(failed_signins):
    """Checks that are real now, rather than a hardcoded list of green ticks."""
    from django.db import connection

    checks = []

    try:
        connection.ensure_connection()
        checks.append({"label": "Database", "value": "Connected", "ok": True})
    except Exception:
        checks.append({"label": "Database", "value": "Unreachable", "ok": False})

    try:
        from . import ddi
        if ddi.is_ready():
            checks.append({"label": "Interaction models", "value": "Installed", "ok": True})
        else:
            checks.append({"label": "Interaction models", "value": "Missing", "ok": False})
    except Exception:
        checks.append({"label": "Interaction models", "value": "Not loaded", "ok": False})

    space = storage.usage()
    if not space.get("configured"):
        checks.append({"label": "Cloudinary", "value": "Not configured", "ok": False})
    elif not space.get("available"):
        checks.append({"label": "Cloudinary", "value": "Unreachable", "ok": False})
    else:
        checks.append({"label": "Cloudinary", "value": space.get("plan") or "Connected", "ok": True})

    checks.append({
        "label": "Failed sign-ins (24h)",
        "value": str(failed_signins),
        "ok": failed_signins < 10,
    })

    return checks


@require_GET
def activity(request):
    blocked = _guard(request)
    if blocked:
        return blocked

    try:
        limit = min(max(int(request.GET.get("limit", 30)), 1), 200)
    except ValueError:
        limit = 30

    entries = ActivityLog.objects.select_related("actor")[:limit]

    return JsonResponse({"results": [
        {
            "action": entry.action,
            "label": entry.get_action_display(),
            "actor": entry.actor.user_id if entry.actor else None,
            "actor_name": entry.actor.full_name if entry.actor else None,
            "subject": entry.subject_user_id,
            "detail": entry.detail,
            "at": entry.happened_at.isoformat(),
        }
        for entry in entries
    ]})


# ---------------------------------------------------------------- support

@require_GET
def list_tickets(request):
    blocked = _guard(request)
    if blocked:
        return blocked

    tickets = SupportTicket.objects.select_related("raised_by", "closed_by").all()

    status = (request.GET.get("status") or "").strip()
    if status in {SupportTicket.Status.OPEN, SupportTicket.Status.CLOSED}:
        tickets = tickets.filter(status=status)

    return JsonResponse({"results": [
        {
            "id": ticket.pk,
            "subject": ticket.subject,
            "body": ticket.body,
            "status": ticket.status,
            "workspace": ticket.workspace,
            "workspace_label": dict(Role.choices).get(ticket.workspace, ""),
            "raised_by": ticket.raised_by_id_text,
            "raised_by_name": ticket.raised_by_name,
            "created_at": ticket.created_at.isoformat(),
            "closed_at": ticket.closed_at.isoformat() if ticket.closed_at else None,
            "closed_by": ticket.closed_by.user_id if ticket.closed_by else None,
            "resolution": ticket.resolution,
        }
        for ticket in tickets[:200]
    ]})


@require_POST
def set_ticket_status(request, ticket_id):
    blocked = _guard(request)
    if blocked:
        return blocked

    ticket = SupportTicket.objects.filter(pk=ticket_id).first()
    if not ticket:
        return JsonResponse({"detail": "No support request with that number."}, status=404)

    data, error = _body(request)
    if error:
        return error

    close = (data.get("status") or "").strip() != SupportTicket.Status.OPEN

    if close:
        ticket.status = SupportTicket.Status.CLOSED
        ticket.closed_at = timezone.now()
        ticket.closed_by = request.user
        ticket.resolution = (data.get("resolution") or "").strip()[:2000]
    else:
        ticket.status = SupportTicket.Status.OPEN
        ticket.closed_at = None
        ticket.closed_by = None

    ticket.save()

    ActivityLog.record(
        ActivityLog.Action.TICKET_CLOSED if close else ActivityLog.Action.TICKET_REOPENED,
        request.user, ticket.raised_by_id_text,
        f"{'Closed' if close else 'Reopened'}: {ticket.subject}",
    )

    return JsonResponse({"id": ticket.pk, "status": ticket.status})


@require_POST
def raise_ticket(request):
    """
    Open to any signed-in account.

    This is the hook the other workspaces use for their support section; they
    post here and the message appears in the portal. Nothing else is needed on
    their side beyond a form.
    """
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Not signed in."}, status=401)

    data, error = _body(request)
    if error:
        return error

    subject = (data.get("subject") or "").strip()
    body = (data.get("body") or "").strip()

    if not subject or not body:
        return JsonResponse({"detail": "A subject and a message are both needed."}, status=400)

    ticket = SupportTicket.objects.create(
        raised_by=request.user,
        raised_by_name=request.user.full_name,
        raised_by_id_text=request.user.user_id,
        workspace=request.user.role,
        subject=subject[:160],
        body=body[:4000],
    )

    return JsonResponse({"id": ticket.pk, "detail": "Sent to IT support."}, status=201)