"""
Patient files: uploading, reading, viewing, editing and downloading.

Who may do what is decided here, on every request, and not in the page that
sent it:

    view and download     admin, doctors, pharmacists
    edit and confirm      doctors only
    upload                admin only
    delete                nobody, yet — a patient file is not something to
                          remove from a web page

An upload runs as three requests rather than one, so the progress on screen is
reporting work that has finished rather than animating a guess:

    POST /api/patients/upload/              store the file
    POST /api/patients/files/<id>/read/     read the pages
    POST /api/patients/files/<id>/extract/  pull out the details, build the record

Each one returns quickly enough to show, and each stage is only marked done
once the server says it is.
"""

import json
import re

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from . import cloud, extract as extraction
from .models import ActivityLog, Patient, PatientFile, PatientRecordVersion, Role

MAX_UPLOAD_BYTES = 20 * 1024 * 1024

ACCEPTED_TYPES = {
    "application/pdf",
    "image/png", "image/jpeg", "image/jpg", "image/webp",
    "text/csv", "application/vnd.ms-excel",
}

VIEW_ROLES = {Role.ADMIN, Role.DOCTOR, Role.PHARMACIST}
EDIT_ROLES = {Role.DOCTOR}
UPLOAD_ROLES = {Role.ADMIN}


# ---------------------------------------------------------------- guards

def may_view(user):
    return bool(user.is_authenticated and (user.is_superuser or user.role in VIEW_ROLES))


def may_edit(user):
    return bool(user.is_authenticated and (user.is_superuser or user.role in EDIT_ROLES))


def may_upload(user):
    return bool(user.is_authenticated and (user.is_superuser or user.role in UPLOAD_ROLES))


def _guard(request, check=may_view, what="open patient files"):
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


def permissions_for(user):
    """
    What this account may do, so the page can hide what it cannot use.

    The page hiding a button is a courtesy. These same checks run again on
    every request, which is what actually stops anything.
    """
    return {
        "view": may_view(user),
        "edit": may_edit(user),
        "upload": may_upload(user),
        "download": may_view(user),
    }


# ---------------------------------------------------------------- shaping

def describe_file(document):
    return {
        "id": document.id,
        "name": document.original_name,
        "kind": document.kind,
        "size_bytes": document.size_bytes,
        "pages": document.page_count,
        "stage": document.stage,
        "stage_label": document.get_stage_display(),
        "detail": document.detail,
        "read_as_image": document.read_as_image,
        "text_chars": document.text_chars,
        "uploaded_at": document.uploaded_at.isoformat(),
        "uploaded_by": document.uploaded_by.full_name if document.uploaded_by else None,
        "file_number": document.patient.file_number if document.patient else None,
        "patient_name": document.patient.full_name if document.patient else None,
        "stored": bool(document.cloud_url),
        "download_url": f"/api/patients/files/{document.id}/download/" if document.cloud_url else None,
    }


def describe_version(version):
    return {
        "id": version.id,
        "at": version.edited_at.isoformat(),
        "by": version.edited_by_name or "—",
        "by_id": version.edited_by_id_text,
        "fields": version.changed_fields or [],
        "note": version.note,
    }


def describe_patient(patient, full=False):
    data = {
        "file_number": patient.file_number,
        "full_name": patient.full_name,
        "age": patient.age,
        "sex": patient.sex,
        "sex_label": patient.get_sex_display() if patient.sex else "",
        "ward": patient.ward,
        "conditions": patient.conditions or [],
        "medication": patient.medication or [],
        "allergies": patient.allergies or [],
        "needs_review": patient.needs_review,
        "updated_at": patient.updated_at.isoformat(),
        "updated_by": patient.updated_by.full_name if patient.updated_by else None,
    }

    if not full:
        return data

    data.update({
        "id_number": patient.id_number,
        "date_of_birth": patient.date_of_birth.isoformat() if patient.date_of_birth else None,
        "stated_age": patient.stated_age,
        "home_area": patient.home_area,
        "address": patient.address,
        "language": patient.language,
        "phone": patient.phone,
        "email": patient.email,
        "next_of_kin": patient.next_of_kin,
        "next_of_kin_phone": patient.next_of_kin_phone,
        "encounter": patient.encounter or {},
        "history_notes": patient.history_notes,
        "observations": patient.observations or {},
        "assessment": patient.assessment,
        "plan": patient.plan,
        "source": patient.source,
        "confirmed_by": patient.confirmed_by.full_name if patient.confirmed_by else None,
        "confirmed_at": patient.confirmed_at.isoformat() if patient.confirmed_at else None,
        "created_at": patient.created_at.isoformat(),
        "created_by": patient.created_by.full_name if patient.created_by else None,
        "documents": [describe_file(d) for d in patient.documents.all()[:20]],
        "versions": [describe_version(v) for v in patient.versions.all()[:20]],
    })
    return data


