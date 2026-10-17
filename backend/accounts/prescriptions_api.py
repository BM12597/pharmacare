"""
Prescriptions: written by a doctor, graded here, read by a pharmacist,
dispensed off the shelf.

Two things in this module are deliberate.

The screening is run **on the server** when the script is sent, not taken from
whatever the browser said. A page can be stale, or edited. What gets stored as
the severity, and what the pharmacist reads, is this module's own verdict on
the drugs as submitted.

Dispensing moves real stock inside a transaction. The shelf is locked while it
happens, so two pharmacists dispensing at the same moment cannot both read the
same level and take it twice.
"""

import json

from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from . import ddi, mailer, review
from .models import (
    ActivityLog,
    Collection,
    Patient,
    Prescription,
    PrescriptionItem,
    Role,
    StockItem,
    StockMovement,
    generate_reference,
)

MAX_ITEMS = 25

SEVERITY_ORDER = {"severe": 0, "moderate": 1, "mild": 2, "unknown": 3, "clear": 4}


# ---------------------------------------------------------------- guards

def may_prescribe(user):
    return bool(user.is_authenticated and (user.is_superuser or user.role == Role.DOCTOR))


def may_dispense(user):
    return bool(user.is_authenticated and (user.is_superuser or user.role == Role.PHARMACIST))


def may_view(user):
    return bool(user.is_authenticated and (
        user.is_superuser or user.role in {Role.DOCTOR, Role.PHARMACIST, Role.ADMIN}
    ))


def _guard(request, check=may_view, what="see prescriptions"):
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Not signed in."}, status=401)
    if not check(request.user):
        return JsonResponse({"detail": f"This account cannot {what}."}, status=403)
    return None


def _body(request):
    try:
        return json.loads(request.body or "{}"), None
    except json.JSONDecodeError:
        return None, JsonResponse({"detail": "Send the request as JSON."}, status=400)


# ======================================================================
# Grading a script
#
# Three checks, and they answer different questions:
#
#   allergies    against what is on the patient file
#   conditions   a drug that is wrong for something the patient has
#   drug pairs   the trained model, which is the part that needs the .pkl files
#
# The first two are rules and always run. The third needs the model installed,
# and when it is not there the script still saves — it is marked as not fully
# screened rather than being quietly called clear.
# ======================================================================

# Spelled out rather than inferred, because an allergy is not always named the
# same way as the drug that would trigger it.
ALLERGY_FAMILIES = {
    "penicillin": ["amoxicillin", "ampicillin", "benzylpenicillin", "flucloxacillin", "penicillin"],
    "sulfa": ["sulfamethoxazole", "co-trimoxazole", "sulfasalazine", "furosemide"],
    "sulfa drugs": ["sulfamethoxazole", "co-trimoxazole", "sulfasalazine", "furosemide"],
    "aspirin": ["aspirin", "acetylsalicylic acid", "disprin"],
    "nsaid": ["ibuprofen", "diclofenac", "naproxen", "aspirin", "indomethacin"],
    "nsaids": ["ibuprofen", "diclofenac", "naproxen", "aspirin", "indomethacin"],
}

CONDITION_RULES = [
    {
        "drug": "metformin", "condition": "chronic kidney disease", "severity": "severe",
        "what": "Metformin builds up when kidney function is reduced, risking lactic acidosis.",
        "action": "Cap at 1 g daily and recheck eGFR, or switch to insulin alone.",
    },
    {
        "drug": "ibuprofen", "condition": "chronic kidney disease", "severity": "severe",
        "what": "Anti-inflammatories can worsen kidney function further.",
        "action": "Use paracetamol instead.",
    },
    {
        "drug": "prednisone", "condition": "diabetes", "severity": "moderate",
        "what": "Steroids push blood glucose up, often sharply.",
        "action": "Warn the patient and increase glucose monitoring for the course.",
    },
    {
        "drug": "ibuprofen", "condition": "hypertension", "severity": "moderate",
        "what": "Anti-inflammatories blunt the effect of blood pressure treatment.",
        "action": "Use paracetamol where it will do the job.",
    },
]


def _worst(severities):
    present = [s for s in severities if s in SEVERITY_ORDER]
    if not present:
        return "clear"
    return min(present, key=lambda s: SEVERITY_ORDER[s])


