"""
Reading an uploaded patient file into the digital record.

The job is narrow: turn a scanned or typed patient file into the same set of
fields a doctor would have typed, and be honest about anything it could not
find. It never guesses. A field it cannot read comes back empty, and the whole
record arrives marked as needing a doctor's eye.

How a file is read:

  1. pypdf pulls the text layer out, which is instant and costs nothing.
  2. If there is no real text layer — a photograph of a page, or a scan that
     was never put through OCR — the file itself goes to the model, which
     reads the page as a picture.

Either way the API key stays on the server. The browser only ever sees the
result.
"""

import base64
import datetime
import json
import logging
import os
import re
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5")
TIMEOUT_SECONDS = 120

# Below this much text per page, assume there is no usable text layer and read
# the page as a picture instead. A typed clinical page runs to thousands of
# characters, so this is a long way clear of a false positive.
MIN_CHARS_PER_PAGE = 120

# Anthropic will not take a document much larger than this, and a patient file
# has no business being bigger.
MAX_VISION_BYTES = 18 * 1024 * 1024

SYSTEM_PROMPT = """You read scanned or typed patient files from a South \
African hospital and return their contents as JSON. You are a transcriber, not \
a clinician: copy what the page says and nothing more.

Rules that matter more than completeness:

* Never invent, infer or complete a value. If the page does not state \
something, leave that field empty (empty string, empty list, or null). An \
empty field is correct; a plausible guess is a clinical risk.
* Copy numbers exactly as written, including units where the field asks for \
them.
* Do not translate, tidy up spelling, expand abbreviations or convert units.
* Keep drug names exactly as written on the page, including the strength and \
how often it is taken, each in its own field.
* If the page is not a patient file at all, return {"is_patient_file": false} \
and nothing else.

Return JSON only. No markdown, no code fences, no commentary:

{
  "is_patient_file": true,
  "file_number": "the hospital file or folder number, e.g. DGMH-2026-04812",
  "id_number": "national ID number if shown",
  "full_name": "patient's full name",
  "date_of_birth": "YYYY-MM-DD, or null if not shown",
  "stated_age": 37,
  "sex": "F" | "M" | "O" | "",
  "ward": "ward, clinic or unit",
  "home_area": "suburb or township only, never the street address",
  "address": "street address if shown",
  "language": "language or languages shown",
  "phone": "patient's own contact number",
  "email": "patient's email address if shown",
  "next_of_kin": "name, and the relationship if shown",
  "next_of_kin_phone": "their number",

  "encounter": {
    "date": "YYYY-MM-DD or as written",
    "time": "as written",
    "type": "e.g. walk-in, referral, follow-up",
    "triage": "triage category or colour as written",
    "presenting_complaint": "why the patient came, in the page's own words",
    "referred_by": "clinic, doctor or empty"
  },

  "conditions": ["one per diagnosis or chronic condition on the history"],
  "medication": [
    {"name": "drug name as written", "dose": "e.g. 500 mg", "frequency": "e.g. twice daily"}
  ],
  "allergies": ["one per allergy; use the page's own wording"],
  "history_notes": "surgical, family or social history as a short paragraph",

  "observations": {
    "bp": "e.g. 146/92",
    "pulse": "e.g. 96",
    "temperature": "e.g. 37.1",
    "respiratory_rate": "e.g. 18",
    "spo2": "e.g. 98",
    "weight_kg": "e.g. 78",
    "height_m": "e.g. 1.64",
    "pain_score": "e.g. 6/10"
  },

  "assessment": "the clinical assessment or impression, as written",
  "plan": "the plan and any follow-up, as written",

  "unreadable": ["name any section that was present but could not be read"]
}"""

USER_PROMPT_TEXT = """This is the text of an uploaded patient file. Transcribe \
it into the JSON described. Leave empty anything the page does not state.

---
{text}
---"""

USER_PROMPT_VISION = """This uploaded patient file has no text layer, so read \
the page itself. Transcribe it into the JSON described. Leave empty anything \
the page does not state, and list anything you cannot read clearly under \
"unreadable"."""


