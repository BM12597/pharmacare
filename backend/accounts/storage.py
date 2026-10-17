"""
Real storage figures from Cloudinary.

Patient files and uploads live in Cloudinary rather than on the server, so the
storage gauge in the management portal has to ask Cloudinary rather than guess.

Two things this module is careful about:

  * It never invents a number. If Cloudinary is not configured or cannot be
    reached, it says so and the portal shows a blank gauge rather than a
    reassuring fake one.
  * It caches for a few minutes. The portal polls, and the Cloudinary admin
    API is rate limited to roughly 500 calls an hour on the free plan.
"""

import base64
import json
import logging
import time
import urllib.error
import urllib.request

from django.conf import settings

logger = logging.getLogger(__name__)

CACHE_SECONDS = 300
TIMEOUT_SECONDS = 8

# Cloudinary's free tier is sold in "credits". One credit is 1 GB of storage,
# 1 GB of bandwidth, or 1000 transformations, so a credit limit is not a pure
# storage limit — it is stated as such in the portal.
BYTES_PER_GB = 1024 ** 3

_cache = {"at": 0.0, "data": None}


def _config():
    return (
        getattr(settings, "CLOUDINARY_CLOUD_NAME", "") or "",
        getattr(settings, "CLOUDINARY_API_KEY", "") or "",
        getattr(settings, "CLOUDINARY_API_SECRET", "") or "",
    )


def is_configured():
    return all(_config())


def _api_base():
    # Overridable so the integration can be tested against a stub without
    # reaching out to Cloudinary. Left alone, it is the real API.
    return getattr(settings, "CLOUDINARY_API_BASE", "https://api.cloudinary.com")


def _fetch():
    cloud, key, secret = _config()
    url = f"{_api_base()}/v1_1/{cloud}/usage"

    token = base64.b64encode(f"{key}:{secret}".encode()).decode()
    request = urllib.request.Request(url, headers={"Authorization": f"Basic {token}"})

    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return json.loads(response.read())


def _shape(raw):
    """Turn Cloudinary's response into the few numbers the gauge needs."""
    storage = raw.get("storage") or {}
    credits = raw.get("credits") or {}

    used_bytes = storage.get("usage")
    limit_bytes = storage.get("limit")

    # On credit-based plans the storage section has no limit of its own, so the
    # credit allowance stands in for one.
    credit_limit = credits.get("limit")
    credit_used = credits.get("usage")

    if limit_bytes is None and credit_limit:
        limit_bytes = float(credit_limit) * BYTES_PER_GB

    percent = None
    if used_bytes is not None and limit_bytes:
        percent = round(float(used_bytes) / float(limit_bytes) * 100, 2)
    elif credits.get("used_percent") is not None:
        percent = round(float(credits["used_percent"]), 2)

    return {
        "configured": True,
        "available": True,
        "plan": raw.get("plan"),
        "used_bytes": int(used_bytes) if used_bytes is not None else None,
        "limit_bytes": int(limit_bytes) if limit_bytes else None,
        "used_percent": percent,
        "objects": raw.get("objects", {}).get("usage"),
        "bandwidth_bytes": (raw.get("bandwidth") or {}).get("usage"),
        "credits": {
            "used": credit_used,
            "limit": credit_limit,
            "percent": credits.get("used_percent"),
        } if credits else None,
        # Credits cover storage, bandwidth and transformations together, so the
        # percentage is not purely about files.
        "limit_is_credits": bool(credit_limit) and not (raw.get("storage") or {}).get("limit"),
        "last_updated": raw.get("last_updated"),
    }


def usage(force=False):
    """
    Current Cloudinary usage, or an explanation of why there isn't any.

    Always returns a dict; the caller checks 'available' before drawing.
    """
    if not is_configured():
        return {
            "configured": False,
            "available": False,
            "detail": "Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, "
                      "CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to .env.",
        }

    now = time.time()
    if not force and _cache["data"] and (now - _cache["at"]) < CACHE_SECONDS:
        cached = dict(_cache["data"])
        cached["cached"] = True
        return cached

    try:
        shaped = _shape(_fetch())
    except urllib.error.HTTPError as error:
        detail = ("Cloudinary rejected the credentials." if error.code in (401, 403)
                  else f"Cloudinary returned an error ({error.code}).")
        logger.warning("Cloudinary usage failed: %s", error)
        return {"configured": True, "available": False, "detail": detail}
    except Exception as error:
        logger.warning("Cloudinary usage failed: %s", error)
        return {
            "configured": True,
            "available": False,
            "detail": "Cloudinary could not be reached. Check the connection and try again.",
        }

    _cache["at"] = now
    _cache["data"] = shaped

    shaped = dict(shaped)
    shaped["cached"] = False
    return shaped


def human_bytes(value):
    """For log lines and messages; the portal formats its own."""
    if value is None:
        return "—"
    size = float(value)
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if size < 1024 or unit == "TB":
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024