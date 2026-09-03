"""
User accounts for PharmaCare+.

Staff do not register themselves. A superuser creates every account from the
management portal, choosing the role and issuing the ID and password. People
sign in with that ID rather than an email address, which matches how hospital
and pharmacy staff numbers already work.
"""

import secrets

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