"""
User accounts for PharmaCare+.

Staff do not register themselves. A superuser creates every account from the
management portal, choosing the role and issuing the ID and password. People
sign in with that ID rather than an email address, which matches how hospital
and pharmacy staff numbers already work.
"""

import secrets
from datetime import timedelta

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone


class Role(models.TextChoices):
    """The four workspaces. The value is what the frontend sends at login."""

    ADMIN = "admin", "Admin"
    DOCTOR = "doctor", "Doctor"
    PHARMACIST = "pharmacist", "Pharmacist"
    RESEARCHER = "researcher", "Researcher"
    IT_SUPPORT = "it", "IT support"


# Each role gets its own ID prefix so a staff number is self-describing.
ROLE_ID_PREFIX = {
    Role.ADMIN: "AD",
    Role.DOCTOR: "DR",
    Role.PHARMACIST: "PH",
    Role.RESEARCHER: "RS",
    Role.IT_SUPPORT: "IT",
}

user_id_validator = RegexValidator(
    regex=r"^[A-Z0-9-]{4,32}$",
    message="IDs may only contain capital letters, digits and hyphens.",
)


def generate_user_id(role, facility_code="DGMH"):
    """Suggest an unused ID for a new account, e.g. DGMH-PH-0142."""
    prefix = ROLE_ID_PREFIX.get(role, "ST")
    for _ in range(20):
        candidate = f"{facility_code}-{prefix}-{secrets.randbelow(9000) + 1000}"
        if not User.objects.filter(user_id=candidate).exists():
            return candidate
    raise RuntimeError("Could not generate an unused staff ID.")