# ---------------------------------------------------------------- list and read

@require_GET
def list_patients(request):
    """Every patient with a file, filtered the way the search box asks."""
    blocked = _guard(request)
    if blocked:
        return blocked

    query = (request.GET.get("q") or "").strip()
    condition = (request.GET.get("condition") or "").strip()
    ward = (request.GET.get("ward") or "").strip()
    limit = min(int(request.GET.get("limit") or 200), 500)

    patients = Patient.objects.all()

    if query:
        patients = patients.filter(
            Q(full_name__icontains=query)
            | Q(file_number__icontains=query)
            | Q(id_number__startswith=query)
        )
    if ward:
        patients = patients.filter(ward=ward)

    rows = [describe_patient(p) for p in patients[:limit]]

    # Conditions live in JSON, so this one is filtered in Python rather than
    # with a database query. At this scale that is the simpler trade.
    if condition:
        rows = [row for row in rows if condition in row["conditions"]]

    everything = Patient.objects.all()
    conditions = sorted({c for p in everything.only("conditions") for c in (p.conditions or [])})
    wards = sorted({p.ward for p in everything.only("ward") if p.ward})

    return JsonResponse({
        "results": rows,
        "total": Patient.objects.count(),
        "shown": len(rows),
        "conditions": conditions,
        "wards": wards,
        "can": permissions_for(request.user),
    })


@require_GET
def patient_detail(request, file_number):
    blocked = _guard(request)
    if blocked:
        return blocked

    patient = Patient.objects.filter(file_number=file_number.strip().upper()).first()
    if not patient:
        return JsonResponse({"detail": "No patient file with that number."}, status=404)

    return JsonResponse({
        "patient": describe_patient(patient, full=True),
        "can": permissions_for(request.user),
    })


# ---------------------------------------------------------------- editing

# What a doctor is allowed to change, and how each one is cleaned. The file
# number is not in this list: it identifies the record, so it is set once when
# the file is created and never edited from a form.
TEXT_FIELDS = {
    "full_name": 160, "id_number": 20, "ward": 80, "home_area": 120,
    "address": 240, "language": 80, "phone": 40, "email": 160,
    "next_of_kin": 160, "next_of_kin_phone": 40,
}
LONG_FIELDS = {"history_notes": 4000, "assessment": 4000, "plan": 4000}
LIST_FIELDS = {"conditions", "allergies"}
DICT_FIELDS = {"encounter": extraction.ENCOUNTER_KEYS, "observations": extraction.OBSERVATION_KEYS}


def _apply(patient, data):
    """
    Put the submitted values onto the record.

    Returns the list of field names that actually changed, which is what the
    version history records. A field that was sent unchanged is not an edit.
    """
    changed = []

    for field, limit in {**TEXT_FIELDS, **LONG_FIELDS}.items():
        if field not in data:
            continue
        value = extraction._clean(data.get(field), limit)
        if value != getattr(patient, field):
            setattr(patient, field, value)
            changed.append(field)

    if "sex" in data:
        value = str(data.get("sex") or "").upper()[:1]
        value = value if value in {"F", "M", "O"} else ""
        if value != patient.sex:
            patient.sex = value
            changed.append("sex")

    if "date_of_birth" in data:
        value = extraction._clean_date(data.get("date_of_birth"))
        if value != patient.date_of_birth:
            patient.date_of_birth = value
            changed.append("date_of_birth")

    if "stated_age" in data:
        value = extraction._clean_age(data.get("stated_age"))
        if value != patient.stated_age:
            patient.stated_age = value
            changed.append("stated_age")

    for field in LIST_FIELDS:
        if field not in data:
            continue
        value = extraction._clean_list(data.get(field))
        if value != (getattr(patient, field) or []):
            setattr(patient, field, value)
            changed.append(field)

    if "medication" in data:
        value = extraction._clean_medication(data.get("medication"))
        if value != (patient.medication or []):
            patient.medication = value
            changed.append("medication")

    for field, keys in DICT_FIELDS.items():
        if field not in data:
            continue
        submitted = data.get(field) or {}
        if not isinstance(submitted, dict):
            continue
        value = {key: extraction._clean(submitted.get(key), 600) for key in keys}
        if value != (getattr(patient, field) or {}):
            setattr(patient, field, value)
            changed.append(field)

    return changed


