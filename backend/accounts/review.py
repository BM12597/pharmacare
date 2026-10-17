"""
The review queue, and what a decision in it does.

The loop this closes:

  1. A screening run produces a prediction the model is not confident about —
     somewhere in the middle of the scale rather than near either end.
  2. That pair is written to the queue instead of being shown as a result and
     forgotten.
  3. A researcher confirms or rejects it.
  4. Every later screening run uses that decision in place of the model's
     guess, and says so.

Step 4 is the part that matters. A review queue nobody's answers feed back
into is a list of homework.
"""

import logging

from django.utils import timezone

from .models import ResearchSettings, ReviewItem, pair_key

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------- raising

def confidence_of(probability):
    """
    How sure the model is, regardless of which way it went.

    A 4% chance of an interaction is a confident "no". A 52% chance is not a
    confident anything, which is exactly what the queue is for.
    """
    if probability is None:
        return None
    return max(probability, 1.0 - probability)


def _label(probability):
    if probability is None:
        return "unknown"
    return "interaction" if probability >= 0.5 else "no interaction"


def raise_pair(drug_a, drug_b, probability=None, source=ReviewItem.Source.MODEL,
               user=None, context="", note=""):
    """
    Put a pair in the queue, or note that it has come up again.

    A pair already decided is left alone. Re-raising it would quietly reopen a
    question somebody has already answered, and the answer is meant to stick
    until a person changes it.
    """
    key = pair_key(drug_a, drug_b)
    if not key or "|" not in key or key.startswith("|") or key.endswith("|"):
        return None

    existing = ReviewItem.objects.filter(key=key).first()

    if existing is not None:
        if existing.status != ReviewItem.Status.WAITING:
            return existing

        existing.times_seen += 1
        fields = ["times_seen", "last_seen_at"]

        # Keep the least confident sighting: that is the one worth answering.
        new_confidence = confidence_of(probability)
        if new_confidence is not None and (
            existing.confidence is None or new_confidence < existing.confidence
        ):
            existing.confidence = new_confidence
            existing.probability = probability
            existing.prediction = _label(probability)
            fields += ["confidence", "probability", "prediction"]

        # A person raising a pair the model also raised outranks the model.
        if source == ReviewItem.Source.STAFF and existing.source != ReviewItem.Source.STAFF:
            existing.source = ReviewItem.Source.STAFF
            existing.raised_by = user
            existing.raised_by_name = _name(user)
            existing.note = (note or existing.note)[:2000]
            fields += ["source", "raised_by", "raised_by_name", "note"]

        existing.save(update_fields=fields)
        return existing

    left, right = sorted([(drug_a or "").strip(), (drug_b or "").strip()], key=str.lower)

    return ReviewItem.objects.create(
        key=key,
        drug_a=left[:150],
        drug_b=right[:150],
        confidence=confidence_of(probability),
        probability=probability,
        prediction=_label(probability),
        source=source,
        raised_by=user,
        raised_by_name=_name(user),
        context=(context or "")[:120],
        note=(note or "")[:2000],
    )


def _name(user):
    if user is None or not getattr(user, "is_authenticated", False):
        return ""
    return getattr(user, "full_name", "") or getattr(user, "user_id", "")


def raise_from_screen(screened, user=None, context=""):
    """
    Walk a ddi.screen() result and queue anything the model was unsure about.

    Only predictions are considered. A documented pair is not a guess, and an
    unrecognised name is a gap in the dataset rather than a question about two
    drugs — a different problem with a different fix.
    """
    config = ResearchSettings.load()
    if not config.auto_raise:
        return []

    cutoff = max(min(config.review_threshold, 99), 50) / 100.0
    raised = []

    for found in list(screened.get("findings") or []) + list(screened.get("clear") or []):
        if found.get("source") != "predicted":
            continue

        probability = found.get("probability")
        certainty = confidence_of(probability)
        if certainty is None or certainty >= cutoff:
            continue

        try:
            item = raise_pair(
                found.get("drug_a"), found.get("drug_b"),
                probability=probability, context=context, user=None,
            )
        except Exception:
            # A prescription must never fail because the queue did.
            logger.exception("Could not queue %s + %s", found.get("drug_a"), found.get("drug_b"))
            continue

        if item is not None:
            raised.append(item)

    return raised


