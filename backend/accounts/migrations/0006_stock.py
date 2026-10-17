# Pharmacy stock: what is on the shelf, and every change to it.

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_duplicate_checks"),
    ]

    operations = [
        migrations.CreateModel(
            name="StockItem",
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
                (
                    "form",
                    models.CharField(
                        help_text="Strength and presentation, e.g. Tablet 5 mg.",
                        max_length=80,
                    ),
                ),
                (
                    "level",
                    models.PositiveIntegerField(
                        default=0, help_text="Units on the shelf now. Never above 500."
                    ),
                ),
                (
                    "reorder_at",
                    models.PositiveIntegerField(
                        default=0, help_text="Below this the item is flagged as low."
                    ),
                ),
                ("is_active", models.BooleanField(default=True)),
                ("updated_at", models.DateTimeField(default=django.utils.timezone.now)),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="stock_updates",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["drug", "form"],
            },
        ),
        migrations.CreateModel(
            name="StockMovement",
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
                ("change", models.IntegerField()),
                ("level_after", models.PositiveIntegerField()),
                (
                    "reason",
                    models.CharField(
                        choices=[
                            ("order", "Ordered in"),
                            ("dispense", "Dispensed"),
                            ("adjust", "Adjusted by hand"),
                            ("return", "Returned to the shelf"),
                        ],
                        max_length=10,
                    ),
                ),
                ("note", models.CharField(blank=True, max_length=200)),
                ("moved_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("moved_by_name", models.CharField(blank=True, max_length=120)),
                (
                    "item",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="movements",
                        to="accounts.stockitem",
                    ),
                ),
                (
                    "moved_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="stock_movements",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-moved_at"],
            },
        ),
        migrations.AddIndex(
            model_name="stockitem",
            index=models.Index(fields=["drug"], name="accounts_st_drug_edf276_idx"),
        ),
        migrations.AddConstraint(
            model_name="stockitem",
            constraint=models.UniqueConstraint(
                fields=("drug", "form"), name="unique_drug_form"
            ),
        ),
        migrations.AddIndex(
            model_name="stockmovement",
            index=models.Index(
                fields=["item", "-moved_at"], name="accounts_st_item_id_46155a_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="stockmovement",
            index=models.Index(
                fields=["-moved_at"], name="accounts_st_moved_a_147e3a_idx"
            ),
        ),
    ]