@require_http_methods(["POST", "PATCH"])
def update_patient(request, file_number):
    """
    Save a doctor's edit.

    The previous state is written to the version history first, so if two
    doctors edit the same file the history shows both rather than one quietly
    replacing the other.
    """
    blocked = _guard(request, may_edit, "edit patient files")
    if blocked:
        return blocked

    data, bad = _body(request)
    if bad:
        return bad

    with transaction.atomic():
        patient = (
            Patient.objects
            .select_for_update()
            .filter(file_number=file_number.strip().upper())
            .first()
        )
        if not patient:
            return JsonResponse({"detail": "No patient file with that number."}, status=404)

        before = patient.snapshot()
        changed = _apply(patient, data)

        if not changed:
            return JsonResponse({
                "patient": describe_patient(patient, full=True),
                "changed": [],
                "detail": "Nothing was different, so nothing was saved.",
                "can": permissions_for(request.user),
            })

        # A doctor saving the record is also confirming it: they have read it
        # against the original and taken responsibility for what it says.
        if patient.needs_review:
            patient.needs_review = False
            patient.confirmed_by = request.user
            patient.confirmed_at = timezone.now()
            changed.append("confirmed")

        patient.updated_by = request.user
        patient.updated_at = timezone.now()
        patient.save()

        PatientRecordVersion.objects.create(
            patient=patient,
            snapshot=before,
            changed_fields=changed,
            note=extraction._clean(data.get("note"), 300),
            edited_by=request.user,
            edited_by_name=request.user.full_name,
            edited_by_id_text=request.user.user_id,
        )

    ActivityLog.record(
        ActivityLog.Action.RECORD_UPDATED,
        request.user,
        patient.file_number,
        f"Edited {', '.join(changed[:6])}",
    )

    return JsonResponse({
        "patient": describe_patient(patient, full=True),
        "changed": changed,
        "can": permissions_for(request.user),
    })


@require_POST
def confirm_patient(request, file_number):
    """A doctor says the record matches the original, without changing it."""
    blocked = _guard(request, may_edit, "confirm patient files")
    if blocked:
        return blocked

    patient = Patient.objects.filter(file_number=file_number.strip().upper()).first()
    if not patient:
        return JsonResponse({"detail": "No patient file with that number."}, status=404)

    if not patient.needs_review:
        return JsonResponse({
            "patient": describe_patient(patient, full=True),
            "detail": "This record was already confirmed.",
            "can": permissions_for(request.user),
        })

    before = patient.snapshot()

    patient.needs_review = False
    patient.confirmed_by = request.user
    patient.confirmed_at = timezone.now()
    patient.updated_by = request.user
    patient.updated_at = timezone.now()
    patient.save()

    PatientRecordVersion.objects.create(
        patient=patient,
        snapshot=before,
        changed_fields=["confirmed"],
        note="Checked against the original file.",
        edited_by=request.user,
        edited_by_name=request.user.full_name,
        edited_by_id_text=request.user.user_id,
    )

    ActivityLog.record(
        ActivityLog.Action.RECORD_CONFIRMED,
        request.user,
        patient.file_number,
        "Confirmed against the original file",
    )

    return JsonResponse({
        "patient": describe_patient(patient, full=True),
        "can": permissions_for(request.user),
    })