class UserManager(BaseUserManager):
    """Creates users keyed on user_id instead of a username."""

    use_in_migrations = True

    def _create_user(self, user_id, password, **extra):
        if not user_id:
            raise ValueError("A staff ID is required.")
        user_id = user_id.strip().upper()
        user = self.model(user_id=user_id, **extra)
        user.set_password(password)
        user.full_clean(exclude=["password", "last_login"])
        user.save(using=self._db)
        return user

    def create_user(self, user_id, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(user_id, password, **extra)

    def create_superuser(self, user_id, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("is_active", True)
        extra.setdefault("role", Role.ADMIN)
        extra.setdefault("full_name", "System administrator")
        extra.setdefault("must_change_password", False)

        if extra.get("is_staff") is not True:
            raise ValueError("Superusers must have is_staff=True.")
        if extra.get("is_superuser") is not True:
            raise ValueError("Superusers must have is_superuser=True.")

        return self._create_user(user_id, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    user_id = models.CharField(
        "staff ID",
        max_length=32,
        unique=True,
        validators=[user_id_validator],
        help_text="The ID this person signs in with, e.g. DGMH-PH-0142.",
    )
    full_name = models.CharField(max_length=120)
    role = models.CharField(max_length=20, choices=Role.choices)
    facility = models.CharField(
        max_length=120,
        default="Dr George Mukhari Academic Hospital",
        help_text="The hospital or pharmacy this account belongs to.",
    )
    email = models.EmailField(blank=True, help_text="Optional. Used for support replies only.")
    phone = models.CharField(max_length=30, blank=True)

    # Professional registration, e.g. an HPCSA or SAPC number. Kept as free
    # text because the format differs per council.
    registration_number = models.CharField(max_length=40, blank=True)

    is_active = models.BooleanField(
        default=True,
        help_text="Uncheck to revoke access without deleting the account or its history.",
    )
    is_staff = models.BooleanField(
        "management portal access",
        default=False,
        help_text="Only give this to people who administer the system itself.",
    )
    must_change_password = models.BooleanField(
        default=True,
        help_text="Forces a new password at next sign in. Set for every issued account.",
    )

    date_joined = models.DateTimeField(default=timezone.now)
    created_by = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="accounts_created",
    )

    objects = UserManager()

    USERNAME_FIELD = "user_id"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        verbose_name = "staff account"
        verbose_name_plural = "staff accounts"
        ordering = ["role", "user_id"]
        indexes = [models.Index(fields=["role", "is_active"])]

    def __str__(self):
        return f"{self.user_id} — {self.full_name}"

    def save(self, *args, **kwargs):
        self.user_id = self.user_id.strip().upper()
        super().save(*args, **kwargs)

    def get_full_name(self):
        return self.full_name

    def get_short_name(self):
        return self.full_name.split(" ")[0] if self.full_name else self.user_id

    @property
    def workspace_url(self):
        """Where this account lands after signing in."""
        return {
            Role.ADMIN: "/admin/",
            Role.DOCTOR: "/staff/",
            Role.PHARMACIST: "/pharmacy/",
            Role.RESEARCHER: "/research/",
            Role.IT_SUPPORT: "/management/",
        }.get(self.role, "/")

class ActivityLog(models.Model):
    """
    A record of who did what in the management portal.

    Kept deliberately simple: an action code, the account it affected, and a
    sentence a human can read. The point is that when somebody asks why an
    account was revoked in August, there is an answer.
    """

    class Action(models.TextChoices):
        ACCOUNT_CREATED = "account.created", "Account created"
        ACCOUNT_UPDATED = "account.updated", "Account updated"
        ACCOUNT_REVOKED = "account.revoked", "Access revoked"
        ACCOUNT_RESTORED = "account.restored", "Access restored"
        PASSWORD_RESET = "account.password_reset", "Password reset"
        ACCOUNT_DELETED = "account.deleted", "Account deleted"
        TICKET_CLOSED = "ticket.closed", "Support request closed"
        TICKET_REOPENED = "ticket.reopened", "Support request reopened"
        LOGIN_FAILED = "auth.login_failed", "Failed sign in"

        # Patient files. Who read a file into the system, and who changed what
        # it says afterwards, is exactly the kind of question asked later.
        FILE_UPLOADED = "file.uploaded", "Patient file uploaded"
        FILE_HELD = "file.held", "Patient file held for a decision"
        RECORD_CREATED = "record.created", "Patient record created"
        RECORD_UPDATED = "record.updated", "Patient record edited"
        RECORD_CONFIRMED = "record.confirmed", "Patient record confirmed"

        # Deleting a patient throws away the documents, the edit history and
        # the prescriptions with them. The one thing that survives is this
        # line, which is the whole reason it is written.
        RECORD_DELETED = "record.deleted", "Patient record deleted"

    action = models.CharField(max_length=40, choices=Action.choices)
    actor = models.ForeignKey(
        "User", null=True, blank=True, on_delete=models.SET_NULL, related_name="actions"
    )

    # The ID is stored as text as well as a link, so the trail survives the
    # account being deleted.
    subject_user_id = models.CharField(max_length=32, blank=True)
    detail = models.CharField(max_length=300, blank=True)
    happened_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-happened_at"]
        indexes = [models.Index(fields=["-happened_at"]), models.Index(fields=["action"])]

    def __str__(self):
        return f"{self.happened_at:%Y-%m-%d %H:%M} {self.action} {self.subject_user_id}"

    @classmethod
    def record(cls, action, actor=None, subject=None, detail=""):
        """Never let logging break the thing it is logging."""
        try:
            return cls.objects.create(
                action=action,
                actor=actor if (actor and actor.is_authenticated) else None,
                subject_user_id=(subject or "")[:32],
                detail=detail[:300],
            )
        except Exception:
            return None


class SupportTicket(models.Model):
    """A message sent to IT support from inside one of the workspaces."""

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        CLOSED = "closed", "Closed"

    raised_by = models.ForeignKey(
        "User", null=True, blank=True, on_delete=models.SET_NULL, related_name="tickets"
    )

    # Snapshots, so a closed ticket still reads correctly after the account
    # that raised it is gone.
    raised_by_name = models.CharField(max_length=120, blank=True)
    raised_by_id_text = models.CharField(max_length=32, blank=True)
    workspace = models.CharField(max_length=20, choices=Role.choices, blank=True)

    subject = models.CharField(max_length=160)
    body = models.TextField(max_length=4000)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(default=timezone.now)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(
        "User", null=True, blank=True, on_delete=models.SET_NULL, related_name="tickets_closed"
    )
    resolution = models.TextField(max_length=2000, blank=True)

    class Meta:
        ordering = ["status", "-created_at"]
        indexes = [models.Index(fields=["status", "-created_at"])]

    def __str__(self):
        return f"{self.subject} ({self.get_status_display()})"


# ======================================================================
# Patient files
#
# A patient file has two halves that stay together for its whole life:
#
#   Patient         the digital record — searchable, editable, and the thing
#                   screening reads before a prescription goes anywhere
#   PatientFile     the paper that arrived, kept exactly as it was scanned,
#                   so anybody can check the typing against the original
#
# Only doctors may change the record. Admin and pharmacy read and download it.
# Every change is kept as a version, because in a clinical system the question
# is never only what the file says, it is who changed it and when.
# ======================================================================


class Patient(models.Model):
    """The digital patient file."""

    class Sex(models.TextChoices):
        FEMALE = "F", "Female"
        MALE = "M", "Male"
        OTHER = "O", "Other"
        UNKNOWN = "", "Not recorded"

    # ---- 01 identification
    file_number = models.CharField(
        max_length=40,
        unique=True,
        help_text="The hospital file number, e.g. DGMH-2026-04812.",
    )

    # Kept because staff search by it, and because two patients can share a
    # name. It is not used as the key for anything.
    id_number = models.CharField("ID number", max_length=20, blank=True)

    full_name = models.CharField(max_length=160)
    date_of_birth = models.DateField(null=True, blank=True)

    # What the paper said, used when there is no date of birth to work from.
    stated_age = models.PositiveSmallIntegerField(null=True, blank=True)

    sex = models.CharField(max_length=1, choices=Sex.choices, blank=True)
    ward = models.CharField(max_length=80, blank=True)

    # Suburb only. The overview map draws suburb centres, never an address.
    home_area = models.CharField(max_length=120, blank=True)
    address = models.CharField(max_length=240, blank=True)
    language = models.CharField(max_length=80, blank=True)
    phone = models.CharField(max_length=40, blank=True)

    # Where the collection code is sent when a prescription is written. No
    # address on file means no code goes out, and the pharmacy is told so
    # rather than left waiting for a scan that cannot come.
    email = models.EmailField(blank=True)

    next_of_kin = models.CharField(max_length=160, blank=True)
    next_of_kin_phone = models.CharField(max_length=40, blank=True)

    # ---- 02 encounter and triage
    # {date, time, type, triage, presenting_complaint, referred_by}
    encounter = models.JSONField(default=dict, blank=True)

    # ---- 03 medical history
    conditions = models.JSONField(default=list, blank=True)        # ["Type 2 diabetes"]
    medication = models.JSONField(default=list, blank=True)        # [{name, dose, frequency}]
    allergies = models.JSONField(default=list, blank=True)         # ["Penicillin"]
    history_notes = models.TextField(blank=True)

    # ---- 04 observations
    # {bp, pulse, temperature, respiratory_rate, spo2, weight_kg, height_m, pain_score}
    observations = models.JSONField(default=dict, blank=True)

    # ---- 05 and 06 assessment, plan
    assessment = models.TextField(blank=True)
    plan = models.TextField(blank=True)

    # ---- provenance
    class Source(models.TextChoices):
        UPLOAD = "upload", "Read from an uploaded file"
        MANUAL = "manual", "Entered by hand"

    source = models.CharField(max_length=10, choices=Source.choices, default=Source.MANUAL)

    # True until a doctor has read the record against the original and said it
    # is right. Everything extracted from a PDF starts here.
    needs_review = models.BooleanField(
        default=False,
        help_text="Set on anything read out of an uploaded file, until a doctor confirms it.",
    )
    confirmed_by = models.ForeignKey(
        "User", null=True, blank=True, on_delete=models.SET_NULL, related_name="patients_confirmed"
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    created_by = models.ForeignKey(
        "User", null=True, blank=True, on_delete=models.SET_NULL, related_name="patients_created"
    )
    updated_at = models.DateTimeField(default=timezone.now)
    updated_by = models.ForeignKey(
        "User", null=True, blank=True, on_delete=models.SET_NULL, related_name="patients_updated"
    )

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["file_number"]),
            # Looked up on every upload, to catch the same patient arriving
            # under a second file number.
            models.Index(fields=["id_number"]),
            models.Index(fields=["-updated_at"]),
            models.Index(fields=["ward"]),
        ]

    def __str__(self):
        return f"{self.file_number} — {self.full_name}"

    def save(self, *args, **kwargs):
        self.file_number = (self.file_number or "").strip().upper()
        super().save(*args, **kwargs)

    @property
    def age(self):
        """Worked out from the date of birth, or what the paper said."""
        if self.date_of_birth:
            today = timezone.localdate()
            years = today.year - self.date_of_birth.year
            if (today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day):
                years -= 1
            if 0 <= years < 130:
                return years
        return self.stated_age

    @property
    def medication_names(self):
        """Just the names, which is what the interaction screening wants."""
        names = []
        for item in self.medication or []:
            name = (item.get("name") if isinstance(item, dict) else str(item)) or ""
            if name.strip():
                names.append(name.strip())
        return names

    def snapshot(self):
        """
        The record as it stands, for the version history.

        Deliberately plain data rather than a serialiser, so an old version can
        still be read after the fields around it have changed.
        """
        return {
            "file_number": self.file_number,
            "id_number": self.id_number,
            "full_name": self.full_name,
            "date_of_birth": self.date_of_birth.isoformat() if self.date_of_birth else None,
            "stated_age": self.stated_age,
            "sex": self.sex,
            "ward": self.ward,
            "home_area": self.home_area,
            "address": self.address,
            "language": self.language,
            "phone": self.phone,
            "email": self.email,
            "next_of_kin": self.next_of_kin,
            "next_of_kin_phone": self.next_of_kin_phone,
            "encounter": self.encounter or {},
            "conditions": self.conditions or [],
            "medication": self.medication or [],
            "allergies": self.allergies or [],
            "history_notes": self.history_notes,
            "observations": self.observations or {},
            "assessment": self.assessment,
            "plan": self.plan,
            "needs_review": self.needs_review,
        }


class PatientFile(models.Model):
    """
    One uploaded document, kept as it arrived.

    The record above may be edited for years; this never changes. It carries
    its own progress so the upload animation shows real stages rather than a
    spinner that means nothing.
    """

    class Stage(models.TextChoices):
        UPLOADED = "uploaded", "Stored"
        READING = "reading", "Reading the pages"
        EXTRACTING = "extracting", "Pulling out the details"
        DONE = "done", "Done"
        FAILED = "failed", "Could not be read"

        # Read perfectly well, but it clashes with a record already on the
        # system — usually the same ID number under a different name. Nothing
        # was created or changed; somebody has to decide.
        HELD = "held", "Held for a decision"

    patient = models.ForeignKey(
        "Patient", null=True, blank=True, on_delete=models.CASCADE, related_name="documents"
    )

    original_name = models.CharField(max_length=240)
    content_type = models.CharField(max_length=80, blank=True)
    size_bytes = models.BigIntegerField(default=0)
    page_count = models.PositiveSmallIntegerField(null=True, blank=True)

    # Where Cloudinary put it. The URL is stored so the file can be opened
    # without a round trip, and the public id so it can be deleted or re-signed.
    cloud_public_id = models.CharField(max_length=240, blank=True)
    cloud_url = models.URLField(max_length=500, blank=True)
    cloud_resource_type = models.CharField(max_length=20, blank=True)

    stage = models.CharField(max_length=12, choices=Stage.choices, default=Stage.UPLOADED)
    detail = models.CharField(max_length=300, blank=True)

    # How the text was obtained, which matters when somebody asks why a figure
    # on the record does not match the paper.
    text_chars = models.PositiveIntegerField(default=0)

    # The text layer as it came off the page, kept so the reading step and the
    # extraction step can be separate requests without doing the work twice.
    page_text = models.TextField(blank=True)

    read_as_image = models.BooleanField(
        default=False,
        help_text="True when the PDF had no text layer and the page was read as a picture.",
    )

    # Exactly what came back from the extraction, before anybody edited the
    # record. The audit trail starts here.
    extracted = models.JSONField(default=dict, blank=True)

    uploaded_at = models.DateTimeField(default=timezone.now)
    uploaded_by = models.ForeignKey(
        "User", null=True, blank=True, on_delete=models.SET_NULL, related_name="files_uploaded"
    )

    class Meta:
        ordering = ["-uploaded_at"]
        indexes = [models.Index(fields=["-uploaded_at"]), models.Index(fields=["stage"])]

    def __str__(self):
        return self.original_name

    @property
    def kind(self):
        """The short label the file list shows, e.g. PDF."""
        suffix = self.original_name.rsplit(".", 1)[-1] if "." in self.original_name else ""
        return (suffix or "FILE")[:4].upper()


class PatientRecordVersion(models.Model):
    """
    The record as it was before one particular edit.

    Kept so a doctor's change can be seen, compared and explained later. The
    current state always lives on Patient; this is only history.
    """

    patient = models.ForeignKey("Patient", on_delete=models.CASCADE, related_name="versions")
    snapshot = models.JSONField(default=dict)
    changed_fields = models.JSONField(default=list, blank=True)
    note = models.CharField(max_length=300, blank=True)

    edited_at = models.DateTimeField(default=timezone.now)
    edited_by = models.ForeignKey(
        "User", null=True, blank=True, on_delete=models.SET_NULL, related_name="record_edits"
    )

    # Snapshot of who, so the history still reads correctly after an account is
    # deleted.
    edited_by_name = models.CharField(max_length=160, blank=True)
    edited_by_id_text = models.CharField(max_length=32, blank=True)

    class Meta:
        ordering = ["-edited_at"]
        indexes = [models.Index(fields=["patient", "-edited_at"])]

    def __str__(self):
        return f"{self.patient_id} at {self.edited_at:%Y-%m-%d %H:%M}"


# ======================================================================
# Pharmacy stock
#
# A substitution the screening suggests is only useful if the substitute is on
# the shelf, so the stock level has to be a real number rather than a figure
# on a page. Two tables: what is on the shelf now, and every change that got
# it there.
#
# The movement log is the part that makes the number trustworthy. When a level
# drops by sixty, somebody will ask why, and the answer should be in the
# system rather than in a person's memory.
# ======================================================================

# What one line of stock can hold. Ordering past it fills to the ceiling and
# says so, rather than quietly accepting a number it cannot keep.
MAX_STOCK_LEVEL = 500


class StockItem(models.Model):
    """One medicine, in one form, on one shelf."""

    drug = models.CharField(max_length=120)
    form = models.CharField(
        max_length=80,
        help_text="Strength and presentation, e.g. Tablet 5 mg.",
    )

    level = models.PositiveIntegerField(
        default=0,
        help_text=f"Units on the shelf now. Never above {MAX_STOCK_LEVEL}.",
    )
    reorder_at = models.PositiveIntegerField(
        default=0,
        help_text="Below this the item is flagged as low.",
    )

    # Kept so an item can be taken out of use without deleting its history.
    is_active = models.BooleanField(default=True)

    updated_at = models.DateTimeField(default=timezone.now)
    updated_by = models.ForeignKey(
        "User", null=True, blank=True, on_delete=models.SET_NULL, related_name="stock_updates"
    )

    class Meta:
        ordering = ["drug", "form"]
        # The same drug in two strengths is two lines; the same drug in the
        # same strength twice is a mistake.
        constraints = [
            models.UniqueConstraint(fields=["drug", "form"], name="unique_drug_form")
        ]
        indexes = [models.Index(fields=["drug"])]

    def __str__(self):
        return f"{self.drug} {self.form} ({self.level})"

    @property
    def status(self):
        if self.level == 0:
            return "out"
        if self.level <= self.reorder_at:
            return "low"
        return "in"

    @property
    def headroom(self):
        """How much more this line can take before it hits the ceiling."""
        return max(MAX_STOCK_LEVEL - self.level, 0)

    def apply(self, change, reason, user=None, note="", prescription=None):
        """
        Move the level, write down why, and never go below zero or above the
        ceiling. Returns the movement, or None when nothing could move.

        The caller decides what to say about a short move; this only reports
        what actually happened, in the 'change' on the movement it returns.
        """
        if not change:
            return None

        before = self.level
        after = min(max(before + change, 0), MAX_STOCK_LEVEL)
        if after == before:
            return None

        self.level = after
        self.updated_at = timezone.now()
        self.updated_by = user
        self.save(update_fields=["level", "updated_at", "updated_by"])

        return StockMovement.objects.create(
            item=self,
            change=after - before,
            level_after=after,
            reason=reason,
            note=note[:200],
            moved_by=user,
            moved_by_name=user.full_name if user else "",
        )


class StockMovement(models.Model):
    """One change to a stock level, and the reason for it."""

    class Reason(models.TextChoices):
        ORDER = "order", "Ordered in"
        DISPENSE = "dispense", "Dispensed"
        ADJUST = "adjust", "Adjusted by hand"
        RETURN = "return", "Returned to the shelf"

    item = models.ForeignKey("StockItem", on_delete=models.CASCADE, related_name="movements")

    # Positive for stock coming in, negative for stock going out.
    change = models.IntegerField()
    level_after = models.PositiveIntegerField()

    reason = models.CharField(max_length=10, choices=Reason.choices)
    note = models.CharField(max_length=200, blank=True)

    moved_at = models.DateTimeField(default=timezone.now)
    moved_by = models.ForeignKey(
        "User", null=True, blank=True, on_delete=models.SET_NULL, related_name="stock_movements"
    )
    moved_by_name = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ["-moved_at"]
        indexes = [models.Index(fields=["item", "-moved_at"]), models.Index(fields=["-moved_at"])]

    def __str__(self):
        return f"{self.item_id} {self.change:+d} ({self.reason})"


# ======================================================================
# Prescriptions
#
# The record that ties the whole system together: the doctor writes it, the
# screening grades it, the doctor may override it in writing, the pharmacist
# reads that reason before dispensing, and dispensing takes the stock off the
# shelf.
#
# Most fields are snapshots of how things were when it was written. A script
# dispensed in March should still read correctly in September, even if the
# patient has moved ward, changed medication, or the prescriber has left.
# ======================================================================


class Prescription(models.Model):
    class Status(models.TextChoices):
        WAITING = "waiting", "Waiting at the pharmacy"
        DISPENSED = "dispensed", "Dispensed"
        QUERIED = "queried", "Sent back to the prescriber"
        CANCELLED = "cancelled", "Cancelled"

    class Severity(models.TextChoices):
        SEVERE = "severe", "Severe"
        MODERATE = "moderate", "Moderate"
        MILD = "mild", "Mild"
        CLEAR = "clear", "No warning"
        UNKNOWN = "unknown", "Not screened"

    reference = models.CharField(max_length=24, unique=True)

    patient = models.ForeignKey(
        "Patient", null=True, blank=True, on_delete=models.SET_NULL, related_name="prescriptions"
    )
    patient_name = models.CharField(max_length=160)
    file_number = models.CharField(max_length=40)
    patient_age = models.PositiveSmallIntegerField(null=True, blank=True)
    ward = models.CharField(max_length=80, blank=True)

    prescriber = models.ForeignKey(
        "User", null=True, blank=True, on_delete=models.SET_NULL, related_name="prescriptions"
    )
    prescriber_name = models.CharField(max_length=160, blank=True)
    prescriber_id_text = models.CharField(max_length=32, blank=True)

    # Graded on the server when the script is sent, not taken from whatever
    # the browser claimed. The page can be out of date or edited; this cannot.
    severity = models.CharField(max_length=10, choices=Severity.choices, default=Severity.UNKNOWN)

    # Everything the screening found, as it found it. Kept whole so a warning
    # can be read back months later exactly as the prescriber saw it.
    screening = models.JSONField(default=dict, blank=True)

    # Required by the workspace whenever the screening raised something. The
    # pharmacist reads this before dispensing — it is the point of the system.
    override_reason = models.TextField(max_length=2000, blank=True)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.WAITING)
    created_at = models.DateTimeField(default=timezone.now)

    # The pharmacy side.
    handled_by = models.ForeignKey(
        "User", null=True, blank=True, on_delete=models.SET_NULL, related_name="prescriptions_handled"
    )
    handled_by_name = models.CharField(max_length=160, blank=True)
    handled_at = models.DateTimeField(null=True, blank=True)
    pharmacy_note = models.TextField(max_length=2000, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["reference"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self):
        return f"{self.reference} — {self.patient_name}"

    @property
    def is_flagged(self):
        return self.severity in {self.Severity.SEVERE, self.Severity.MODERATE}

    @property
    def drug_names(self):
        return [item.drug for item in self.items.all()]


def generate_reference():
    """RX-2026-00147. Sequential within the year, so it reads like a docket."""
    year = timezone.now().year
    prefix = f"RX-{year}-"

    last = (
        Prescription.objects
        .filter(reference__startswith=prefix)
        .order_by("-reference")
        .values_list("reference", flat=True)
        .first()
    )

    nextNumber = 1
    if last:
        try:
            nextNumber = int(last.rsplit("-", 1)[1]) + 1
        except (IndexError, ValueError):
            nextNumber = Prescription.objects.filter(reference__startswith=prefix).count() + 1

    return f"{prefix}{nextNumber:05d}"


class PrescriptionItem(models.Model):
    """One medicine on one script."""

    prescription = models.ForeignKey(
        "Prescription", on_delete=models.CASCADE, related_name="items"
    )

    drug = models.CharField(max_length=120)
    dose = models.CharField(max_length=60, blank=True)
    frequency = models.CharField(max_length=60, blank=True)

    # How many units the pharmacy hands over. This is what comes off the shelf.
    quantity = models.PositiveIntegerField(null=True, blank=True)

    # Matched to the shelf when the script is written, so the pharmacy knows
    # what to take from without guessing at the spelling later.
    stock_item = models.ForeignKey(
        "StockItem", null=True, blank=True, on_delete=models.SET_NULL, related_name="prescribed"
    )

    # What actually went out, which is not always what was asked for.
    dispensed_quantity = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.drug} {self.dose}".strip()

    @property
    def label(self):
        return " ".join(part for part in [self.drug, self.dose] if part)