def _allergy_findings(drugs, allergies):
    findings = []

    for allergy in allergies or []:
        needle = str(allergy).strip().lower()
        if not needle:
            continue

        # The family list first, then a plain name match, so "Penicillin" on
        # the file catches amoxicillin on the script.
        family = []
        for key, members in ALLERGY_FAMILIES.items():
            if key in needle:
                family = members
                break

        for drug in drugs:
            name = drug.lower()
            hit = (
                any(member in name for member in family)
                or needle.split()[0] in name
                or name in needle
            )
            if hit:
                findings.append({
                    "kind": "allergy",
                    "title": f"Allergy: {drug}",
                    "severity": "severe",
                    "what": f"The file records an allergy to {allergy}.",
                    "action": "Choose a different class of medicine.",
                    "drugs": [drug],
                })

    return findings


def _condition_findings(drugs, conditions):
    findings = []
    recorded = [str(c) for c in conditions or []]

    for rule in CONDITION_RULES:
        on_script = [d for d in drugs if d.lower().startswith(rule["drug"])]
        if not on_script:
            continue

        # Echoed back in the file's own wording rather than the rule's, so the
        # doctor reads the condition as they wrote it.
        matched = next(
            (condition for condition in recorded if rule["condition"] in condition.lower()),
            None,
        )
        if matched is None:
            continue

        findings.append({
            "kind": "condition",
            "title": f"{on_script[0]} + {matched}",
            "severity": rule["severity"],
            "what": rule["what"],
            "action": rule["action"],
            "drugs": [on_script[0]],
        })

    return findings


def grade(drugs, patient=None, user=None, context=""):
    """
    What is wrong with this combination, as far as this server can tell.

    Always returns a verdict. When the trained model is not installed the
    drug-pair half is missing and that is said plainly — never treated as
    nothing found.
    """
    findings = []
    notes = []

    if patient is not None:
        findings += _allergy_findings(drugs, patient.allergies)
        findings += _condition_findings(drugs, patient.conditions)

        # What the patient is already on counts as part of the combination.
        existing = [name for name in patient.medication_names if name not in drugs]
    else:
        existing = []
        notes.append("No patient file was loaded, so only the drugs on the script were checked.")

    model_available = ddi.is_ready()
    pairs = {}

    if model_available and len(drugs) + len(existing) >= 2:
        try:
            # Screened, then anything a reviewer has already decided is
            # applied, then anything still uncertain is queued for review.
            pairs = review.screen_and_review(
                drugs + existing, user=user, context=context
            )
            for found in pairs.get("findings", []):
                findings.append({
                    "kind": "interaction",
                    "title": f"{found['drug_a']} + {found['drug_b']}",
                    "severity": found["severity"],
                    "what": found.get("description", ""),
                    "action": "",
                    "source": found.get("source"),
                    "reviewed": found.get("reviewed"),
                    "probability": found.get("probability"),
                    "mechanism": found.get("mechanism"),
                    "drugs": [found["drug_a"], found["drug_b"]],
                })
        except Exception:
            model_available = False
            notes.append("The interaction model failed to run, so drug pairs were not checked.")
    elif not model_available:
        notes.append(
            "The interaction models are not installed on this server, so drug pairs were "
            "not checked. Copy the .pkl files into backend/models/."
        )

    findings.sort(key=lambda f: SEVERITY_ORDER.get(f["severity"], 5))
    severity = _worst(f["severity"] for f in findings)

    # Nothing found and nothing checked is not the same as nothing found.
    if severity == "clear" and not model_available:
        severity = "unknown"

    return {
        "severity": severity,
        "findings": findings,
        "model_available": model_available,
        "model_source": ddi.source(),
        "reviewed_pairs": pairs.get("reviewed_pairs", 0),
        "also_on_file": existing,
        "pairs_checked": pairs.get("pairs_checked", 0),
        "notes": notes,
        "graded_at": timezone.now().isoformat(),
    }


# ---------------------------------------------------------------- shaping

def describe_item(item):
    shelf = item.stock_item
    return {
        "id": item.id,
        "drug": item.drug,
        "dose": item.dose,
        "frequency": item.frequency,
        "quantity": item.quantity,
        "dispensed_quantity": item.dispensed_quantity,
        "label": item.label,
        "stock": {
            "id": shelf.id,
            "level": shelf.level,
            "status": shelf.status,
            "form": shelf.form,
        } if shelf else None,
    }