@require_GET
def version_detail(request, file_number, version_id):
    """One earlier state of a record, for comparing against what it says now."""
    blocked = _guard(request)
    if blocked:
        return blocked

    version = (
        PatientRecordVersion.objects
        .filter(id=version_id, patient__file_number=file_number.strip().upper())
        .first()
    )
    if not version:
        return JsonResponse({"detail": "No such version of this file."}, status=404)

    return JsonResponse({"version": describe_version(version), "snapshot": version.snapshot})


# ---------------------------------------------------------------- uploading

@require_POST
def upload_file(request):
    """
    Stage one: store the file.

    Nothing is read here. The file is in Cloudinary and recorded before any
    reading is attempted, so a failed extraction never loses the document.
    """
    blocked = _guard(request, may_upload, "upload patient files")
    if blocked:
        return blocked

    upload = request.FILES.get("file")
    if not upload:
        return JsonResponse({"detail": "No file was attached."}, status=400)

    if upload.size > MAX_UPLOAD_BYTES:
        return JsonResponse(
            {"detail": f"{upload.name} is larger than the 20 MB limit."}, status=400
        )
    if upload.size == 0:
        return JsonResponse({"detail": f"{upload.name} is empty."}, status=400)

    content_type = upload.content_type or cloud.guess_content_type(upload.name)
    if content_type not in ACCEPTED_TYPES:
        return JsonResponse(
            {"detail": "Upload a PDF, a picture of the page, or a CSV."}, status=400
        )

    raw = upload.read()
    stored = cloud.upload(raw, upload.name, content_type)

    if not stored["ok"]:
        return JsonResponse({"detail": stored["detail"]}, status=502)

    document = PatientFile.objects.create(
        original_name=upload.name[:240],
        content_type=content_type,
        size_bytes=upload.size,
        cloud_public_id=stored["public_id"],
        cloud_url=stored["url"],
        cloud_resource_type=stored["resource_type"],
        page_count=stored.get("pages") or None,
        stage=PatientFile.Stage.UPLOADED,
        uploaded_by=request.user,
    )

    readable = content_type == "application/pdf" or content_type.startswith("image/")

    return JsonResponse({
        "file": describe_file(document),
        # A CSV is stored but there is no patient record to make from it, so
        # the page stops after this stage rather than pretending to read it.
        "next": "read" if readable else None,
    }, status=201)


@require_POST
def read_file(request, file_id):
    """
    Stage two: read the pages.

    Fast and local — this is pypdf, not the model. It also decides whether the
    page has a usable text layer, which is what the next stage needs to know.
    """
    blocked = _guard(request, may_upload, "read patient files")
    if blocked:
        return blocked

    document = PatientFile.objects.filter(id=file_id).first()
    if not document:
        return JsonResponse({"detail": "No such upload."}, status=404)

    raw, problem = cloud.fetch(document.cloud_url)
    if raw is None:
        document.stage = PatientFile.Stage.FAILED
        document.detail = problem
        document.save(update_fields=["stage", "detail"])
        return JsonResponse({"detail": problem, "file": describe_file(document)}, status=502)

    is_pdf = document.content_type == "application/pdf"
    text, pages = extraction.read_pdf(raw) if is_pdf else ("", 1)

    document.page_text = text[:400000]
    document.text_chars = len(text)
    document.page_count = pages or document.page_count
    document.read_as_image = not extraction.has_usable_text(text, pages)
    document.stage = PatientFile.Stage.READING
    document.detail = ""
    document.save(update_fields=[
        "page_text", "text_chars", "page_count", "read_as_image", "stage", "detail",
    ])

    return JsonResponse({
        "file": describe_file(document),
        "next": "extract",
        # Said plainly, because reading a scan as a picture is slower and a
        # little less certain than reading a text layer.
        "detail": (
            "No text layer, so the page will be read as a picture."
            if document.read_as_image
            else f"Read {document.text_chars:,} characters of text."
        ),
    })


