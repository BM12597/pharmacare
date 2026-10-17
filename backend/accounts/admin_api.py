"""
Everything the admin overview draws.

The rule is the same one the management portal follows: a figure is either
counted from the database or it is returned as ``{"available": false}`` with a
reason. Nothing on this page is a placeholder dressed up as a measurement.

Two cards are honest gaps today, because the records behind them do not exist
yet — anything counted per prescription needs the doctor and pharmacy
workspaces writing prescriptions first. They light up on their own once those
records land; nothing here needs changing for that.
"""

from collections import Counter
from datetime import timedelta

from django.db.models import Count
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET

from . import storage
from .models import Patient, PatientFile, Role

DAYS_ON_CHART = 14


def _guard(request):
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Not signed in."}, status=401)
    if request.user.role != Role.ADMIN and not request.user.is_superuser:
        return JsonResponse({"detail": "This account cannot open the admin overview."}, status=403)
    return None


def _not_yet(reason):
    return {"available": False, "detail": reason}


# ----------------------------------------------------------------------
# Where patients come from
#
# Suburb centres for the catchment around Dr George Mukhari. The map draws
# these, never a patient address — the record stores the suburb and nothing
# finer, so there is nothing finer to plot.
#
# A suburb that is not in this list is still counted and still shown, as a row
# beside the map rather than a pin in the wrong place.
# ----------------------------------------------------------------------

SUBURB_COORDS = {
    "ga-rankuwa": (-25.6222, 27.9986),
    "mabopane": (-25.4936, 28.0139),
    "soshanguve": (-25.5333, 28.1000),
    "winterveld": (-25.4500, 27.9333),
    "winterveldt": (-25.4500, 27.9333),
    "hebron": (-25.5167, 27.9167),
    "klipgat": (-25.4667, 27.9667),
    "rosslyn": (-25.6167, 28.0833),
    "akasia": (-25.6667, 28.1000),
    "pretoria west": (-25.7333, 28.1500),
    "atteridgeville": (-25.7667, 28.0667),
    "mamelodi": (-25.7069, 28.3853),
    "temba": (-25.3500, 28.2833),
    "hammanskraal": (-25.4000, 28.2833),
    "garsfontein": (-25.8000, 28.2833),
    "centurion": (-25.8603, 28.1894),
    "pretoria": (-25.7479, 28.2293),
    "pretoria north": (-25.6833, 28.1833),
    "laudium": (-25.7667, 28.1167),
    "olievenhoutbosch": (-25.8833, 28.0833),
}

HOSPITAL = {"lat": -25.6154, "lng": 27.9930, "name": "Dr George Mukhari Academic Hospital"}


def _locate(area):
    return SUBURB_COORDS.get((area or "").strip().lower())


def _areas():
    """Patient counts by home suburb, with the main condition for each."""
    rows = Patient.objects.exclude(home_area="").values_list("home_area", "conditions")

    grouped = {}
    for area, conditions in rows:
        key = area.strip()
        if not key:
            continue
        bucket = grouped.setdefault(key, {"cases": 0, "conditions": Counter()})
        bucket["cases"] += 1
        for condition in conditions or []:
            bucket["conditions"][condition] += 1

    located, unlocated = [], []
    for area, bucket in sorted(grouped.items(), key=lambda item: -item[1]["cases"]):
        top = bucket["conditions"].most_common(1)
        entry = {
            "area": area,
            "cases": bucket["cases"],
            "condition": top[0][0] if top else "",
        }
        point = _locate(area)
        if point:
            entry["lat"], entry["lng"] = point
            located.append(entry)
        else:
            unlocated.append(entry)

    return located, unlocated


def _daily_uploads():
    """Files added per day for the last fortnight, straight from the uploads."""
    today = timezone.localdate()
    start = today - timedelta(days=DAYS_ON_CHART - 1)

    counted = Counter()
    recent = PatientFile.objects.filter(uploaded_at__date__gte=start).values_list("uploaded_at", flat=True)
    for moment in recent:
        counted[timezone.localtime(moment).date()] += 1

    days, values = [], []
    for offset in range(DAYS_ON_CHART):
        day = start + timedelta(days=offset)
        days.append(day.strftime("%d"))
        values.append(counted.get(day, 0))

    return {"available": True, "days": days, "values": values, "total": sum(values)}


@require_GET
def overview(request):
    """Every figure on the admin overview, in one request."""
    blocked = _guard(request)
    if blocked:
        return blocked

    now = timezone.now()
    week_ago = now - timedelta(days=7)

    patients = Patient.objects.all()
    total_patients = patients.count()
    awaiting = patients.filter(needs_review=True).count()

    files = PatientFile.objects.all()

    # Condition counts come out of the JSON column, so they are tallied here
    # rather than with a GROUP BY.
    conditions = Counter()
    for values in patients.values_list("conditions", flat=True):
        for condition in values or []:
            conditions[condition] += 1

    wards = (
        patients.exclude(ward="")
        .values("ward")
        .annotate(count=Count("id"))
        .order_by("-count")[:8]
    )
    ward_total = sum(row["count"] for row in wards) or 1

    located, unlocated = _areas()

    return JsonResponse({
        "patients": {
            "available": True,
            "total": total_patients,
            "awaiting_confirmation": awaiting,
            "confirmed": total_patients - awaiting,
            # The gauge shows this: how much of the system is still waiting on
            # a doctor to check it against the paper.
            "awaiting_share": round(awaiting / total_patients * 100, 1) if total_patients else 0,
            "added_this_week": patients.filter(created_at__gte=week_ago).count(),
        },

        "files": {
            "available": True,
            "total": files.count(),
            "this_week": files.filter(uploaded_at__gte=week_ago).count(),
            "failed": files.filter(stage=PatientFile.Stage.FAILED).count(),
            "read_as_image": files.filter(read_as_image=True).count(),
        },

        "daily_files": _daily_uploads(),

        "conditions": {
            "available": bool(conditions),
            "results": [
                {"name": name, "count": count}
                for name, count in conditions.most_common(6)
            ],
            "detail": "" if conditions else "No conditions recorded yet. Upload a patient file to start.",
        },

        "wards": {
            "available": bool(wards),
            "results": [
                {
                    "label": row["ward"],
                    "count": row["count"],
                    "share": round(row["count"] / ward_total * 100),
                }
                for row in wards
            ],
            "detail": "" if wards else "No wards recorded yet.",
        },

        "map": {
            "available": bool(located or unlocated),
            "hospital": HOSPITAL,
            "areas": located,
            "unplaced": unlocated,
            "detail": "" if (located or unlocated) else
                      "No home areas recorded yet. They appear here as patient files are read in.",
        },

        # Honest gaps. Both are counted per prescription, and prescriptions are
        # not recorded yet.
        "interactions": _not_yet(
            "Interaction counts arrive once doctors send prescriptions through screening."
        ),
        "screening": _not_yet(
            "Prescriptions screened and the flag rate arrive with the doctor workspace."
        ),

        "storage": storage.usage(),
        "generated_at": now.isoformat(),
    })