# ======================================================================
# Collection
#
# Proof that the person at the counter is the person the script was written
# for. The idea is borrowed from a QR payment flow: the counter displays a
# code, the customer's own phone reads it, and the pair only matches if both
# halves belong to the same transaction.
#
# Two secrets, deliberately different:
#
#   link_token   long-lived, sent to the patient by email. Whoever holds it
#                is treated as the patient for this one script.
#   qr_token     made when the pharmacist presses Dispense. One use, short
#                life. It proves the patient is standing at that counter now.
#
# A scan sends both. They have to point at the same collection, or nothing
# happens. The typed code is the same check for a patient whose phone cannot
# scan — read out loud, typed in by the pharmacist, consumed the same way.
# ======================================================================

# How long an armed code stays good for. Long enough to find the email, short
# enough that a screen left unattended is not a free prescription.
QR_MINUTES = 10

# Wrong codes allowed before this collection is locked and has to be re-armed.
MAX_ATTEMPTS = 5


def _token():
    return secrets.token_urlsafe(32)


def generate_collection_code():
    """
    Six characters, read out over a counter without being misheard.

    No O/0, no I/1/L, no U (sounds like you), no S/5. What is left can be
    said down a phone line in a noisy dispensary and typed correctly.
    """
    alphabet = "ABCDEFGHJKMNPQRTVWXY2346789"
    return "-".join(
        "".join(secrets.choice(alphabet) for _ in range(3)) for _ in range(2)
    )


