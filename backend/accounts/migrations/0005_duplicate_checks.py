# Matching an upload on the ID number, and holding one that clashes.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_patient_files"),
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
                    ("file.held", "Patient file held for a decision"),
                    ("record.created", "Patient record created"),
                    ("record.updated", "Patient record edited"),
                    ("record.confirmed", "Patient record confirmed"),
                ],
                max_length=40,
            ),
        ),
        migrations.AlterField(
            model_name="patientfile",
            name="stage",
            field=models.CharField(
                choices=[
                    ("uploaded", "Stored"),
                    ("reading", "Reading the pages"),
                    ("extracting", "Pulling out the details"),
                    ("done", "Done"),
                    ("failed", "Could not be read"),
                    ("held", "Held for a decision"),
                ],
                default="uploaded",
                max_length=12,
            ),
        ),
        migrations.AddIndex(
            model_name="patient",
            index=models.Index(
                fields=["id_number"], name="accounts_pa_id_numb_04b821_idx"
            ),
        ),
    ]