def describe(prescription, full=False):
    data = {
        "reference": prescription.reference,
        "patient": prescription.patient_name,
        "file_number": prescription.file_number,
        "age": prescription.patient_age,
        "ward": prescription.ward,
        "doctor": prescription.prescriber_name,
        "severity": prescription.severity,
        "status": prescription.status,
        "status_label": prescription.get_status_display(),
        "created_at": prescription.created_at.isoformat(),
        "override": prescription.override_reason,
        "items": [describe_item(item) for item in prescription.items.all()],
    }

    # The pharmacist needs the screening and the override on the queue card
    # itself, not behind a click, so this is not held back for the detail view.
    data["screening"] = prescription.screening or {}
    # Whether a patient has to prove they are the one collecting. A script
    # with no email on file never got a code, so the pharmacist falls back to
    # handing it over with a reason — said here rather than discovered at the
    # counter.
    collection = getattr(prescription, "collection", None)
    data["collection"] = {
        "exists": collection is not None,
        "status": collection.status if collection else None,
        "armed": collection.is_armed if collection else False,
        "seconds_left": collection.seconds_left if collection else 0,
        "emailed": bool(collection and collection.sent_at),
        "sent_to": collection.sent_to if collection else "",
        "send_error": collection.send_error if collection else "",
        "confirmed_by": collection.confirmed_by if collection else "",
        "required": bool(collection and collection.sent_at
                         and collection.status != Collection.Status.COLLECTED),
    } if collection else None

    data["handled_by"] = prescription.handled_by_name or None
    data["handled_at"] = prescription.handled_at.isoformat() if prescription.handled_at else None
    data["pharmacy_note"] = prescription.pharmacy_note

    return data


# ---------------------------------------------------------------- writing

@require_POST
def create(request):
    """A doctor sends a script to the pharmacy."""
    blocked = _guard(request, may_prescribe, "write prescriptions")
    if blocked:
        return blocked

    data, bad = _body(request)
    if bad:
        return bad

    file_number = (data.get("file_number") or "").strip().upper()
    if not file_number:
        return JsonResponse({"detail": "Load a patient file first."}, status=400)

    patient = Patient.objects.filter(file_number=file_number).first()
    if not patient:
        return JsonResponse({"detail": "No patient file with that number."}, status=404)

    raw_items = data.get("items") or []
    if not raw_items:
        return JsonResponse({"detail": "Add at least one medicine."}, status=400)
    if len(raw_items) > MAX_ITEMS:
        return JsonResponse({"detail": f"That is more than {MAX_ITEMS} medicines on one script."},
                            status=400)

    items = []
    for raw in raw_items:
        drug = str(raw.get("drug") or "").strip()[:120]
        if not drug:
            continue

        quantity = raw.get("quantity")
        try:
            quantity = int(quantity) if quantity not in (None, "") else None
        except (TypeError, ValueError):
            quantity = None
        if quantity is not None and (quantity < 1 or quantity > 500):
            return JsonResponse(
                {"detail": f"{drug}: a quantity has to be between 1 and 500."}, status=400
            )

        items.append({
            "drug": drug,
            "dose": str(raw.get("dose") or "").strip()[:60],
            "frequency": str(raw.get("frequency") or "").strip()[:60],
            "quantity": quantity,
        })

    if not items:
        return JsonResponse({"detail": "Add at least one medicine."}, status=400)

    # Graded here rather than trusted from the page.
    verdict = grade([item["drug"] for item in items], patient,
                    user=request.user, context="new prescription")

    # A flagged script needs a written reason. The pharmacist reads it before
    # dispensing, which is the whole point of the override.
    reason = str(data.get("override_reason") or "").strip()[:2000]
    if verdict["severity"] in {"severe", "moderate"} and not reason:
        return JsonResponse({
            "detail": "This script raised a warning. Give a reason before sending it.",
            "screening": verdict,
        }, status=400)

    with transaction.atomic():
        prescription = Prescription.objects.create(
            reference=generate_reference(),
            patient=patient,
            patient_name=patient.full_name,
            file_number=patient.file_number,
            patient_age=patient.age,
            ward=patient.ward,
            prescriber=request.user,
            prescriber_name=request.user.full_name,
            prescriber_id_text=request.user.user_id,
            severity=verdict["severity"],
            screening=verdict,
            override_reason=reason,
            status=Prescription.Status.WAITING,
        )

        for item in items:
            PrescriptionItem.objects.create(
                prescription=prescription,
                stock_item=_match_shelf(item["drug"]),
                **item,
            )

        # The patient's half of the collection, made now so the email can go
        # out with the script rather than being generated at the counter.
        collection = Collection.objects.create(
            prescription=prescription,
            sent_to=(patient.email or "").strip(),
        )

    # Outside the transaction: a mail server being slow or down must not roll
    # back a prescription that was written correctly.
    sent, problem = mailer.send_collection_email(prescription, collection)
    collection.sent_at = timezone.now() if sent else None
    collection.send_error = problem[:300]
    collection.save(update_fields=["sent_at", "send_error"])

    ActivityLog.record(
        ActivityLog.Action.RECORD_UPDATED,
        request.user,
        prescription.reference,
        f"Prescription sent for {patient.full_name} ({verdict['severity']})",
    )

    return JsonResponse({
        "prescription": describe(prescription, full=True),
        "screening": verdict,
        "collection": {
            "emailed": sent,
            "sent_to": collection.sent_to,
            "detail": problem,
        },
    }, status=201)


