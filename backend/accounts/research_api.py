"""
Endpoints for the research workspace.

The uploaded file is not kept on the server between the two calls. The browser
holds it and sends it again when training starts, which means no half-finished
uploads accumulate in a temp folder and no session state to expire. Datasets
here are research data, not patient files.

What does get kept is the result: every training run is written to the model
registry with its scores, and one of them can be promoted to the model the
prescribing side uses. The review queue and the shared settings live here too,
since both decide what the server does rather than how a page looks.
"""

import json

import pandas as pd
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from . import ddi, registry, research, review
from .models import ResearchSettings, ReviewItem, Role, TrainedModel

MAX_UPLOAD_BYTES = 25 * 1024 * 1024


def _allowed(user):
    return user.role == Role.RESEARCHER or user.is_superuser


def _guard(request):
    """Returns an error response when this request may not run, else None."""
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Not signed in."}, status=401)
    if not _allowed(request.user):
        return JsonResponse({"detail": "This account cannot run research jobs."}, status=403)
    return None


def _body(request):
    try:
        return json.loads(request.body or "{}"), None
    except json.JSONDecodeError:
        return None, JsonResponse({"detail": "Send the request as JSON."}, status=400)


def _read_upload(request):
    """Returns (frame, error_response)."""
    upload = request.FILES.get("file")
    if not upload:
        return None, JsonResponse({"detail": "No file was attached."}, status=400)

    if upload.size > MAX_UPLOAD_BYTES:
        return None, JsonResponse(
            {"detail": "That file is over the 25 MB limit. Trim the columns you do not need."},
            status=400,
        )

    try:
        frame = research.read_csv(upload.read(), upload.name)
    except Exception:
        return None, JsonResponse(
            {"detail": "The file could not be read. Save it as CSV and try again."},
            status=400,
        )

    if frame.empty or frame.shape[1] < 2:
        return None, JsonResponse(
            {"detail": "The file needs at least two columns and one row of data."},
            status=400,
        )

    return frame, None


@require_POST
def profile_dataset(request):
    """First pass: what is in the file, and what should we predict."""
    blocked = _guard(request)
    if blocked:
        return blocked

    frame, error = _read_upload(request)
    if error:
        return error

    result = research.profile(frame)
    result["filename"] = request.FILES["file"].name
    return JsonResponse(result)


def _description_column(frame, left, right):
    """
    The column holding the sentence that describes an interaction.

    Picked as the longest text column that is not one of the two drug columns.
    If there isn't one, a promoted model can still predict; it just has no
    dataset wording to quote back.
    """
    best, longest = None, 0

    for name in frame.columns:
        if name in (left, right) or pd.api.types.is_numeric_dtype(frame[name]):
            continue
        average = frame[name].astype(str).str.len().mean()
        if average > longest and average >= 40:
            best, longest = name, average

    return best


@require_POST
def train_model(request):
    """Second pass: train, score, keep the model and return the charts."""
    blocked = _guard(request)
    if blocked:
        return blocked

    frame, error = _read_upload(request)
    if error:
        return error

    filename = request.FILES["file"].name
    config = ResearchSettings.load()

    # A file that only lists interacting pairs has no label column. Build one
    # by generating negative pairs and describing each pair by its position in
    # the interaction graph, then train on that.
    pair_left = (request.POST.get("pair_left") or "").strip()
    pair_right = (request.POST.get("pair_right") or "").strip()

    if pair_left and pair_right:
        return _train_pairs(request, frame, filename, pair_left, pair_right, config)

    target = (request.POST.get("target") or "").strip()
    if not target:
        return JsonResponse({"detail": "Choose the column to predict."}, status=400)
    if target not in frame.columns:
        return JsonResponse({"detail": f"'{target}' is not a column in this file."}, status=400)

    try:
        features = json.loads(request.POST.get("features") or "[]")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "The feature list was malformed."}, status=400)

    features = [f for f in features if f in frame.columns and f != target]
    if not features:
        return JsonResponse({"detail": "Choose at least one feature to train on."}, status=400)

    try:
        test_size = float(request.POST.get("test_size") or config.test_size)
    except ValueError:
        test_size = config.test_size
    test_size = min(max(test_size, 0.1), 0.4)

    try:
        result = research.train(frame, target, features, test_size=test_size)
    except ValueError as error:
        # These are the messages meant for the researcher, so pass them through.
        return JsonResponse({"detail": str(error)}, status=400)
    except Exception:
        return JsonResponse(
            {"detail": "Training failed on this dataset. Check for a column that is "
                       "entirely empty, or a label with only one value."},
            status=400,
        )

    fitted = result.pop("_fitted", {})

    if not config.warn_leakage:
        result["warnings"] = []

    saved = registry.record(
        name=registry.next_run_name(TrainedModel.Task.TABULAR),
        task=TrainedModel.Task.TABULAR,
        algorithm=result.get("best_model") or "lightgbm",
        result=result,
        dataset_name=filename,
        dataset_rows=int(len(frame)),
        user=request.user,
        # A tabular run cannot take over the prescribing check, so there is
        # nothing to be gained by writing 40 MB of model to disk for it. The
        # scores are the point, and those are in the row.
        bundle=None,
    )

    result["saved_as"] = registry.describe(saved)
    return JsonResponse(result)


