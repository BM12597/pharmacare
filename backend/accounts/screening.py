"""
Second opinion on a prescription.

The browser never sees the Anthropic key. It posts the script here, Django
calls the API, and only the result goes back. That also means the key can be
rotated without touching the frontend.

This is decision support. The rule-based screening in the workspace is the
primary check; this adds anything the rule table does not cover yet.
"""

import json
import os
import urllib.error
import urllib.request

from django.http import JsonResponse
from django.views.decorators.http import require_POST

from . import ddi, review
from .models import Role

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5")
TIMEOUT_SECONDS = 30

SYSTEM_PROMPT = """You are a clinical pharmacology reference used inside a \
hospital prescribing system in South Africa. A qualified prescriber has \
entered a prescription and wants a check on the combination.

Report only clinically meaningful problems: drug-drug interactions, a drug \
against a condition on the file, a drug against a recorded allergy, or a dose \
that is wrong for the patient's age or kidney function. Say nothing about \
theoretical interactions that would not change what the prescriber does.

Reply with JSON only. No markdown, no code fences, no preamble:

{
  "summary": "one sentence, or an empty string if there is nothing to raise",
  "findings": [
    {
      "title": "Drug A + Drug B",
      "severity": "severe" | "moderate" | "mild",
      "what": "what happens, in one or two plain sentences",
      "action": "what the prescriber should do about it"
    }
  ]
}

Return an empty findings array when the combination is reasonable. Write for a \
doctor: direct, specific, no hedging and no disclaimers. The interface adds \
its own."""


def _payload_for(data):
    patient = data.get("patient") or {}
    drugs = data.get("drugs") or []

    lines = ["Prescription:"]
    for item in drugs:
        parts = [item.get("drug", "")]
        if item.get("dose"):
            parts.append(item["dose"])
        if item.get("frequency"):
            parts.append(item["frequency"])
        lines.append("- " + " ".join(p for p in parts if p))

    if patient:
        lines.append("")
        lines.append("Patient:")
        lines.append(f"- Age {patient.get('age', 'unknown')}, {patient.get('sex', 'unknown')}")
        for label, key in [
            ("Conditions on file", "conditions"),
            ("Already taking", "current_medication"),
            ("Allergies", "allergies"),
        ]:
            values = patient.get(key) or []
            lines.append(f"- {label}: {', '.join(values) if values else 'none recorded'}")
    else:
        lines.append("")
        lines.append("No patient file was loaded, so check the drugs against each other only.")

    return "\n".join(lines)


@require_POST
def second_opinion(request):
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Not signed in."}, status=401)

    # Prescribers and pharmacists both have a legitimate reason to run this.
    if request.user.role not in {Role.DOCTOR, Role.PHARMACIST} and not request.user.is_superuser:
        return JsonResponse({"detail": "This account cannot run a screening check."}, status=403)

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        return JsonResponse(
            {"detail": "No API key is configured on the server. Add ANTHROPIC_API_KEY to .env."},
            status=503,
        )

    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "Send the request as JSON."}, status=400)

    if not data.get("drugs"):
        return JsonResponse({"detail": "Add at least one medicine first."}, status=400)

    body = json.dumps({
        "model": MODEL,
        "max_tokens": 1200,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": _payload_for(data)}],
    }).encode()

    api_request = urllib.request.Request(
        ANTHROPIC_URL,
        data=body,
        headers={
            "content-type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
    )

    try:
        with urllib.request.urlopen(api_request, timeout=TIMEOUT_SECONDS) as response:
            result = json.loads(response.read())
    except urllib.error.HTTPError as error:
        # Never pass the upstream body back — it can contain the request we sent.
        status = 502 if error.code >= 500 else 400
        return JsonResponse(
            {"detail": f"The screening service returned an error ({error.code})."},
            status=status,
        )
    except Exception:
        return JsonResponse(
            {"detail": "The screening service did not respond. The rule checks still apply."},
            status=504,
        )

    text = "".join(
        block.get("text", "")
        for block in result.get("content", [])
        if block.get("type") == "text"
    ).strip()

    # Strip fences if the model adds them despite being told not to.
    if text.startswith("```"):
        text = text.strip("`")
        text = text.split("\n", 1)[-1] if "\n" in text else text
        if text.startswith("json"):
            text = text[4:]

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        # Still useful to the prescriber, just unstructured.
        return JsonResponse({"summary": text, "findings": []})

    findings = [
        {
            "title": str(item.get("title", ""))[:120],
            "severity": item.get("severity") if item.get("severity") in {"severe", "moderate", "mild"} else "moderate",
            "what": str(item.get("what", ""))[:600],
            "action": str(item.get("action", ""))[:600],
        }
        for item in (parsed.get("findings") or [])
        if isinstance(item, dict)
    ]

    return JsonResponse({"summary": str(parsed.get("summary", ""))[:400], "findings": findings})


# ======================================================================
# The trained models
# ======================================================================

def _may_screen(user):
    return user.role in {Role.DOCTOR, Role.PHARMACIST, Role.RESEARCHER} or user.is_superuser


@require_POST
def screen_prescription(request):
    """
    Check every pair in a prescription against the trained models.

    Returns documented interactions from the dataset, predictions for pairs
    that are not documented, and an explicit unrecognised result for any name
    the dataset does not contain.
    """
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Not signed in."}, status=401)
    if not _may_screen(request.user):
        return JsonResponse({"detail": "This account cannot run a screening check."}, status=403)

    if not ddi.is_ready():
        return JsonResponse(
            {"detail": "The interaction models are not installed on this server. "
                       "Copy the .pkl files from build_pipeline.py into backend/models/."},
            status=503,
        )

    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "Send the request as JSON."}, status=400)

    drugs = [str(d) for d in (data.get("drugs") or []) if str(d).strip()]

    if len(drugs) < 2:
        return JsonResponse({"detail": "Two or more medicines are needed to check a pair."}, status=400)
    if len(drugs) > 25:
        return JsonResponse({"detail": "That is more than 25 medicines on one script."}, status=400)

    try:
        # Decisions a reviewer has already made are applied in place of the
        # model's guess, and anything still uncertain goes to the queue.
        return JsonResponse(review.screen_and_review(
            drugs, user=request.user, context="screening check"
        ))
    except FileNotFoundError as error:
        return JsonResponse({"detail": str(error)}, status=503)
    except Exception:
        return JsonResponse({"detail": "The screening check failed."}, status=500)


def drug_lookup(request):
    """Type-ahead for the prescribing form, so names match the dataset."""
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Not signed in."}, status=401)
    if not ddi.is_ready():
        return JsonResponse({"results": []})

    query = (request.GET.get("q") or "").strip()
    if len(query) < 2:
        return JsonResponse({"results": []})

    try:
        return JsonResponse({"results": ddi.suggest(query, limit=12)})
    except Exception:
        return JsonResponse({"results": []})