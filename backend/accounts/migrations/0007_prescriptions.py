# Prescriptions: what the doctor sent, how it was graded, and what was dispensed.

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0006_stock"),
    ]

    operations = [
        migrations.CreateModel(
            name="Prescription",
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
                ("reference", models.CharField(max_length=24, unique=True)),
                ("patient_name", models.CharField(max_length=160)),
                ("file_number", models.CharField(max_length=40)),
                (
                    "patient_age",
                    models.PositiveSmallIntegerField(blank=True, null=True),
                ),
                ("ward", models.CharField(blank=True, max_length=80)),
                ("prescriber_name", models.CharField(blank=True, max_length=160)),
                ("prescriber_id_text", models.CharField(blank=True, max_length=32)),
                (
                    "severity",
                    models.CharField(
                        choices=[
                            ("severe", "Severe"),
                            ("moderate", "Moderate"),
                            ("mild", "Mild"),
                            ("clear", "No warning"),
                            ("unknown", "Not screened"),
                        ],
                        default="unknown",
                        max_length=10,
                    ),
                ),
                ("screening", models.JSONField(blank=True, default=dict)),
                ("override_reason", models.TextField(blank=True, max_length=2000)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("waiting", "Waiting at the pharmacy"),
                            ("dispensed", "Dispensed"),
                            ("queried", "Sent back to the prescriber"),
                            ("cancelled", "Cancelled"),
                        ],
                        default="waiting",
                        max_length=10,
                    ),
                ),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("handled_by_name", models.CharField(blank=True, max_length=160)),
                ("handled_at", models.DateTimeField(blank=True, null=True)),
                ("pharmacy_note", models.TextField(blank=True, max_length=2000)),
                (
                    "handled_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="prescriptions_handled",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "patient",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="prescriptions",
                        to="accounts.patient",
                    ),
                ),
                (
                    "prescriber",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="prescriptions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="PrescriptionItem",
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
                ("drug", models.CharField(max_length=120)),
                ("dose", models.CharField(blank=True, max_length=60)),
                ("frequency", models.CharField(blank=True, max_length=60)),
                ("quantity", models.PositiveIntegerField(blank=True, null=True)),
                ("dispensed_quantity", models.PositiveIntegerField(default=0)),
                (
                    "prescription",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="accounts.prescription",
                    ),
                ),
                (
                    "stock_item",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="prescribed",
                        to="accounts.stockitem",
                    ),
                ),
            ],
            options={
                "ordering": ["id"],
            },
        ),
        migrations.AddIndex(
            model_name="prescription",
            index=models.Index(
                fields=["status", "-created_at"], name="accounts_pr_status_baad01_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="prescription",
            index=models.Index(
                fields=["reference"], name="accounts_pr_referen_d943ba_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="prescription",
            index=models.Index(
                fields=["-created_at"], name="accounts_pr_created_807bf7_idx"
            ),
        ),
    ]