def _train_pairs(request, frame, filename, pair_left, pair_right, config):
    if pair_left not in frame.columns or pair_right not in frame.columns:
        return JsonResponse({"detail": "Those two columns are not in this file."}, status=400)

    try:
        ratio = float(request.POST.get("negative_ratio") or 1.0)
    except ValueError:
        ratio = 1.0
    ratio = min(max(ratio, 0.25), 3.0)

    description = _description_column(frame, pair_left, pair_right)

    try:
        built, graph_stats, parts = research.build_from_pairs(
            frame, pair_left, pair_right, negative_ratio=ratio, description=description
        )
    except ValueError as error:
        return JsonResponse({"detail": str(error)}, status=400)
    except Exception:
        return JsonResponse(
            {"detail": "The interaction graph could not be built from those two columns."},
            status=400,
        )

    try:
        result = research.train(built, "interaction", research.PAIR_FEATURES,
                                test_size=config.test_size)
    except ValueError as error:
        return JsonResponse({"detail": str(error)}, status=400)

    fitted = result.pop("_fitted", {})

    result["graph"] = graph_stats
    result["built_from_pairs"] = {
        "left": pair_left, "right": pair_right,
        "negative_ratio": ratio, "description_column": description,
    }

    if config.warn_leakage:
        result["warnings"] = result.get("warnings", []) + [
            "Negative pairs were generated by sampling drug combinations that are not in the "
            "file. Any real interaction missing from the dataset would be sampled as a negative, "
            "so the scores are an optimistic estimate."
        ]
    else:
        result["warnings"] = []

    # LightGBM is the one the prescribing side can use: it takes the drug
    # names as categories, which is how the shipped model works.
    saved = registry.record(
        name=registry.next_run_name(TrainedModel.Task.PAIRS),
        task=TrainedModel.Task.PAIRS,
        algorithm="lightgbm",
        result=result,
        dataset_name=filename,
        dataset_rows=int(len(frame)),
        user=request.user,
        graph_stats=graph_stats,
        bundle={
            "model": fitted.get("lightgbm"),
            "graph": parts["graph"],
            "canonical": parts["canonical"],
            "desc_map": parts["desc_map"],
            "feature_order": research.PAIR_FEATURES,
            "trained_from": filename,
        } if fitted.get("lightgbm") is not None else None,
    )

    result["saved_as"] = registry.describe(saved)
    return JsonResponse(result)


# ======================================================================
# The review queue
# ======================================================================

@require_GET
def list_reviews(request):
    """Everything waiting, and what has already been decided."""
    blocked = _guard(request)
    if blocked:
        return blocked

    status = (request.GET.get("status") or "waiting").strip()
    search = (request.GET.get("q") or "").strip().lower()

    items = ReviewItem.objects.all()
    if status in {ReviewItem.Status.WAITING, ReviewItem.Status.CONFIRMED, ReviewItem.Status.REJECTED}:
        items = items.filter(status=status)

    if search:
        items = [
            item for item in items
            if search in item.drug_a.lower() or search in item.drug_b.lower()
        ]

    rows = [review.describe(item) for item in items[:400]]

    return JsonResponse({
        "items": rows,
        "counts": {
            "waiting": ReviewItem.objects.filter(status=ReviewItem.Status.WAITING).count(),
            "confirmed": ReviewItem.objects.filter(status=ReviewItem.Status.CONFIRMED).count(),
            "rejected": ReviewItem.objects.filter(status=ReviewItem.Status.REJECTED).count(),
        },
        "threshold": ResearchSettings.load().review_threshold,
    })


@require_POST
def decide_review(request, item_id):
    """Confirm or reject a pair. Later screening runs use the answer."""
    blocked = _guard(request)
    if blocked:
        return blocked

    data, bad = _body(request)
    if bad:
        return bad

    decision = (data.get("decision") or "").strip()
    if decision not in {ReviewItem.Status.CONFIRMED, ReviewItem.Status.REJECTED,
                        ReviewItem.Status.WAITING}:
        return JsonResponse(
            {"detail": "Send a decision of 'confirmed', 'rejected' or 'waiting'."},
            status=400,
        )

    with transaction.atomic():
        item = ReviewItem.objects.select_for_update().filter(pk=item_id).first()
        if item is None:
            return JsonResponse({"detail": "That pair is not in the queue."}, status=404)

        if decision == ReviewItem.Status.WAITING:
            # Putting one back is allowed: a decision made in error should be
            # undoable without deleting the record of the pair.
            item.status = ReviewItem.Status.WAITING
            item.decided_by = None
            item.decided_by_name = ""
            item.decided_at = None
            item.decision_note = ""
            item.save(update_fields=[
                "status", "decided_by", "decided_by_name", "decided_at", "decision_note",
            ])
        else:
            item.decide(decision, user=request.user, note=data.get("note", ""))

    return JsonResponse({"item": review.describe(item)})


