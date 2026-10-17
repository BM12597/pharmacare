"""
Putting uploaded patient files into Cloudinary, and getting them back.

Two deliberate choices here.

The browser never gets a Cloudinary URL. It asks Django for a file, Django
checks the session and the role, then streams the bytes back. A Cloudinary
delivery URL works for anybody who has it, and a patient file is not something
to hand out on that basis.

Nothing is signed by hand in the frontend either. The upload is signed here,
server-side, so the API secret stays on the server — the same reason the
Anthropic key lives in Django rather than in the page.

The Cloudinary SDK is in requirements.txt, but this module uses urllib
directly so that it works the same way as storage.py and can be exercised
without the package installed.
"""

import hashlib
import logging
import mimetypes
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request

import json

from django.conf import settings

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 60
FOLDER = "pharmacare/patient-files"

# PDFs and spreadsheets go up as "raw" so Cloudinary stores the bytes exactly
# as they arrived. Pictures go up as images, which is also what lets a scanned
# page be handed to the extraction step as a picture later.
IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}


def _config():
    return (
        getattr(settings, "CLOUDINARY_CLOUD_NAME", "") or "",
        getattr(settings, "CLOUDINARY_API_KEY", "") or "",
        getattr(settings, "CLOUDINARY_API_SECRET", "") or "",
    )


def is_configured():
    return all(_config())


def _api_base():
    return getattr(settings, "CLOUDINARY_API_BASE", "https://api.cloudinary.com")


def resource_type_for(content_type):
    return "image" if (content_type or "").lower() in IMAGE_TYPES else "raw"


def _sign(params, secret):
    """
    Cloudinary's signature: the parameters, sorted, joined, then the secret
    appended and the whole thing hashed.
    """
    joined = "&".join(f"{key}={params[key]}" for key in sorted(params) if params[key] != "")
    return hashlib.sha1(f"{joined}{secret}".encode()).hexdigest()


def _multipart(fields, file_name, file_bytes, content_type):
    """Builds the request body by hand so there is no extra dependency."""
    boundary = "----PharmaCare" + secrets.token_hex(12)
    parts = []

    for key, value in fields.items():
        parts.append(
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{key}"\r\n\r\n'
            f"{value}\r\n".encode()
        )

    parts.append(
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{file_name}"\r\n'
        f"Content-Type: {content_type or 'application/octet-stream'}\r\n\r\n".encode()
    )
    parts.append(file_bytes)
    parts.append(f"\r\n--{boundary}--\r\n".encode())

    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def upload(file_bytes, original_name, content_type=""):
    """
    Store one file.

    Returns {"ok": True, "public_id": ..., "url": ..., "resource_type": ...}
    or {"ok": False, "detail": "..."} with something a person can act on.
    """
    cloud, key, secret = _config()
    if not all((cloud, key, secret)):
        return {
            "ok": False,
            "detail": "Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, "
                      "CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to .env.",
        }

    resource_type = resource_type_for(content_type)
    suffix = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""

    # A random id rather than the patient's file number. Even though delivery
    # goes through Django, a guessable Cloudinary path is a bad idea on its own.
    stem = secrets.token_urlsafe(18).replace("-", "_")
    public_id = f"{stem}.{suffix}" if (suffix and resource_type == "raw") else stem

    params = {
        "folder": FOLDER,
        "public_id": public_id,
        "timestamp": str(int(time.time())),
    }
    fields = dict(params)
    fields["api_key"] = key
    fields["signature"] = _sign(params, secret)

    body, content_header = _multipart(fields, original_name, file_bytes, content_type)
    url = f"{_api_base()}/v1_1/{cloud}/{resource_type}/upload"

    request = urllib.request.Request(
        url, data=body, headers={"Content-Type": content_header}
    )

    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            result = json.loads(response.read())
    except urllib.error.HTTPError as error:
        # Cloudinary says why in the body, and it is usually worth repeating:
        # a disabled account or an exhausted plan reads very differently from
        # a rejected signature.
        reason = ""
        try:
            reason = (json.loads(error.read()).get("error") or {}).get("message", "")
        except Exception:
            pass
        logger.warning("Cloudinary upload failed (%s): %s", error.code, reason)
        return {
            "ok": False,
            "detail": reason or f"Cloudinary rejected the upload ({error.code}).",
        }
    except Exception as error:
        logger.warning("Cloudinary upload failed: %s", error)
        return {"ok": False, "detail": "Cloudinary could not be reached. Check the connection."}

    return {
        "ok": True,
        "public_id": result.get("public_id", ""),
        "url": result.get("secure_url") or result.get("url") or "",
        "resource_type": result.get("resource_type") or resource_type,
        "bytes": result.get("bytes"),
        "pages": result.get("pages"),
    }


def fetch(url):
    """
    Read a stored file back, for the download endpoint.

    Returns (bytes, content_type) or (None, detail).
    """
    if not url:
        return None, "That file has no stored copy."

    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT_SECONDS) as response:
            return response.read(), response.headers.get("Content-Type", "")
    except urllib.error.HTTPError as error:
        logger.warning("Cloudinary fetch failed (%s) for %s", error.code, url)
        if error.code == 404:
            return None, "That file is no longer in storage."
        return None, f"The file could not be fetched ({error.code})."
    except Exception as error:
        logger.warning("Cloudinary fetch failed: %s", error)
        return None, "The file store could not be reached."


def destroy(public_id, resource_type="raw"):
    """Remove a stored file. Used when an upload is abandoned part way."""
    cloud, key, secret = _config()
    if not all((cloud, key, secret)) or not public_id:
        return False

    params = {"public_id": public_id, "timestamp": str(int(time.time()))}
    fields = dict(params)
    fields["api_key"] = key
    fields["signature"] = _sign(params, secret)

    # destroy sends no file, so this one goes as a plain form.
    form = urllib.parse.urlencode(fields).encode()

    request = urllib.request.Request(
        f"{_api_base()}/v1_1/{cloud}/{resource_type}/destroy",
        data=form,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return json.loads(response.read()).get("result") == "ok"
    except Exception as error:
        logger.warning("Cloudinary destroy failed: %s", error)
        return False


def guess_content_type(name, fallback="application/octet-stream"):
    return mimetypes.guess_type(name)[0] or fallback