def _match_shelf(drug):
    """The shelf line this medicine comes off, if the pharmacy keeps it."""
    needle = drug.strip().lower()
    return (
        StockItem.objects.filter(is_active=True, drug__iexact=needle).first()
        or StockItem.objects.filter(is_active=True, drug__istartswith=needle.split()[0]).first()
    )


@require_POST
def screen_only(request):
    """
    Grade a script without sending it, so the page can show the same verdict
    the server would record. Same code path, so the two cannot disagree.
    """
    blocked = _guard(request, may_prescribe, "run a screening check")
    if blocked:
        return blocked

    data, bad = _body(request)
    if bad:
        return bad

    drugs = [str(d).strip() for d in (data.get("drugs") or []) if str(d).strip()]
    if not drugs:
        return JsonResponse({"severity": "clear", "findings": [], "model_available": ddi.is_ready()})

    patient = None
    if data.get("file_number"):
        patient = Patient.objects.filter(
            file_number=str(data["file_number"]).strip().upper()
        ).first()

    return JsonResponse(grade(drugs, patient, user=request.user,
                              context="prescribing screen"))


# ---------------------------------------------------------------- reading

@require_GET
def listing(request):
    """
    The pharmacy queue, or a doctor's own sent list.

    A doctor sees what they prescribed. A pharmacist sees everything, because
    whoever is on the counter has to dispense whatever arrives.
    """
    blocked = _guard(request)
    if blocked:
        return blocked

    scripts = Prescription.objects.prefetch_related("items__stock_item")

    status = (request.GET.get("status") or "").strip()
    if status:
        scripts = scripts.filter(status=status)

    if request.GET.get("mine") == "1" and request.user.role == Role.DOCTOR:
        scripts = scripts.filter(prescriber=request.user)

    query = (request.GET.get("q") or "").strip()
    if query:
        from django.db.models import Q
        scripts = scripts.filter(
            Q(patient_name__icontains=query)
            | Q(file_number__icontains=query)
            | Q(reference__icontains=query)
            | Q(items__drug__icontains=query)
        ).distinct()

    rows = [describe(script) for script in scripts[:200]]

    today = timezone.localdate()
    everything = Prescription.objects.all()

    return JsonResponse({
        "results": rows,
        "counts": {
            "waiting": everything.filter(status=Prescription.Status.WAITING).count(),
            "flagged": everything.filter(
                status=Prescription.Status.WAITING,
                severity__in=["severe", "moderate"],
            ).count(),
            "dispensed_today": everything.filter(
                status=Prescription.Status.DISPENSED, handled_at__date=today
            ).count(),
        },
        "can_dispense": may_dispense(request.user),
    })


@require_GET
def detail(request, reference):
    blocked = _guard(request)
    if blocked:
        return blocked

    script = Prescription.objects.filter(reference=reference.strip().upper()).first()
    if not script:
        return JsonResponse({"detail": "No prescription with that reference."}, status=404)

    return JsonResponse({
        "prescription": describe(script, full=True),
        "can_dispense": may_dispense(request.user),
    })


# ---------------------------------------------------------------- dispensing