# ======================================================================
# Reading the pages
# ======================================================================

def read_pdf(file_bytes):
    """
    Pull the text layer out of a PDF.

    Returns (text, page_count). A PDF that is really a scan comes back with
    almost nothing, which is the signal to read it as a picture instead.
    """
    try:
        from pypdf import PdfReader
    except ImportError:
        return "", None

    import io

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        pages = []
        for page in reader.pages:
            try:
                pages.append(page.extract_text() or "")
            except Exception:
                pages.append("")
        return "\n\n".join(pages).strip(), len(reader.pages)
    except Exception as error:
        logger.warning("Could not read the PDF: %s", error)
        return "", None


def has_usable_text(text, page_count):
    if not text:
        return False
    return len(text) >= MIN_CHARS_PER_PAGE * max(page_count or 1, 1)


# ======================================================================
# Asking the model
# ======================================================================

def _call_anthropic(content, api_key):
    body = json.dumps({
        "model": MODEL,
        "max_tokens": 4000,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": content}],
    }).encode()

    request = urllib.request.Request(
        ANTHROPIC_URL,
        data=body,
        headers={
            "content-type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
    )

    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return json.loads(response.read())


def _text_of(result):
    return "".join(
        block.get("text", "")
        for block in result.get("content", [])
        if block.get("type") == "text"
    ).strip()


def _parse_json(text):
    """The model is told to return bare JSON; this copes if it does not."""
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Last resort: the outermost braces.
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            return None
    return None


def extract(file_bytes, original_name, content_type="", text=None, page_count=None):
    """
    Read one uploaded file.

    ``text`` and ``page_count`` can be passed in when the pages have already
    been read — the upload does that in a separate step so the progress shown
    on screen matches work that has actually finished.

    Always returns a dict. On success:
        {"ok": True, "payload": {...}, "text_chars": n,
         "page_count": n, "read_as_image": bool}
    On failure:
        {"ok": False, "detail": "something the person can act on", ...}
    """
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        return {
            "ok": False,
            "detail": "No API key is configured on the server. Add ANTHROPIC_API_KEY to .env "
                      "and restart the server.",
            "text_chars": 0,
            "page_count": None,
            "read_as_image": False,
        }

    lower_type = (content_type or "").lower()
    is_pdf = lower_type == "application/pdf" or original_name.lower().endswith(".pdf")
    is_image = lower_type in {"image/png", "image/jpeg", "image/jpg", "image/webp"}

    if text is None:
        text, page_count = read_pdf(file_bytes) if is_pdf else ("", page_count)

    text = text or ""
    read_as_image = False

    if is_pdf and has_usable_text(text, page_count):
        content = [{"type": "text", "text": USER_PROMPT_TEXT.format(text=text[:120000])}]

    elif is_pdf or is_image:
        # No text worth using, so the page goes up as a picture.
        if len(file_bytes) > MAX_VISION_BYTES:
            return {
                "ok": False,
                "detail": "This file has no text layer and is too large to read as a picture. "
                          "Save it as a smaller PDF, or one page at a time.",
                "text_chars": len(text),
                "page_count": page_count,
                "read_as_image": False,
            }

        read_as_image = True
        encoded = base64.b64encode(file_bytes).decode()

        block = (
            {
                "type": "document",
                "source": {"type": "base64", "media_type": "application/pdf", "data": encoded},
            }
            if is_pdf
            else {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg" if lower_type in {"image/jpg", "image/jpeg"} else lower_type,
                    "data": encoded,
                },
            }
        )
        content = [block, {"type": "text", "text": USER_PROMPT_VISION}]

    else:
        return {
            "ok": False,
            "detail": "Only PDFs and pictures of a page can be read into a record. "
                      "A CSV or spreadsheet is stored but not read.",
            "text_chars": 0,
            "page_count": None,
            "read_as_image": False,
        }

    base = {
        "text_chars": len(text),
        "page_count": page_count,
        "read_as_image": read_as_image,
    }

    try:
        result = _call_anthropic(content, api_key)
    except urllib.error.HTTPError as error:
        # Never pass the upstream body back; it contains the file's contents.
        detail = {
            400: "The file could not be sent for reading. It may be corrupt or password protected.",
            401: "The API key on the server was rejected. Check ANTHROPIC_API_KEY in .env.",
            413: "The file is too large to read. Save it smaller and try again.",
            429: "The reading service is rate limited right now. Try again in a minute.",
        }.get(error.code, f"The reading service returned an error ({error.code}).")
        logger.warning("Extraction failed (%s) for %s", error.code, original_name)
        return {"ok": False, "detail": detail, **base}
    except Exception as error:
        logger.warning("Extraction failed for %s: %s", original_name, error)
        return {
            "ok": False,
            "detail": "The reading service did not respond. The file is stored — try reading it again.",
            **base,
        }

    payload = _parse_json(_text_of(result))

    if payload is None:
        return {
            "ok": False,
            "detail": "The file was read but the result could not be understood. "
                      "Try reading it again, or enter the record by hand.",
            **base,
        }

    if payload.get("is_patient_file") is False:
        return {
            "ok": False,
            "detail": "This does not look like a patient file. It has been stored, "
                      "but no record was created from it.",
            **base,
        }

    return {"ok": True, "payload": payload, **base}