@require_POST
def raise_review(request):
    """
    Send a pair for review from anywhere in the hospital.

    A doctor or pharmacist who thinks the system has a pair wrong can say so
    here, and it lands in the same queue as the model's own uncertain calls.
    """
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Not signed in."}, status=401)

    if request.user.role not in {Role.DOCTOR, Role.PHARMACIST, Role.RESEARCHER} \
            and not request.user.is_superuser:
        return JsonResponse({"detail": "This account cannot raise a review."}, status=403)

    data, bad = _body(request)
    if bad:
        return bad

    drug_a = str(data.get("drug_a") or "").strip()
    drug_b = str(data.get("drug_b") or "").strip()

    if not drug_a or not drug_b:
        return JsonResponse({"detail": "Name both drugs."}, status=400)
    if drug_a.lower() == drug_b.lower():
        return JsonResponse({"detail": "That is the same drug twice."}, status=400)

    item = review.raise_pair(
        drug_a, drug_b,
        probability=data.get("probability"),
        source=ReviewItem.Source.STAFF,
        user=request.user,
        context=str(data.get("context") or "")[:120],
        note=str(data.get("note") or "")[:2000],
    )

    if item is None:
        return JsonResponse({"detail": "That pair could not be queued."}, status=400)

    return JsonResponse({"item": review.describe(item)}, status=201)


# ======================================================================
# The model registry
# ======================================================================

@require_GET
def list_models(request):
    blocked = _guard(request)
    if blocked:
        return blocked

    rows = [registry.describe(model) for model in TrainedModel.objects.all()[:200]]
    live = registry.live()

    return JsonResponse({
        "models": rows,
        "live": registry.describe(live) if live else None,
        "screening_source": ddi.source(),
        "shipped_installed": ddi._shipped_present(),
    })


@require_POST
def promote_model(request, model_id):
    """Point the prescribing check at this model."""
    blocked = _guard(request)
    if blocked:
        return blocked

    model = TrainedModel.objects.filter(pk=model_id).first()
    if model is None:
        return JsonResponse({"detail": "No model with that id."}, status=404)

    try:
        registry.promote(model, user=request.user)
    except ValueError as error:
        return JsonResponse({"detail": str(error)}, status=409)

    return JsonResponse({"model": registry.describe(model), "screening_source": ddi.source()})


@require_POST
def retire_model(request, model_id):
    """Step back to whatever was shipped with the system."""
    blocked = _guard(request)
    if blocked:
        return blocked

    model = TrainedModel.objects.filter(pk=model_id).first()
    if model is None:
        return JsonResponse({"detail": "No model with that id."}, status=404)

    registry.retire(model)
    return JsonResponse({"model": registry.describe(model), "screening_source": ddi.source()})


@require_POST
def delete_model(request, model_id):
    blocked = _guard(request)
    if blocked:
        return blocked

    model = TrainedModel.objects.filter(pk=model_id).first()
    if model is None:
        return JsonResponse({"detail": "No model with that id."}, status=404)

    try:
        registry.remove(model)
    except ValueError as error:
        return JsonResponse({"detail": str(error)}, status=409)

    return JsonResponse({"deleted": True})


# ======================================================================
# Settings
# ======================================================================

@require_GET
def get_settings(request):
    blocked = _guard(request)
    if blocked:
        return blocked

    config = ResearchSettings.load()
    return JsonResponse(_settings_shape(config))


@require_POST
def save_settings(request):
    blocked = _guard(request)
    if blocked:
        return blocked

    data, bad = _body(request)
    if bad:
        return bad

    config = ResearchSettings.load()

    try:
        threshold = int(data.get("review_threshold", config.review_threshold))
    except (TypeError, ValueError):
        return JsonResponse({"detail": "The review threshold must be a number."}, status=400)

    try:
        test_size = float(data.get("test_size", config.test_size))
    except (TypeError, ValueError):
        return JsonResponse({"detail": "The test set size must be a number."}, status=400)

    config.review_threshold = min(max(threshold, 50), 95)
    config.test_size = min(max(test_size, 0.1), 0.4)
    config.warn_leakage = bool(data.get("warn_leakage", config.warn_leakage))
    config.auto_raise = bool(data.get("auto_raise", config.auto_raise))
    config.updated_by_name = request.user.full_name or request.user.user_id
    config.save()

    return JsonResponse(_settings_shape(config))


def _settings_shape(config):
    return {
        "review_threshold": config.review_threshold,
        "test_size": config.test_size,
        "warn_leakage": config.warn_leakage,
        "auto_raise": config.auto_raise,
        "updated_at": config.updated_at.isoformat() if config.updated_at else None,
        "updated_by": config.updated_by_name,
    }