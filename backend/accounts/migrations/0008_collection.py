# Collection: the emailed link, the typed code, and the one-use counter code.

import accounts.models
import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0007_prescriptions"),
    ]

    operations = [
        migrations.AddField(
            model_name="patient",
            name="email",
            field=models.EmailField(blank=True, max_length=254),
        ),
        migrations.CreateModel(
            name="Collection",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "link_token",
                    models.CharField(
                        default=accounts.models._token, max_length=64, unique=True
                    ),
                ),
                (
                    "code",
                    models.CharField(
                        db_index=True,
                        default=accounts.models.generate_collection_code,
                        max_length=12,
                    ),
                ),
                ("sent_to", models.EmailField(blank=True, max_length=254)),
                ("sent_at", models.DateTimeField(blank=True, null=True)),
                ("send_error", models.CharField(blank=True, max_length=300)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("issued", "Code issued"),
                            ("armed", "Waiting for the patient to confirm"),
                            ("collected", "Confirmed by the patient"),
                            ("expired", "Code expired"),
                            ("cancelled", "Cancelled"),
                        ],
                        default="issued",
                        max_length=10,
                    ),
                ),
                (
                    "qr_token",
                    models.CharField(blank=True, db_index=True, max_length=64),
                ),
                ("qr_expires_at", models.DateTimeField(blank=True, null=True)),
                ("armed_at", models.DateTimeField(blank=True, null=True)),
                ("arm_count", models.PositiveSmallIntegerField(default=0)),
                ("attempts", models.PositiveSmallIntegerField(default=0)),
                ("confirmed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "confirmed_by",
                    models.CharField(
                        blank=True,
                        help_text="scan or code — how the patient proved they were here.",
                        max_length=20,
                    ),
                ),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                (
                    "armed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="collections_armed",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "prescription",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="collection",
                        to="accounts.prescription",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(
                        fields=["status"], name="accounts_co_status_035087_idx"
                    ),
                    models.Index(fields=["code"], name="accounts_co_code_87d4e5_idx"),
                ],
            },
        ),
    ]