class Collection(models.Model):
    """One prescription's collection, from the email to the counter."""

    class Status(models.TextChoices):
        ISSUED = "issued", "Code issued"
        ARMED = "armed", "Waiting for the patient to confirm"
        COLLECTED = "collected", "Confirmed by the patient"
        EXPIRED = "expired", "Code expired"
        CANCELLED = "cancelled", "Cancelled"

    prescription = models.OneToOneField(
        "Prescription", on_delete=models.CASCADE, related_name="collection"
    )

    # The patient's half, emailed to them. Unique so the link resolves to one
    # script and one script only.
    link_token = models.CharField(max_length=64, unique=True, default=_token)
    code = models.CharField(max_length=12, db_index=True, default=generate_collection_code)

    # Snapshot: the record may be edited later, but this is where it went.
    sent_to = models.EmailField(blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    send_error = models.CharField(max_length=300, blank=True)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ISSUED)

    # The counter's half. Replaced every time Dispense is pressed, so a code
    # that has been shown on a screen is never worth anything twice.
    qr_token = models.CharField(max_length=64, blank=True, db_index=True)
    qr_expires_at = models.DateTimeField(null=True, blank=True)
    armed_at = models.DateTimeField(null=True, blank=True)
    armed_by = models.ForeignKey(
        "User", null=True, blank=True, on_delete=models.SET_NULL, related_name="collections_armed"
    )

    # How many codes have been shown for this script, which is worth knowing
    # if somebody is standing at the counter failing over and over.
    arm_count = models.PositiveSmallIntegerField(default=0)
    attempts = models.PositiveSmallIntegerField(default=0)

    confirmed_at = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.CharField(
        max_length=20, blank=True,
        help_text="scan or code — how the patient proved they were here.",
    )

    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status"]), models.Index(fields=["code"])]

    def __str__(self):
        return f"{self.prescription_id} {self.code} ({self.status})"

    @property
    def is_armed(self):
        return (
            self.status == self.Status.ARMED
            and self.qr_expires_at is not None
            and timezone.now() < self.qr_expires_at
        )

    @property
    def seconds_left(self):
        if not self.qr_expires_at:
            return 0
        return max(int((self.qr_expires_at - timezone.now()).total_seconds()), 0)

    def arm(self, user):
        """
        Show a fresh code at the counter.

        Every arming mints a new token, so the one on the last patient's
        screenshot is already dead.
        """
        self.qr_token = _token()
        self.qr_expires_at = timezone.now() + timedelta(minutes=QR_MINUTES)
        self.armed_at = timezone.now()
        self.armed_by = user
        self.arm_count += 1
        self.attempts = 0
        self.status = self.Status.ARMED
        self.save(update_fields=[
            "qr_token", "qr_expires_at", "armed_at", "armed_by",
            "arm_count", "attempts", "status",
        ])
        return self

    def consume(self, how):
        """Confirmed. The token is cleared so it cannot be used again."""
        self.status = self.Status.COLLECTED
        self.confirmed_at = timezone.now()
        self.confirmed_by = how
        self.qr_token = ""
        self.qr_expires_at = None
        self.save(update_fields=[
            "status", "confirmed_at", "confirmed_by", "qr_token", "qr_expires_at",
        ])

    def stand_down(self, status=None):
        """Give up on this attempt. A new code can be armed afterwards."""
        self.qr_token = ""
        self.qr_expires_at = None
        self.status = status or self.Status.ISSUED
        self.save(update_fields=["qr_token", "qr_expires_at", "status"])