@require_POST
def extract_file(request, file_id):
    """
    Stage three: pull out the details and build the record.

    This is the slow one — it calls the model. On success the patient record
    exists, marked as needing a doctor's confirmation.
    """
    blocked = _guard(request, may_upload, "read patient files")
    if blocked:
        return blocked

    document = PatientFile.objects.filter(id=file_id).first()
    if not document:
        return JsonResponse({"detail": "No such upload."}, status=404)

    raw, problem = cloud.fetch(document.cloud_url)
    if raw is None:
        document.stage = PatientFile.Stage.FAILED
        document.detail = problem
        document.save(update_fields=["stage", "detail"])
        return JsonResponse({"detail": problem, "file": describe_file(document)}, status=502)

    document.stage = PatientFile.Stage.EXTRACTING
    document.save(update_fields=["stage"])

    result = extraction.extract(
        raw,
        document.original_name,
        document.content_type,
        # Already read in stage two, so the pages are not read twice.
        text=document.page_text if document.page_text else None,
        page_count=document.page_count,
    )

    if not result["ok"]:
        document.stage = PatientFile.Stage.FAILED
        document.detail = result["detail"][:300]
        document.save(update_fields=["stage", "detail"])
        return JsonResponse(
            {"detail": result["detail"], "file": describe_file(document)}, status=422
        )

    fields = extraction.normalise(result["payload"])
    gaps = extraction.missing_fields(fields)

    if not fields["full_name"] and not fields["file_number"]:
        document.stage = PatientFile.Stage.FAILED
        document.detail = "Neither a patient name nor a file number could be read."
        document.save(update_fields=["stage", "detail"])
        return JsonResponse({
            "detail": "Neither a patient name nor a file number could be read from this file. "
                      "It is stored, but no record was created.",
            "file": describe_file(document),
        }, status=422)

    outcome = _record_from(fields, request.user)

    # The ID number says this page belongs to somebody already on the system,
    # but something about it does not line up. Nothing is created and nothing
    # is changed; the document is kept and a person decides.
    if outcome["status"] == "conflict":
        document.extracted = result["payload"]
        document.read_as_image = result["read_as_image"]
        document.stage = PatientFile.Stage.HELD
        document.detail = outcome["note"][:300]
        document.save()

        ActivityLog.record(
            ActivityLog.Action.FILE_HELD,
            request.user,
            outcome["conflict"]["file_number"],
            f"{document.original_name} held: {outcome['note']}"[:300],
        )

        return JsonResponse({
            "detail": outcome["note"],
            "conflict": outcome["conflict"],
            "file": describe_file(document),
            "can": permissions_for(request.user),
        }, status=409)

    patient = outcome["patient"]
    created = outcome["status"] == "created"

    document.patient = patient
    document.extracted = result["payload"]
    document.read_as_image = result["read_as_image"]
    document.stage = PatientFile.Stage.DONE
    document.detail = ""
    document.save()

    ActivityLog.record(
        ActivityLog.Action.RECORD_CREATED if created else ActivityLog.Action.FILE_UPLOADED,
        request.user,
        patient.file_number,
        f"{'Record created' if created else 'Document attached'} from {document.original_name}",
    )

    return JsonResponse({
        "file": describe_file(document),
        "patient": describe_patient(patient, full=True),
        "created": created,
        "gaps": gaps,
        "note": outcome["note"],
        "matched_on": outcome.get("matched_on"),
        "can": permissions_for(request.user),
    }, status=201 if created else 200)


def _fallback_file_number():
    """
    A file number for a page that did not carry one.

    Marked UNFILED so nobody mistakes it for a real hospital number, and so a
    doctor can see at a glance which records still need one.
    """
    stamp = timezone.now().strftime("%Y%m%d")
    for index in range(1, 1000):
        candidate = f"UNFILED-{stamp}-{index:03d}"
        if not Patient.objects.filter(file_number=candidate).exists():
            return candidate
    raise RuntimeError("Could not allocate a placeholder file number.")


def _same_person(name_a, name_b):
    """
    Whether two names on file are plainly the same person.

    Deliberately strict. "Naledi Mokoena" and "Naledi P Mokoena" are the same
    person; anything less obvious than that is treated as a different person,
    because the cost of being wrong here is two patients sharing one record.
    """
    def tokens(value):
        cleaned = re.sub(r"[^a-z ]", " ", (value or "").lower())
        return {part for part in cleaned.split() if len(part) > 1}

    first, second = tokens(name_a), tokens(name_b)
    if not first or not second:
        # One of them has no name to compare, so this cannot be decided here.
        return None
    return first <= second or second <= first


