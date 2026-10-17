"""
Proving the person at the counter is the person on the script.

The pharmacist presses Dispense and a code goes up on the counter screen. The
patient opens the link from their email and either scans that code or reads
their own code out to be typed in. Either way the server is checking the same
thing: do these two halves belong to the same prescription?

Two of these endpoints are open to anybody with the link — the patient has no
account, and the token in the URL is what stands in for one. They are written
accordingly: constant-time comparison, a cap on attempts, short expiry, and
nothing about the patient returned until the link itself checks out.
"""

import io
import json
import secrets

from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from . import mailer
from .models import Collection, MAX_ATTEMPTS, Prescription, Role


# ---------------------------------------------------------------- guards

def may_dispense(user):
    return bool(user.is_authenticated and (user.is_superuser or user.role == Role.PHARMACIST))


def _staff_guard(request):
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Not signed in."}, status=401)
    if not may_dispense(request.user):
        return JsonResponse({"detail": "This account cannot hand medicine over."}, status=403)
    return None


def _body(request):
    try:
        return json.loads(request.body or "{}"), None
    except json.JSONDecodeError:
        return None, JsonResponse({"detail": "Send the request as JSON."}, status=400)


def _same(a, b):
    """Constant time, so a wrong code cannot be found a character at a time."""
    return secrets.compare_digest(str(a or ""), str(b or ""))


# ---------------------------------------------------------------- the code picture

def qr_svg(payload):
    """
    The code as an SVG, drawn on the server.

    SVG rather than a PNG so it scales to whatever the counter screen is, and
    so no image library is needed.
    """
    import qrcode
    import qrcode.image.svg

    maker = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    maker.add_data(payload)
    maker.make(fit=True)

    image = maker.make_image(image_factory=qrcode.image.svg.SvgPathImage)
    buffer = io.BytesIO()
    image.save(buffer)
    return buffer.getvalue().decode()


def scan_payload(collection):
    """What the QR actually carries: where to send it, and the one-use token."""
    return f"{mailer.collection_link(collection)}confirm/{collection.qr_token}/"


# ---------------------------------------------------------------- shaping

def describe(collection, include_code=False):
    """
    What the pharmacy may see.

    The patient's own code is not in here by default. The whole point is that
    the pharmacist asks for it rather than reads it off their own screen.
    """
    data = {
        "status": collection.status,
        "status_label": collection.get_status_display(),
        "armed": collection.is_armed,
        "seconds_left": collection.seconds_left,
        "attempts": collection.attempts,
        "attempts_left": max(MAX_ATTEMPTS - collection.attempts, 0),
        "arm_count": collection.arm_count,
        "emailed": bool(collection.sent_at),
        "sent_to": collection.sent_to,
        "send_error": collection.send_error,
        "confirmed_at": collection.confirmed_at.isoformat() if collection.confirmed_at else None,
        "confirmed_by": collection.confirmed_by,
    }

    if include_code:
        data["code"] = collection.code

    return data


# ======================================================================
# The counter
# ======================================================================

@require_POST
def arm(request, reference):
    """
    Press Dispense: put a fresh code on the counter screen.

    Every call mints a new token and kills the last one, so a code somebody
    photographed on a previous patient's turn is already worthless.
    """
    blocked = _staff_guard(request)
    if blocked:
        return blocked

    with transaction.atomic():
        script = (
            Prescription.objects
            .select_for_update()
            .filter(reference=reference.strip().upper())
            .first()
        )
        if not script:
            return JsonResponse({"detail": "No prescription with that reference."}, status=404)

        if script.status != Prescription.Status.WAITING:
            return JsonResponse({
                "detail": f"This script was already {script.get_status_display().lower()}.",
            }, status=409)

        collection = getattr(script, "collection", None)
        if collection is None:
            return JsonResponse({
                "detail": "This script has no collection code. It was written before "
                          "collection codes were switched on.",
                "no_collection": True,
            }, status=409)

        if collection.status == Collection.Status.COLLECTED:
            return JsonResponse({"detail": "This patient has already confirmed."}, status=409)

        collection.arm(request.user)

    return JsonResponse({
        "collection": describe(collection),
        "qr": qr_svg(scan_payload(collection)),
        "expires_in": collection.seconds_left,
    })


@require_POST
def stand_down(request, reference):
    """The patient walked away. Drop the code so it cannot be used later."""
    blocked = _staff_guard(request)
    if blocked:
        return blocked

    script = Prescription.objects.filter(reference=reference.strip().upper()).first()
    if not script or not getattr(script, "collection", None):
        return JsonResponse({"detail": "No prescription with that reference."}, status=404)

    collection = script.collection
    if collection.status == Collection.Status.ARMED:
        collection.stand_down()

    return JsonResponse({"collection": describe(collection)})


@require_GET
def state(request, reference):
    """
    Polled by the pharmacy page while a code is up, so the counter sees the
    patient confirm without anybody pressing anything.
    """
    blocked = _staff_guard(request)
    if blocked:
        return blocked

    script = Prescription.objects.filter(reference=reference.strip().upper()).first()
    if not script:
        return JsonResponse({"detail": "No prescription with that reference."}, status=404)

    collection = getattr(script, "collection", None)
    if collection is None:
        return JsonResponse({"collection": None, "no_collection": True, "status": script.status})

    # An armed code that has run out of time is said to be expired rather than
    # left looking live on the counter screen.
    if collection.status == Collection.Status.ARMED and not collection.is_armed:
        collection.stand_down(Collection.Status.EXPIRED)

    return JsonResponse({"collection": describe(collection), "status": script.status})