# ======================================================================
# Turning the model's answer into record fields
# ======================================================================

MAX_LIST = 40


def _clean(value, limit=240):
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() in {"null", "none", "n/a", "not stated", "not shown", "unknown"}:
        return ""
    return text[:limit]


def _clean_list(value, limit=120):
    if isinstance(value, str):
        value = [part for part in re.split(r"[;\n]|,(?![^(]*\))", value)]
    if not isinstance(value, list):
        return []

    out = []
    for item in value[:MAX_LIST]:
        text = _clean(item, limit)
        if text and text not in out:
            out.append(text)
    return out


def _clean_date(value):
    """Accepts an ISO date, and the few written forms that turn up on a page."""
    text = _clean(value, 40)
    if not text:
        return None

    patterns = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d %B %Y", "%d %b %Y", "%Y/%m/%d"]
    for pattern in patterns:
        try:
            parsed = datetime.datetime.strptime(text, pattern).date()
        except ValueError:
            continue
        # A date of birth in the future, or before anybody alive, is a misread.
        if datetime.date(1900, 1, 1) <= parsed <= datetime.date.today():
            return parsed
    return None


def _clean_age(value):
    text = _clean(value, 10)
    digits = re.sub(r"[^0-9]", "", text)
    if not digits:
        return None
    age = int(digits[:3])
    return age if 0 <= age < 130 else None


def _clean_medication(value):
    """Each line becomes {name, dose, frequency}, with the name required."""
    if not isinstance(value, list):
        return []

    out = []
    for item in value[:MAX_LIST]:
        if isinstance(item, dict):
            name = _clean(item.get("name"), 120)
            dose = _clean(item.get("dose"), 60)
            frequency = _clean(item.get("frequency"), 60)
        else:
            name, dose, frequency = _clean(item, 120), "", ""

        if name:
            out.append({"name": name, "dose": dose, "frequency": frequency})
    return out


OBSERVATION_KEYS = [
    "bp", "pulse", "temperature", "respiratory_rate",
    "spo2", "weight_kg", "height_m", "pain_score",
]

ENCOUNTER_KEYS = ["date", "time", "type", "triage", "presenting_complaint", "referred_by"]