@require_POST
def dispense(request, reference):
    """
    Hand the script over and take the stock off the shelf.

    Refused outright when something on it is completely out of stock — the
    pharmacist should query that with the prescriber rather than hand over a
    part of a script without saying so. Where there is some but not enough,
    what is there goes out and the response says exactly what was short.
    """
    blocked = _guard(request, may_dispense, "dispense prescriptions")
    if blocked:
        return blocked

    data, bad = _body(request)
    if bad:
        return bad

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
                "prescription": describe(script, full=True),
            }, status=409)

        # The patient has to have confirmed, unless they never got a code to
        # confirm with. Handing over without one is allowed, but it is a
        # decision the pharmacist makes in writing rather than a silent
        # default.
        collection = getattr(script, "collection", None)
        confirmed = collection is not None and collection.status == Collection.Status.COLLECTED
        override = str(data.get("without_confirmation_reason") or "").strip()[:500]

        if collection is not None and collection.sent_at and not confirmed and not override:
            return JsonResponse({
                "detail": "The patient has not confirmed yet. Press Dispense to show the "
                          "code, or type the code they were emailed.",
                "needs_confirmation": True,
                "prescription": describe(script, full=True),
            }, status=409)

        items = list(script.items.select_related("stock_item"))

        # Lock every shelf line first, in a stable order, so two dispenses
        # running at once cannot deadlock against each other.
        shelf_ids = sorted({item.stock_item_id for item in items if item.stock_item_id})
        shelves = {
            shelf.id: shelf
            for shelf in StockItem.objects.select_for_update().filter(id__in=shelf_ids)
        }

        # Anything with nothing at all on the shelf stops the whole script.
        empty = [
            item.drug for item in items
            if item.stock_item_id and shelves[item.stock_item_id].level == 0
        ]
        if empty:
            return JsonResponse({
                "detail": f"{', '.join(empty)} {'is' if len(empty) == 1 else 'are'} out of stock. "
                          f"Query it with the prescriber, or order it in first.",
                "out_of_stock": empty,
                "prescription": describe(script, full=True),
            }, status=409)

        short = []
        not_stocked = []

        for item in items:
            if not item.stock_item_id:
                not_stocked.append(item.drug)
                continue

            shelf = shelves[item.stock_item_id]
            wanted = item.quantity or 1
            given = min(wanted, shelf.level)

            movement = shelf.apply(
                -given,
                StockMovement.Reason.DISPENSE,
                user=request.user,
                note=f"{script.reference} · {item.drug}",
            )

            item.dispensed_quantity = -movement.change if movement else 0
            item.save(update_fields=["dispensed_quantity"])

            if item.dispensed_quantity < wanted:
                short.append(f"{item.drug}: {item.dispensed_quantity} of {wanted}")

        script.status = Prescription.Status.DISPENSED
        script.handled_by = request.user
        script.handled_by_name = request.user.full_name
        script.handled_at = timezone.now()
        note = str(data.get("note") or "").strip()[:2000]

        if confirmed:
            how = "scan" if collection.confirmed_by == "scan" else "code"
            note = (f"Collected by the patient ({how}). " + note).strip()
        elif override:
            # Why nobody confirmed is worth more than the fact that nobody did.
            note = (f"Handed over without patient confirmation: {override}. " + note).strip()

        script.pharmacy_note = note[:2000]
        script.save()

    parts = []
    if short:
        parts.append("Short on " + "; ".join(short) + ".")
    if not_stocked:
        parts.append(
            f"{', '.join(not_stocked)} {'is' if len(not_stocked) == 1 else 'are'} not on the "
            f"stock list, so nothing was taken off the shelf for it."
        )

    ActivityLog.record(
        ActivityLog.Action.RECORD_UPDATED,
        request.user,
        script.reference,
        f"Dispensed for {script.patient_name}",
    )

    return JsonResponse({
        "prescription": describe(script, full=True),
        "short": short,
        "not_stocked": not_stocked,
        "detail": " ".join(parts),
    })


@require_POST
def query_back(request, reference):
    """Send it back to the prescriber with a reason. No stock moves."""
    blocked = _guard(request, may_dispense, "query prescriptions")
    if blocked:
        return blocked

    data, bad = _body(request)
    if bad:
        return bad

    note = str(data.get("note") or "").strip()[:2000]
    if not note:
        return JsonResponse(
            {"detail": "Say what you want the prescriber to look at."}, status=400
        )

    script = Prescription.objects.filter(reference=reference.strip().upper()).first()
    if not script:
        return JsonResponse({"detail": "No prescription with that reference."}, status=404)

    if script.status != Prescription.Status.WAITING:
        return JsonResponse({
            "detail": f"This script was already {script.get_status_display().lower()}.",
            "prescription": describe(script, full=True),
        }, status=409)

    script.status = Prescription.Status.QUERIED
    script.handled_by = request.user
    script.handled_by_name = request.user.full_name
    script.handled_at = timezone.now()
    script.pharmacy_note = note
    script.save()

    ActivityLog.record(
        ActivityLog.Action.RECORD_UPDATED,
        request.user,
        script.reference,
        f"Queried back to {script.prescriber_name}",
    )

    return JsonResponse({"prescription": describe(script, full=True)})