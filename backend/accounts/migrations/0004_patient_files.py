# Patient files: the digital record, the uploaded document, and the edit history.

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_activitylog_supportticket"),
    ]

    operations = [
        migrations.AlterField(
            model_name="activitylog",
            name="action",
            field=models.CharField(
                choices=[
                    ("account.created", "Account created"),
                    ("account.updated", "Account updated"),
                    ("account.revoked", "Access revoked"),
                    ("account.restored", "Access restored"),
                    ("account.password_reset", "Password reset"),
                    ("account.deleted", "Account deleted"),
                    ("ticket.closed", "Support request closed"),
                    ("ticket.reopened", "Support request reopened"),
                    ("auth.login_failed", "Failed sign in"),
                    ("file.uploaded", "Patient file uploaded"),
                    ("record.created", "Patient record created"),
                    ("record.updated", "Patient record edited"),
                    ("record.confirmed", "Patient record confirmed"),
                ],
                max_length=40,
            ),
        ),
        migrations.CreateModel(
            name="Patient",
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
                    "file_number",
                    models.CharField(
                        help_text="The hospital file number, e.g. DGMH-2026-04812.",
                        max_length=40,
                        unique=True,
                    ),
                ),
                (
                    "id_number",
                    models.CharField(
                        blank=True, max_length=20, verbose_name="ID number"
                    ),
                ),
                ("full_name", models.CharField(max_length=160)),
                ("date_of_birth", models.DateField(blank=True, null=True)),
                ("stated_age", models.PositiveSmallIntegerField(blank=True, null=True)),
                (
                    "sex",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("F", "Female"),
                            ("M", "Male"),
                            ("O", "Other"),
                            ("", "Not recorded"),
                        ],
                        max_length=1,
                    ),
                ),
                ("ward", models.CharField(blank=True, max_length=80)),
                ("home_area", models.CharField(blank=True, max_length=120)),
                ("address", models.CharField(blank=True, max_length=240)),
                ("language", models.CharField(blank=True, max_length=80)),
                ("phone", models.CharField(blank=True, max_length=40)),
                ("next_of_kin", models.CharField(blank=True, max_length=160)),
                ("next_of_kin_phone", models.CharField(blank=True, max_length=40)),
                ("encounter", models.JSONField(blank=True, default=dict)),
                ("conditions", models.JSONField(blank=True, default=list)),
                ("medication", models.JSONField(blank=True, default=list)),
                ("allergies", models.JSONField(blank=True, default=list)),
                ("history_notes", models.TextField(blank=True)),
                ("observations", models.JSONField(blank=True, default=dict)),
                ("assessment", models.TextField(blank=True)),
                ("plan", models.TextField(blank=True)),
                (
                    "source",
                    models.CharField(
                        choices=[
                            ("upload", "Read from an uploaded file"),
                            ("manual", "Entered by hand"),
                        ],
                        default="manual",
                        max_length=10,
                    ),
                ),
                (
                    "needs_review",
                    models.BooleanField(
                        default=False,
                        help_text="Set on anything read out of an uploaded file, until a doctor confirms it.",
                    ),
                ),
                ("confirmed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(default=django.utils.timezone.now)),
                (
                    "confirmed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="patients_confirmed",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="patients_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="patients_updated",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-updated_at"],
            },
        ),
        migrations.CreateModel(
            name="PatientFile",
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
                ("original_name", models.CharField(max_length=240)),
                ("content_type", models.CharField(blank=True, max_length=80)),
                ("size_bytes", models.BigIntegerField(default=0)),
                ("page_count", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("cloud_public_id", models.CharField(blank=True, max_length=240)),
                ("cloud_url", models.URLField(blank=True, max_length=500)),
                ("cloud_resource_type", models.CharField(blank=True, max_length=20)),
                (
                    "stage",
                    models.CharField(
                        choices=[
                            ("uploaded", "Stored"),
                            ("reading", "Reading the pages"),
                            ("extracting", "Pulling out the details"),
                            ("done", "Done"),
                            ("failed", "Could not be read"),
                        ],
                        default="uploaded",
                        max_length=12,
                    ),
                ),
                ("detail", models.CharField(blank=True, max_length=300)),
                ("text_chars", models.PositiveIntegerField(default=0)),
                ("page_text", models.TextField(blank=True)),
                (
                    "read_as_image",
                    models.BooleanField(
                        default=False,
                        help_text="True when the PDF had no text layer and the page was read as a picture.",
                    ),
                ),
                ("extracted", models.JSONField(blank=True, default=dict)),
                (
                    "uploaded_at",
                    models.DateTimeField(default=django.utils.timezone.now),
                ),
                (
                    "patient",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="documents",
                        to="accounts.patient",
                    ),
                ),
                (
                    "uploaded_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="files_uploaded",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-uploaded_at"],
            },
        ),
        migrations.CreateModel(
            name="PatientRecordVersion",
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
                ("snapshot", models.JSONField(default=dict)),
                ("changed_fields", models.JSONField(blank=True, default=list)),
                ("note", models.CharField(blank=True, max_length=300)),
                ("edited_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("edited_by_name", models.CharField(blank=True, max_length=160)),
                ("edited_by_id_text", models.CharField(blank=True, max_length=32)),
                (
                    "edited_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="record_edits",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "patient",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="versions",
                        to="accounts.patient",
                    ),
                ),
            ],
            options={
                "ordering": ["-edited_at"],
            },
        ),
        migrations.AddIndex(
            model_name="patient",
            index=models.Index(
                fields=["file_number"], name="accounts_pa_file_nu_2334b4_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="patient",
            index=models.Index(
                fields=["-updated_at"], name="accounts_pa_updated_b68bbd_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="patient",
            index=models.Index(fields=["ward"], name="accounts_pa_ward_576f4f_idx"),
        ),
        migrations.AddIndex(
            model_name="patientfile",
            index=models.Index(
                fields=["-uploaded_at"], name="accounts_pa_uploade_f5dd00_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="patientfile",
            index=models.Index(fields=["stage"], name="accounts_pa_stage_b26005_idx"),
        ),
        migrations.AddIndex(
            model_name="patientrecordversion",
            index=models.Index(
                fields=["patient", "-edited_at"], name="accounts_pa_patient_76b098_idx"
            ),
        ),
    ]