def normalise(payload):
    """
    The extracted payload as Patient field values.

    Everything is cleaned here rather than trusted, because the next thing that
    reads these fields is the interaction screening.
    """
    sex = _clean(payload.get("sex"), 10).upper()[:1]
    if sex not in {"F", "M", "O"}:
        sex = ""

    encounter = payload.get("encounter") or {}
    observations = payload.get("observations") or {}

    return {
        "file_number": _clean(payload.get("file_number"), 40).upper(),
        "id_number": re.sub(r"[^0-9A-Za-z-]", "", _clean(payload.get("id_number"), 20)),
        "full_name": _clean(payload.get("full_name"), 160),
        "date_of_birth": _clean_date(payload.get("date_of_birth")),
        "stated_age": _clean_age(payload.get("stated_age")),
        "sex": sex,
        "ward": _clean(payload.get("ward"), 80),
        "home_area": _clean(payload.get("home_area"), 120),
        "address": _clean(payload.get("address"), 240),
        "language": _clean(payload.get("language"), 80),
        "phone": _clean(payload.get("phone"), 40),
        "email": _clean(payload.get("email"), 160).lower(),
        "next_of_kin": _clean(payload.get("next_of_kin"), 160),
        "next_of_kin_phone": _clean(payload.get("next_of_kin_phone"), 40),

        "encounter": {key: _clean(encounter.get(key), 600) for key in ENCOUNTER_KEYS},

        "conditions": _clean_list(payload.get("conditions")),
        "medication": _clean_medication(payload.get("medication")),
        "allergies": _clean_list(payload.get("allergies")),
        "history_notes": _clean(payload.get("history_notes"), 4000),

        "observations": {key: _clean(observations.get(key), 40) for key in OBSERVATION_KEYS},

        "assessment": _clean(payload.get("assessment"), 4000),
        "plan": _clean(payload.get("plan"), 4000),
    }


# ======================================================================
# ID numbers
#
# A South African ID number carries its own checks: thirteen digits, the date
# of birth in the first six, and a Luhn check digit at the end. That makes it
# possible to tell a number that was read correctly from one where a digit was
# misread — which matters, because the ID number is what decides whether two
# uploads are the same person.
#
# A number that fails its check is still used for matching. It is better to
# notice a possible duplicate and say the number looks wrong than to ignore
# the field and file the same patient twice.
# ======================================================================

def id_number_facts(value):
    """
    What can be told about an ID number without asking anybody.

    Returns {"digits", "valid", "dob", "detail"}. 'digits' is empty when there
    is nothing usable to match on.
    """
    digits = re.sub(r"[^0-9]", "", str(value or ""))

    if not digits:
        return {"digits": "", "valid": None, "dob": None, "detail": ""}

    # Too short to be an identifier at all — matching on it would be guesswork.
    if len(digits) < 6:
        return {"digits": "", "valid": False, "dob": None,
                "detail": "The ID number on the page was too short to use."}

    if len(digits) != 13:
        return {"digits": digits, "valid": False, "dob": None,
                "detail": f"The ID number read as {len(digits)} digits rather than 13, "
                          f"so it may have been misread."}

    # Date of birth sits in the first six digits as YYMMDD. The century is not
    # stored, so a year that would put the patient in the future is the 1900s.
    dob = None
    try:
        year, month, day = int(digits[0:2]), int(digits[2:4]), int(digits[4:6])
        century = 2000 if year <= (datetime.date.today().year % 100) else 1900
        dob = datetime.date(century + year, month, day)
    except ValueError:
        dob = None

    # Luhn, over the first twelve digits, checked against the thirteenth.
    total = 0
    for index, char in enumerate(reversed(digits[:12])):
        digit = int(char)
        if index % 2 == 0:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit

    expected = (10 - total % 10) % 10
    valid = expected == int(digits[12])

    detail = ""
    if not valid:
        detail = "The ID number does not pass its own check digit, so one of the digits may have been misread."
    elif dob is None:
        detail = "The ID number's check digit is right, but the date inside it is not a real date."

    return {"digits": digits, "valid": valid, "dob": dob, "detail": detail}


def missing_fields(fields):
    """
    What the page did not give us, so the upload can say so plainly instead of
    leaving somebody to notice a blank later.
    """
    gaps = []
    if not fields.get("full_name"):
        gaps.append("patient name")
    if not fields.get("file_number"):
        gaps.append("file number")
    if not fields.get("date_of_birth") and not fields.get("stated_age"):
        gaps.append("age")
    if not fields.get("allergies"):
        gaps.append("allergies")
    if not fields.get("conditions"):
        gaps.append("conditions")
    return gaps