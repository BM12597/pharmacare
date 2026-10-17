"""
The research workspace gets real tables.

Three things that were previously either hardcoded in the page or thrown away
at the end of a training run:

  ReviewItem        drug pairs waiting for a human decision
  TrainedModel      every training run, with its scores, and which one is live
  ResearchSettings  one shared row, because the review threshold decides what
                    the server does rather than how a page looks
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0008_collection"),
    ]

    operations = [
        migrations.CreateModel(
            name="ReviewItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("key", models.CharField(max_length=320, unique=True)),
                ("drug_a", models.CharField(max_length=150)),
                ("drug_b", models.CharField(max_length=150)),
                ("confidence", models.FloatField(blank=True, null=True)),
                ("probability", models.FloatField(blank=True, null=True)),
                ("prediction", models.CharField(default="unknown", max_length=40)),
                ("source", models.CharField(
                    choices=[("model", "Model, low confidence"), ("staff", "Raised by staff")],
                    default="model", max_length=10)),
                ("raised_by_name", models.CharField(blank=True, max_length=120)),
                ("context", models.CharField(blank=True, max_length=120)),
                ("note", models.TextField(blank=True)),
                ("times_seen", models.PositiveIntegerField(default=1)),
                ("last_seen_at", models.DateTimeField(auto_now=True)),
                ("status", models.CharField(
                    choices=[("waiting", "Waiting"),
                             ("confirmed", "Confirmed as an interaction"),
                             ("rejected", "Rejected — no interaction")],
                    default="waiting", max_length=10)),
                ("decided_by_name", models.CharField(blank=True, max_length=120)),
                ("decided_at", models.DateTimeField(blank=True, null=True)),
                ("decision_note", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("decided_by", models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name="review_items_decided", to="accounts.user")),
                ("raised_by", models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name="review_items_raised", to="accounts.user")),
            ],
            options={
                "ordering": ["status", "confidence", "-times_seen", "-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="reviewitem",
            index=models.Index(fields=["status", "-created_at"], name="accounts_re_status_e82d74_idx"),
        ),
        migrations.CreateModel(
            name="TrainedModel",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=160)),
                ("task", models.CharField(
                    choices=[("pairs", "Drug pair interaction"), ("tabular", "Tabular classification")],
                    max_length=10)),
                ("algorithm", models.CharField(max_length=40)),
                ("dataset_name", models.CharField(blank=True, max_length=200)),
                ("dataset_rows", models.PositiveIntegerField(default=0)),
                ("target", models.CharField(blank=True, max_length=120)),
                ("classes", models.JSONField(blank=True, default=list)),
                ("features", models.JSONField(blank=True, default=list)),
                ("rows_trained", models.PositiveIntegerField(default=0)),
                ("rows_tested", models.PositiveIntegerField(default=0)),
                ("metrics", models.JSONField(blank=True, default=dict)),
                ("graph", models.JSONField(blank=True, default=dict)),
                ("warnings", models.JSONField(blank=True, default=list)),
                ("bundle_name", models.CharField(blank=True, max_length=120)),
                ("bundle_bytes", models.PositiveBigIntegerField(default=0)),
                ("status", models.CharField(
                    choices=[("trained", "Trained"), ("live", "Live"), ("retired", "Retired")],
                    default="trained", max_length=10)),
                ("trained_by_name", models.CharField(blank=True, max_length=120)),
                ("trained_at", models.DateTimeField(auto_now_add=True)),
                ("promoted_at", models.DateTimeField(blank=True, null=True)),
                ("promoted_by_name", models.CharField(blank=True, max_length=120)),
                ("note", models.TextField(blank=True)),
                ("trained_by", models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name="trained_models", to="accounts.user")),
            ],
            options={
                "ordering": ["-trained_at"],
            },
        ),
        migrations.CreateModel(
            name="ResearchSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("review_threshold", models.PositiveSmallIntegerField(default=70)),
                ("test_size", models.FloatField(default=0.2)),
                ("warn_leakage", models.BooleanField(default=True)),
                ("auto_raise", models.BooleanField(default=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by_name", models.CharField(blank=True, max_length=120)),
            ],
            options={
                "verbose_name_plural": "Research settings",
            },
        ),
    ]