def _find_existing(file_number, id_digits):
    """
    The record this page belongs to, and how it was recognised.

    The ID number is checked as well as the file number, because the file
    number is a filing decision and the ID number is the person. A patient
    filed twice under two numbers is the duplicate that matters: screening
    would then run against half a medication list.
    """
    by_file = Patient.objects.filter(file_number=file_number).first() if file_number else None
    by_id = list(Patient.objects.filter(id_number=id_digits)) if id_digits else []

    return by_file, by_id


def _record_from(fields, user):
    """
    Create the patient record, add to the one already on the system, or hold
    the upload for a person to decide.

    Returns {"status": "created" | "merged" | "conflict", "patient", "note",
             "matched_on", "conflict"}.

    An upload for an existing patient never overwrites what a doctor has
    confirmed. It fills blanks and leaves everything else alone, and the
    previous state goes into the version history either way.
    """
    file_number = (fields.pop("file_number", "") or "")
    id_facts = extraction.id_number_facts(fields.get("id_number"))
    id_digits = id_facts["digits"]

    # Store the digits rather than whatever punctuation was on the page, so
    # two spellings of the same number match each other.
    if id_digits:
        fields["id_number"] = id_digits

    notes = []
    if id_facts["detail"]:
        notes.append(id_facts["detail"])

    # The date inside a valid ID number is a free second opinion on the date
    # of birth that was read off the page.
    if id_facts["valid"] and id_facts["dob"]:
        stated = fields.get("date_of_birth")
        if stated and stated != id_facts["dob"]:
            notes.append(
                f"The date of birth on the page ({stated}) does not match the one inside the "
                f"ID number ({id_facts['dob']}). A doctor should check which is right."
            )
        elif not stated:
            fields["date_of_birth"] = id_facts["dob"]
            notes.append("The date of birth was taken from inside the ID number.")

    by_file, by_id = _find_existing(file_number, id_digits)

    # ---- the cases where this page cannot be filed without a person deciding

    if len(by_id) > 1:
        return {
            "status": "conflict",
            "patient": None,
            "note": f"ID number {id_digits} is already on {len(by_id)} records "
                    f"({', '.join(p.file_number for p in by_id[:4])}). Those need sorting out "
                    f"before another file is added to them.",
            "conflict": {
                "reason": "id_on_several_records",
                "id_number": id_digits,
                "file_number": by_id[0].file_number,
                "existing_name": by_id[0].full_name,
                "others": [p.file_number for p in by_id[:6]],
            },
        }

    match = by_id[0] if by_id else None

    if match and by_file and match.pk != by_file.pk:
        return {
            "status": "conflict",
            "patient": None,
            "note": f"This page is filed as {file_number} under {fields.get('full_name') or 'no name'}, "
                    f"but ID number {id_digits} already belongs to {match.full_name} on file "
                    f"{match.file_number}. Nothing was changed on either record.",
            "conflict": {
                "reason": "id_belongs_to_another_file",
                "id_number": id_digits,
                "file_number": match.file_number,
                "existing_name": match.full_name,
                "page_file_number": file_number,
                "page_name": fields.get("full_name", ""),
            },
        }

    if match and not by_file:
        agrees = _same_person(fields.get("full_name"), match.full_name)
        if agrees is False:
            return {
                "status": "conflict",
                "patient": None,
                "note": f"ID number {id_digits} is on file {match.file_number} under "
                        f"{match.full_name}, but this page reads "
                        f"{fields.get('full_name') or 'no name'}. One of the two is wrong, so "
                        f"nothing was created.",
                "conflict": {
                    "reason": "id_matches_a_different_name",
                    "id_number": id_digits,
                    "file_number": match.file_number,
                    "existing_name": match.full_name,
                    "page_name": fields.get("full_name", ""),
                },
            }

        # Same person, filed under a second number. Better one record with a
        # question mark over its file number than two records for one patient.
        notes.append(
            f"The ID number matches {match.full_name} on file {match.file_number}, but the page "
            f"is filed as {file_number or 'nothing'}. The document was attached to the record "
            f"already on the system rather than making a second one. A doctor should set the "
            f"right file number."
            if file_number else
            f"The ID number matches {match.full_name} on file {match.file_number}, so the "
            f"document was attached to that record."
        )
        return _merge_into(match, fields, user, notes, matched_on="id_number")

    if by_file:
        return _merge_into(by_file, fields, user, notes, matched_on="file_number")

    # ---- nothing on the system yet

    if not file_number:
        file_number = _fallback_file_number()
        notes.append(
            "The page carried no file number, so a placeholder was used. A doctor should set the real one."
        )

    try:
        with transaction.atomic():
            patient = Patient.objects.create(
                file_number=file_number,
                source=Patient.Source.UPLOAD,
                needs_review=True,
                created_by=user,
                updated_by=user,
                **fields,
            )
        return {
            "status": "created",
            "patient": patient,
            "note": " ".join(notes),
            "matched_on": None,
        }
    except IntegrityError:
        # Two uploads of the same page at once; the other one won, so merge.
        existing = Patient.objects.filter(file_number=file_number).first()
        if existing is None:
            raise
        return _merge_into(existing, fields, user, notes, matched_on="file_number")


