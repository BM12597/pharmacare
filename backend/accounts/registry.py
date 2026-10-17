"""
Keeping the models that get trained, and choosing which one is live.

Before this existed, the research workspace trained a model, printed its
scores and threw the model away. Anybody reading the page could see that the
numbers were good and had no way to make the prescribing side use it.

A run is now written to disk as one bundle holding everything needed to use
it again:

  model          the fitted estimator
  graph          who interacts with whom, from the file it was trained on
  canonical      lowercase name -> the spelling the model expects
  desc_map       documented pairs and their description, if the file had one
  feature_order  the columns the estimator wants, in order

Promoting a bundle points the prescribing check at it. The previous live one
is retired rather than deleted, so a promotion can be undone by promoting the
old one back.
"""

import logging
import uuid

from django.utils import timezone

from .models import TrainedModel, registry_dir

logger = logging.getLogger(__name__)

BUNDLE_VERSION = 1


def save_bundle(payload):
    """Write a bundle and return (filename, size in bytes)."""
    import joblib

    name = f"{uuid.uuid4().hex}.joblib"
    path = registry_dir() / name

    joblib.dump({"version": BUNDLE_VERSION, **payload}, path, compress=3)
    return name, path.stat().st_size


def record(*, name, task, algorithm, result, dataset_name, dataset_rows,
           user=None, bundle=None, graph_stats=None):
    """Write one training run to the registry."""
    bundle_name, bundle_bytes = ("", 0)
    if bundle is not None:
        try:
            bundle_name, bundle_bytes = save_bundle(bundle)
        except Exception:
            # The run still deserves to be recorded even if the bundle could
            # not be written; it just cannot be promoted.
            logger.exception("Could not write the model bundle")

    return TrainedModel.objects.create(
        name=name[:160],
        task=task,
        algorithm=algorithm,
        dataset_name=(dataset_name or "")[:200],
        dataset_rows=dataset_rows or 0,
        target=(result.get("target") or "")[:120],
        classes=result.get("classes") or [],
        features=(result.get("features_used") or {}).get("numeric", [])
                 + (result.get("features_used") or {}).get("categorical", []),
        rows_trained=result.get("rows_trained") or 0,
        rows_tested=result.get("rows_tested") or 0,
        metrics=result.get("models") or {},
        graph=graph_stats or {},
        warnings=result.get("warnings") or [],
        bundle_name=bundle_name,
        bundle_bytes=bundle_bytes,
        trained_by=user if getattr(user, "is_authenticated", False) else None,
        trained_by_name=(
            getattr(user, "full_name", "") or getattr(user, "user_id", "")
            if user is not None else ""
        ),
    )


def next_run_name(task):
    """'Pair model 4', so a list of runs reads in order."""
    stem = "Pair model" if task == TrainedModel.Task.PAIRS else "Tabular model"
    count = TrainedModel.objects.filter(task=task).count() + 1
    return f"{stem} {count}"


# ---------------------------------------------------------------- live model

def live():
    return TrainedModel.objects.filter(status=TrainedModel.Status.LIVE).first()


def live_bundle_path():
    """The path the screening code should load, or None for the shipped .pkl files."""
    current = live()
    if current is None or not current.bundle_name:
        return None

    path = current.bundle_path
    return path if path and path.exists() else None


def promote(model, user=None):
    """Make this the model the prescribing side uses."""
    if not model.can_promote:
        raise ValueError(
            "Only a drug pair model can take over the prescribing check. A tabular "
            "run predicts whichever column was chosen, which is a different question."
        )

    if model.bundle_path is None or not model.bundle_path.exists():
        raise ValueError("The saved model file is missing, so it cannot be promoted.")

    TrainedModel.objects.filter(status=TrainedModel.Status.LIVE).exclude(pk=model.pk).update(
        status=TrainedModel.Status.RETIRED
    )

    model.status = TrainedModel.Status.LIVE
    model.promoted_at = timezone.now()
    model.promoted_by_name = (
        getattr(user, "full_name", "") or getattr(user, "user_id", "") if user else ""
    )
    model.save(update_fields=["status", "promoted_at", "promoted_by_name"])

    _reset_screening()
    return model


def retire(model):
    """Step back to the shipped models."""
    model.status = TrainedModel.Status.RETIRED
    model.save(update_fields=["status"])
    _reset_screening()
    return model


def remove(model):
    """Delete a run and its file. The live model is not removable."""
    if model.status == TrainedModel.Status.LIVE:
        raise ValueError("Retire this model before deleting it.")

    path = model.bundle_path
    if path is not None and path.exists():
        try:
            path.unlink()
        except OSError:
            logger.warning("Could not delete %s", path)

    model.delete()


def _reset_screening():
    """Drop the loaded models so the next check picks up the change."""
    from . import ddi

    ddi.reset()


# ---------------------------------------------------------------- shaping

def describe(model):
    scores = (model.metrics.get(model.algorithm) or {}).get("metrics") or {}

    return {
        "id": model.id,
        "name": model.name,
        "task": model.task,
        "task_label": model.get_task_display(),
        "algorithm": model.algorithm,
        "dataset": model.dataset_name,
        "dataset_rows": model.dataset_rows,
        "target": model.target,
        "rows_trained": model.rows_trained,
        "rows_tested": model.rows_tested,
        "accuracy": scores.get("accuracy"),
        "f1": scores.get("f1"),
        "roc_auc": scores.get("roc_auc"),
        "graph": model.graph,
        "warnings": model.warnings,
        "status": model.status,
        "status_label": model.get_status_display(),
        "can_promote": model.can_promote,
        "saved": bool(model.bundle_name),
        "size_mb": round(model.bundle_bytes / (1024 * 1024), 2) if model.bundle_bytes else 0,
        "trained_by": model.trained_by_name,
        "trained_at": model.trained_at.isoformat(),
        "promoted_at": model.promoted_at.isoformat() if model.promoted_at else None,
        "promoted_by": model.promoted_by_name,
    }