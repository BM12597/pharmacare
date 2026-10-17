"""
Pharmacy stock: what is on the shelf, and ordering more of it.

The level is a real number in the database rather than a figure on a page, so
the same number is seen by the pharmacist ordering, the pharmacist dispensing,
and the doctor looking for a medicine that can actually be handed over.

Every change writes a movement saying who, when and why. A level that drops by
sixty should be explainable without asking anybody.
"""

import json

from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from .models import MAX_STOCK_LEVEL, Role, StockItem, StockMovement

# Who may look, and who may move the numbers.
VIEW_ROLES = {Role.PHARMACIST, Role.DOCTOR, Role.ADMIN}
ORDER_ROLES = {Role.PHARMACIST}


def may_view(user):
    return bool(user.is_authenticated and (user.is_superuser or user.role in VIEW_ROLES))


def may_order(user):
    return bool(user.is_authenticated and (user.is_superuser or user.role in ORDER_ROLES))


def _guard(request, check=may_view, what="see the stock list"):
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Not signed in."}, status=401)
    if not check(request.user):
        return JsonResponse({"detail": f"This account cannot {what}."}, status=403)
    return None


def describe(item):
    return {
        "id": item.id,
        "drug": item.drug,
        "form": item.form,
        "label": f"{item.drug} {item.form}".strip(),
        "level": item.level,
        "reorder_at": item.reorder_at,
        "status": item.status,
        "max": MAX_STOCK_LEVEL,
        # How much more will fit, so the stepper can stop the person at the
        # ceiling rather than letting them order what cannot be kept.
        "headroom": item.headroom,
        "updated_at": item.updated_at.isoformat(),
        "updated_by": item.updated_by.full_name if item.updated_by else None,
    }


@require_GET
def list_stock(request):
    """Everything on the shelf. The doctor's medicine list reads this too."""
    blocked = _guard(request)
    if blocked:
        return blocked

    items = StockItem.objects.filter(is_active=True).select_related("updated_by")
    rows = [describe(item) for item in items]

    return JsonResponse({
        "results": rows,
        "max": MAX_STOCK_LEVEL,
        "counts": {
            "total": len(rows),
            "low": sum(1 for row in rows if row["status"] == "low"),
            "out": sum(1 for row in rows if row["status"] == "out"),
        },
        "can_order": may_order(request.user),
    })


@require_POST
def reorder(request, item_id):
    """
    Order more of one item.

    The level is capped, so an order for more than will fit tops the shelf up
    and says what actually went on rather than silently keeping a number it
    cannot hold.
    """
    blocked = _guard(request, may_order, "order stock")
    if blocked:
        return blocked

    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "Send the request as JSON."}, status=400)

    try:
        amount = int(data.get("amount", 0))
    except (TypeError, ValueError):
        return JsonResponse({"detail": "That is not a number."}, status=400)

    if amount <= 0:
        return JsonResponse({"detail": "Enter how many units to order."}, status=400)
    if amount > MAX_STOCK_LEVEL:
        return JsonResponse(
            {"detail": f"{MAX_STOCK_LEVEL} is the most this shelf can hold."}, status=400
        )

    with transaction.atomic():
        # Locked, because two pharmacists ordering the same item at the same
        # moment must not both read the old level.
        item = StockItem.objects.select_for_update().filter(id=item_id, is_active=True).first()
        if not item:
            return JsonResponse({"detail": "No such item."}, status=404)

        if item.headroom == 0:
            return JsonResponse({
                "item": describe(item),
                "ordered": 0,
                "detail": f"{item.drug} is already at {MAX_STOCK_LEVEL}, which is full.",
            }, status=409)

        movement = item.apply(
            amount,
            StockMovement.Reason.ORDER,
            user=request.user,
            note=f"Ordered {amount}",
        )

    added = movement.change if movement else 0

    detail = ""
    if added < amount:
        detail = (
            f"Only {added} would fit. {item.drug} is now at the {MAX_STOCK_LEVEL} ceiling."
        )

    return JsonResponse({
        "item": describe(item),
        "ordered": added,
        "requested": amount,
        "detail": detail,
    })


@require_GET
def movements(request, item_id):
    """Why this level is what it is."""
    blocked = _guard(request)
    if blocked:
        return blocked

    item = StockItem.objects.filter(id=item_id).first()
    if not item:
        return JsonResponse({"detail": "No such item."}, status=404)

    rows = item.movements.all()[:40]

    return JsonResponse({
        "item": describe(item),
        "results": [
            {
                "change": row.change,
                "level_after": row.level_after,
                "reason": row.reason,
                "reason_label": row.get_reason_display(),
                "note": row.note,
                "at": row.moved_at.isoformat(),
                "by": row.moved_by_name or "—",
            }
            for row in rows
        ],
    })