@require_POST
def confirm_by_code(request, reference):
    """
    The patient read their code out and the pharmacist typed it in.

    The same check as a scan, just arriving by a different route — this is the
    path for a phone that cannot scan, or a patient who never got the email.
    """
    blocked = _staff_guard(request)
    if blocked:
        return blocked

    data, bad = _body(request)
    if bad:
        return bad

    typed = str(data.get("code") or "").strip().upper().replace(" ", "")

    with transaction.atomic():
        script = (
            Prescription.objects
            .select_for_update()
            .filter(reference=reference.strip().upper())
            .first()
        )
        if not script:
            return JsonResponse({"detail": "No prescription with that reference."}, status=404)

        collection = getattr(script, "collection", None)
        if collection is None:
            return JsonResponse({"detail": "This script has no collection code."}, status=409)

        problem = _check_armed(collection)
        if problem:
            return problem

        if not _same(typed, collection.code):
            collection.attempts += 1
            collection.save(update_fields=["attempts"])

            left = max(MAX_ATTEMPTS - collection.attempts, 0)
            if left == 0:
                collection.stand_down()
                return JsonResponse({
                    "detail": "Too many wrong codes. The code has been cleared — press "
                              "Dispense again to show a new one.",
                    "collection": describe(collection),
                }, status=429)

            return JsonResponse({
                "detail": f"That code does not match. {left} "
                          f"{'try' if left == 1 else 'tries'} left.",
                "collection": describe(collection),
            }, status=400)

        collection.consume("code")

    return JsonResponse({"collection": describe(collection), "confirmed": True})


def _check_armed(collection):
    """Shared by both routes in, so they cannot drift apart."""
    if collection.status == Collection.Status.COLLECTED:
        return JsonResponse({"detail": "This patient has already confirmed."}, status=409)

    if collection.status != Collection.Status.ARMED:
        return JsonResponse({
            "detail": "No code is showing. Press Dispense to put one on the screen.",
        }, status=409)

    if not collection.is_armed:
        collection.stand_down(Collection.Status.EXPIRED)
        return JsonResponse({
            "detail": "That code has expired. Press Dispense again for a new one.",
        }, status=410)

    return None


# ======================================================================
# The patient
#
# No account, no session. The token in the link is the whole credential, so
# these are the endpoints that get the careful treatment.
# ======================================================================

def collect_page(request, link_token, qr_token=None):
    """
    The page the patient opens from their email.

    The same view answers the scanned address, so a patient who uses their
    phone's own camera app instead of the page's scanner lands somewhere
    useful rather than on an error. The page reads the token out of the
    address and confirms with it.
    """
    return render(request, "collect/collect.html")


@require_GET
def collect_state(request, link_token):
    """
    What the patient's page shows: their own script, and whether the counter
    is currently asking them to confirm.
    """
    collection = Collection.objects.filter(link_token=link_token).select_related(
        "prescription"
    ).first()

    # One message for a link that never existed and one that was tampered
    # with, so this cannot be used to find out which tokens are real.
    if not collection:
        return JsonResponse({"detail": "This link is not valid."}, status=404)

    script = collection.prescription

    if collection.status == Collection.Status.ARMED and not collection.is_armed:
        collection.stand_down(Collection.Status.EXPIRED)

    return JsonResponse({
        "patient": script.patient_name,
        "reference": script.reference,
        "prescriber": script.prescriber_name,
        "created_at": script.created_at.isoformat(),
        "items": [
            {
                "drug": item.drug,
                "dose": item.dose,
                "frequency": item.frequency,
                "quantity": item.quantity,
            }
            for item in script.items.all()
        ],
        "code": collection.code,
        "status": collection.status,
        "armed": collection.is_armed,
        "prescription_status": script.status,
        "collected_at": collection.confirmed_at.isoformat() if collection.confirmed_at else None,
    })


# The patient has no account and no session, so there is no CSRF cookie for
# them to send back. CSRF protects a browser from being made to use a session
# it already holds; there is no session here, and nothing is taken on trust
# from the request beyond the two tokens, both of which are checked against
# the database. Guessing either is the only way in, and both are 32 random
# bytes.
@csrf_exempt
@require_POST
def confirm_by_scan(request, link_token, qr_token):
    """
    The patient scanned the code on the counter screen.

    This is the whole mechanism in one check: the link token says who the
    patient is, the scanned token says which counter and which moment, and
    the collection only goes through if both name the same script.
    """
    with transaction.atomic():
        collection = (
            Collection.objects
            .select_for_update()
            .filter(link_token=link_token)
            .select_related("prescription")
            .first()
        )

        if not collection:
            return JsonResponse({"detail": "This link is not valid."}, status=404)

        problem = _check_armed(collection)
        if problem:
            return problem

        # The two halves have to be the same collection. A code scanned off
        # somebody else's screen fails here, which is the point.
        if not _same(qr_token, collection.qr_token):
            collection.attempts += 1
            collection.save(update_fields=["attempts"])
            return JsonResponse({
                "detail": "That code belongs to a different prescription. Ask the "
                          "pharmacist to show yours.",
            }, status=400)

        collection.consume("scan")

    return JsonResponse({
        "confirmed": True,
        "reference": collection.prescription.reference,
        "patient": collection.prescription.patient_name,
    })