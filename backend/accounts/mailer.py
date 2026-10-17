"""
Sending the collection email.

Brevo is used as a plain SMTP relay rather than through their SDK, so there is
no extra dependency and the same code works against any mail server — swap
four lines in .env and it posts through something else.

Nothing here raises. A prescription that was written correctly must not fail
because a mail server was briefly unreachable; the send is attempted, the
outcome is recorded on the collection, and the pharmacy is told whether the
patient actually got their code.
"""

import logging
import re

from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.utils.html import escape

logger = logging.getLogger(__name__)


def is_configured():
    return bool(getattr(settings, "EMAIL_HOST", "") and getattr(settings, "EMAIL_HOST_USER", ""))


def _plain(prescription, collection, link):
    lines = [
        f"Hello {prescription.patient_name},",
        "",
        f"A prescription has been sent to the pharmacy for you by {prescription.prescriber_name}.",
        "",
        f"Reference: {prescription.reference}",
        f"File number: {prescription.file_number}",
        "",
        "What was prescribed:",
    ]

    for item in prescription.items.all():
        parts = [item.drug, item.dose, item.frequency]
        detail = " ".join(part for part in parts if part)
        if item.quantity:
            detail += f" ({item.quantity} units)"
        lines.append(f"  - {detail}")

    lines += [
        "",
        "COLLECTING YOUR MEDICINE",
        "",
        "When you get to the pharmacy, the pharmacist will show a code on their",
        "screen. Open the link below on your phone and scan it:",
        "",
        f"  {link}",
        "",
        "If your phone cannot scan, read this code out to the pharmacist instead:",
        "",
        f"  {collection.code}",
        "",
        "This code works once and then stops working. Only give it to the",
        "pharmacist who is handing your medicine over.",
        "",
        f"— {prescription.ward or 'PharmaCare+'}",
    ]
    return "\n".join(lines)


def _html(prescription, collection, link):
    items = "".join(
        f"<li style='margin-bottom:4px'>{escape(' '.join(p for p in [item.drug, item.dose, item.frequency] if p))}"
        f"{f' <span style=\"color:#666\">({item.quantity} units)</span>' if item.quantity else ''}</li>"
        for item in prescription.items.all()
    )

    return f"""<!doctype html>
<html><body style="margin:0;padding:24px;background:#f3f0e8;font-family:Helvetica,Arial,sans-serif;color:#11120f">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px">

    <p style="margin:0 0 4px;font-size:18px;font-weight:700">Hello {escape(prescription.patient_name)},</p>
    <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.55">
      {escape(prescription.prescriber_name)} has sent a prescription to the pharmacy for you.
    </p>

    <table style="width:100%;font-size:13px;color:#555;margin-bottom:20px">
      <tr><td style="padding:3px 0">Reference</td>
          <td style="padding:3px 0;text-align:right;color:#11120f;font-weight:600">{escape(prescription.reference)}</td></tr>
      <tr><td style="padding:3px 0">File number</td>
          <td style="padding:3px 0;text-align:right;color:#11120f;font-weight:600">{escape(prescription.file_number)}</td></tr>
    </table>

    <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#666">
      What was prescribed</p>
    <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;line-height:1.6">{items}</ul>

    <div style="padding:20px;background:#f6f4ee;border-radius:12px;margin-bottom:18px">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#666">
        Collecting your medicine</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.55">
        At the pharmacy the pharmacist shows a code on their screen. Open this on your
        phone and scan it:
      </p>
      <p style="margin:0 0 18px">
        <a href="{escape(link)}"
           style="display:inline-block;padding:13px 22px;background:#153f32;color:#fff;
                  border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">
          Open my collection page</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#555">
        If your phone cannot scan, read this code out to the pharmacist:</p>
      <p style="margin:0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:26px;
                font-weight:800;letter-spacing:.08em">{escape(collection.code)}</p>
    </div>

    <p style="margin:0;font-size:12px;color:#777;line-height:1.55">
      Only give this code to the pharmacist handing over your medicine. It works once,
      and then it stops working.
    </p>

  </div>
</body></html>"""


def collection_link(collection):
    base = getattr(settings, "SITE_URL", "http://127.0.0.1:8000").rstrip("/")
    return f"{base}/collect/{collection.link_token}/"


def send_collection_email(prescription, collection):
    """
    Returns (sent, detail). Never raises.

    'sent' being false is not a failure of the prescription — it means the
    patient has no code yet and the pharmacy has to fall back to something
    else, which is exactly what the queue is told.
    """
    address = (collection.sent_to or "").strip()

    if not address:
        return False, "No email address on the patient file, so no code was sent."

    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", address):
        return False, f"{address} does not look like an email address."

    if not is_configured():
        return False, ("No mail server is configured. Add the Brevo settings to .env "
                       "and the code will go out automatically.")

    link = collection_link(collection)

    try:
        message = EmailMultiAlternatives(
            subject=f"Your prescription {prescription.reference} is ready at the pharmacy",
            body=_plain(prescription, collection, link),
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", settings.EMAIL_HOST_USER),
            to=[address],
            connection=get_connection(fail_silently=False),
        )
        message.attach_alternative(_html(prescription, collection, link), "text/html")
        message.send()
    except Exception as error:
        logger.warning("Collection email to %s failed: %s", address, error)
        return False, f"The email could not be sent ({type(error).__name__}). The code still works."

    return True, ""