def _merge_into(existing, fields, user, notes, matched_on):
    """Fill the blanks on a record that is already there, and nothing else."""
    before = existing.snapshot()
    filled = []

    for field, value in fields.items():
        current = getattr(existing, field)
        empty = current in ("", None, [], {}) or (
            isinstance(current, dict) and not any(current.values())
        )
        if empty and value not in ("", None, [], {}):
            setattr(existing, field, value)
            filled.append(field)

    existing.updated_by = user
    existing.updated_at = timezone.now()
    if filled:
        existing.needs_review = True
    existing.save()

    if filled:
        PatientRecordVersion.objects.create(
            patient=existing,
            snapshot=before,
            changed_fields=filled,
            note="Blanks filled from a newly uploaded file.",
            edited_by=user,
            edited_by_name=user.full_name,
            edited_by_id_text=user.user_id,
        )
        notes.append(
            f"This patient was already on the system, recognised by the "
            f"{'ID number' if matched_on == 'id_number' else 'file number'}. Only the blank "
            f"fields were filled; nothing a doctor had already confirmed was changed."
        )
    else:
        notes.append(
            f"This patient was already on the system, recognised by the "
            f"{'ID number' if matched_on == 'id_number' else 'file number'}, and nothing was "
            f"blank. The record was left as it is and the document attached to it."
        )

    return {
        "status": "merged",
        "patient": existing,
        "note": " ".join(notes),
        "matched_on": matched_on,
    }


# ---------------------------------------------------------------- files

@require_GET
def list_files(request):
    """What is on the system, newest first."""
    blocked = _guard(request)
    if blocked:
        return blocked

    limit = min(int(request.GET.get("limit") or 25), 100)
    documents = PatientFile.objects.select_related("patient", "uploaded_by")[:limit]

    return JsonResponse({
        "results": [describe_file(d) for d in documents],
        "total": PatientFile.objects.count(),
        "can": permissions_for(request.user),
    })


SAFE_NAME = re.compile(r'[^A-Za-z0-9._ -]')


@require_GET
def download_file(request, file_id):
    """
    Hand the original document back.

    The bytes come through Django rather than as a redirect, so the storage URL
    never reaches the browser and this role check is the only way in. Add
    ?inline=1 to view it in the page instead of saving it.
    """
    blocked = _guard(request, may_view, "download patient files")
    if blocked:
        return blocked

    document = PatientFile.objects.filter(id=file_id).first()
    if not document:
        return JsonResponse({"detail": "No such file."}, status=404)

    raw, problem = cloud.fetch(document.cloud_url)
    if raw is None:
        return JsonResponse({"detail": problem}, status=502)

    name = SAFE_NAME.sub("_", document.original_name) or "patient-file"
    disposition = "inline" if request.GET.get("inline") else "attachment"

    response = HttpResponse(raw, content_type=document.content_type or "application/octet-stream")
    response["Content-Disposition"] = f'{disposition}; filename="{name}"'
    response["Content-Length"] = str(len(raw))
    # A patient file has no business sitting in a shared cache.
    response["Cache-Control"] = "private, no-store"
    return response