# ---------------------------------------------------------------- applying

def decisions():
    """Every pair a person has ruled on, as {key: status}."""
    return dict(
        ReviewItem.objects
        .exclude(status=ReviewItem.Status.WAITING)
        .values_list("key", "status")
    )


REVIEWED_NOTE = {
    ReviewItem.Status.CONFIRMED: (
        "Confirmed as a real interaction by a reviewer in the research workspace, "
        "so this is not the model's guess."
    ),
    ReviewItem.Status.REJECTED: (
        "Reviewed in the research workspace and ruled not an interaction, so the "
        "model's estimate has been set aside."
    ),
}


def apply_decisions(screened):
    """
    Replace a prediction with the decision a person made about that pair.

    Done here rather than inside the model code, so the model stays a model
    and the override is visible in one place. The result keeps the same shape
    ddi.screen() returns, with 'source' changed to 'reviewed' and a line
    saying who decided what.
    """
    ruled = decisions()
    if not ruled:
        return screened

    moved = 0
    for found in list(screened.get("findings") or []) + list(screened.get("clear") or []):
        if found.get("source") != "predicted":
            continue

        status = ruled.get(pair_key(found.get("drug_a"), found.get("drug_b")))
        if status is None:
            continue

        found["source"] = "reviewed"
        found["reviewed"] = status
        found["description"] = REVIEWED_NOTE[status]
        moved += 1

        if status == ReviewItem.Status.CONFIRMED:
            # A confirmed pair is treated as documented: the reviewer is the
            # evidence. Severity stays moderate unless the queue note says
            # otherwise, because the queue records whether, not how badly.
            found["severity"] = "moderate"
            found["probability"] = 1.0
        else:
            found["severity"] = "clear"
            found["probability"] = 0.0

    if not moved:
        return screened

    # Findings and clears have to be re-sorted, since some have crossed over.
    everything = list(screened.get("findings") or []) + list(screened.get("clear") or [])
    order = {"severe": 0, "moderate": 1, "mild": 2, "unknown": 3, "clear": 4}
    everything.sort(key=lambda r: (order.get(r["severity"], 5), -(r.get("probability") or 0)))

    screened["findings"] = [r for r in everything if r["severity"] != "clear"]
    screened["clear"] = [r for r in everything if r["severity"] == "clear"]
    screened["worst"] = everything[0]["severity"] if everything else "clear"
    screened["reviewed_pairs"] = moved

    return screened


def screen_and_review(drug_names, user=None, context=""):
    """
    The one call the prescribing side should make.

    Screens the drugs, applies anything a reviewer has already decided, and
    queues whatever is still uncertain. Doing it in this order matters: a pair
    that has been decided is never queued again.
    """
    from . import ddi

    screened = apply_decisions(ddi.screen(drug_names))
    raise_from_screen(screened, user=user, context=context)
    return screened


# ---------------------------------------------------------------- shaping

def describe(item):
    return {
        "id": item.id,
        "pair": item.pair,
        "drug_a": item.drug_a,
        "drug_b": item.drug_b,
        "confidence": item.confidence,
        "probability": item.probability,
        "prediction": item.prediction,
        "source": item.source,
        "source_label": (
            item.raised_by_name or item.get_source_display()
            if item.source == ReviewItem.Source.STAFF
            else item.get_source_display()
        ),
        "context": item.context,
        "note": item.note,
        "times_seen": item.times_seen,
        "status": item.status,
        "status_label": item.get_status_display(),
        "decided_by": item.decided_by_name,
        "decided_at": item.decided_at.isoformat() if item.decided_at else None,
        "decision_note": item.decision_note,
        "created_at": item.created_at.isoformat(),
        "age_minutes": int((timezone.now() - item.created_at).total_seconds() // 60),
    }