# ======================================================================
# Research: the review queue, the model registry and the shared settings
# ======================================================================

def pair_key(drug_a, drug_b):
    """
    One key for a pair whichever way round it arrives.

    "Warfarin + Aspirin" and "aspirin + warfarin" are the same question, and
    the queue would be useless if it asked it twice.
    """
    left = (drug_a or "").strip().lower()
    right = (drug_b or "").strip().lower()
    first, second = sorted([left, right])
    return f"{first}|{second}"


class ReviewItem(models.Model):
    """
    A drug pair the model was not sure about, waiting for a person to decide.

    Raised automatically when a screening run lands between the two ends of
    the confidence scale, or by hand when a doctor or pharmacist disagrees
    with what the system said. A decision made here is applied to later
    screening runs, which is the point: the queue is how clinical knowledge
    gets back into the system.
    """

    class Status(models.TextChoices):
        WAITING = "waiting", "Waiting"
        CONFIRMED = "confirmed", "Confirmed as an interaction"
        REJECTED = "rejected", "Rejected — no interaction"

    class Source(models.TextChoices):
        MODEL = "model", "Model, low confidence"
        STAFF = "staff", "Raised by staff"

    key = models.CharField(max_length=320, unique=True)
    drug_a = models.CharField(max_length=150)
    drug_b = models.CharField(max_length=150)

    # What the model said when the pair was raised. Null for a pair a person
    # raised without a model run behind it.
    confidence = models.FloatField(null=True, blank=True)
    probability = models.FloatField(null=True, blank=True)
    prediction = models.CharField(max_length=40, default="unknown")

    source = models.CharField(max_length=10, choices=Source.choices, default=Source.MODEL)
    raised_by = models.ForeignKey(
        "User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="review_items_raised",
    )
    raised_by_name = models.CharField(max_length=120, blank=True)
    context = models.CharField(max_length=120, blank=True)
    note = models.TextField(blank=True)

    # The same pair turning up again is worth knowing: it means the queue is
    # holding up real prescribing, not sitting on a curiosity.
    times_seen = models.PositiveIntegerField(default=1)
    last_seen_at = models.DateTimeField(auto_now=True)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.WAITING)
    decided_by = models.ForeignKey(
        "User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="review_items_decided",
    )
    decided_by_name = models.CharField(max_length=120, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["status", "confidence", "-times_seen", "-created_at"]
        indexes = [models.Index(fields=["status", "-created_at"])]

    def __str__(self):
        return f"{self.pair} ({self.get_status_display()})"

    @property
    def pair(self):
        return f"{self.drug_a} + {self.drug_b}"

    def decide(self, status, user=None, note=""):
        self.status = status
        self.decided_by = user
        self.decided_by_name = getattr(user, "full_name", "") or getattr(user, "user_id", "")
        self.decided_at = timezone.now()
        self.decision_note = (note or "")[:2000]
        self.save(update_fields=[
            "status", "decided_by", "decided_by_name", "decided_at", "decision_note",
        ])
        return self


def registry_dir():
    """Where a trained model's bundle is written."""
    from django.conf import settings as django_settings

    base = getattr(
        django_settings, "MODEL_DIR", django_settings.BASE_DIR / "models"
    ) / "registry"
    base.mkdir(parents=True, exist_ok=True)
    return base


class TrainedModel(models.Model):
    """
    A model somebody trained in the research workspace, kept with its scores.

    Training a model and then throwing it away teaches nobody anything. Each
    run is recorded here with the numbers it earned, and one of them can be
    promoted to the model the prescribing side actually uses. Promoting is
    reversible: the previous live model is retired rather than deleted.
    """

    class Status(models.TextChoices):
        TRAINED = "trained", "Trained"
        LIVE = "live", "Live"
        RETIRED = "retired", "Retired"

    class Task(models.TextChoices):
        PAIRS = "pairs", "Drug pair interaction"
        TABULAR = "tabular", "Tabular classification"

    name = models.CharField(max_length=160)
    task = models.CharField(max_length=10, choices=Task.choices)
    algorithm = models.CharField(max_length=40)

    dataset_name = models.CharField(max_length=200, blank=True)
    dataset_rows = models.PositiveIntegerField(default=0)
    target = models.CharField(max_length=120, blank=True)
    classes = models.JSONField(default=list, blank=True)
    features = models.JSONField(default=list, blank=True)

    rows_trained = models.PositiveIntegerField(default=0)
    rows_tested = models.PositiveIntegerField(default=0)
    metrics = models.JSONField(default=dict, blank=True)
    graph = models.JSONField(default=dict, blank=True)
    warnings = models.JSONField(default=list, blank=True)

    # A bundle on disk: the fitted model plus everything needed to use it
    # (the interaction graph, the drug names, the documented pairs).
    bundle_name = models.CharField(max_length=120, blank=True)
    bundle_bytes = models.PositiveBigIntegerField(default=0)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.TRAINED)
    trained_by = models.ForeignKey(
        "User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="trained_models",
    )
    trained_by_name = models.CharField(max_length=120, blank=True)
    trained_at = models.DateTimeField(auto_now_add=True)

    promoted_at = models.DateTimeField(null=True, blank=True)
    promoted_by_name = models.CharField(max_length=120, blank=True)
    note = models.TextField(blank=True)

    class Meta:
        ordering = ["-trained_at"]

    def __str__(self):
        return f"{self.name} ({self.get_status_display()})"

    @property
    def bundle_path(self):
        return registry_dir() / self.bundle_name if self.bundle_name else None

    @property
    def can_promote(self):
        """
        Only a pair model can take over the prescribing check.

        A tabular run predicts whatever column the researcher chose, which is
        not the question the prescribing side asks. It is kept for the record
        and for comparison, not for promotion.
        """
        return self.task == self.Task.PAIRS and bool(self.bundle_name)

    def score(self, name="f1"):
        best = self.metrics.get(self.algorithm) or {}
        return (best.get("metrics") or {}).get(name)


class ResearchSettings(models.Model):
    """
    One row, shared by the workspace.

    The review threshold is not a display preference: it decides which pairs
    the server sends for a human decision, so it has to live here rather than
    in one researcher's browser.
    """

    review_threshold = models.PositiveSmallIntegerField(default=70)
    test_size = models.FloatField(default=0.2)
    warn_leakage = models.BooleanField(default=True)
    auto_raise = models.BooleanField(default=True)

    updated_at = models.DateTimeField(auto_now=True)
    updated_by_name = models.CharField(max_length=120, blank=True)

    class Meta:
        verbose_name_plural = "Research settings"

    @classmethod
    def load(cls):
        row, _ = cls.objects.get_or_create(pk=1)
        return row