"""
Put a starting stock list on the shelf.

Run once on a new system:

    python manage.py seed_stock

It only adds items that are not already there, so running it twice changes
nothing. Levels are a plausible starting point for a dispensary, not a
measurement of anything — change them from the Stock page.
"""

from django.core.management.base import BaseCommand

from accounts.models import MAX_STOCK_LEVEL, StockItem

# Drug, form, starting level, reorder point. Chosen to cover the interactions
# the screening knows about, so a prescription can be followed end to end.
STARTING_STOCK = [
    ("Amiodarone", "Tablet 200 mg", 86, 80),
    ("Amlodipine", "Tablet 5 mg", 300, 120),
    ("Amoxicillin", "Capsule 500 mg", 260, 100),
    ("Beclomethasone", "Inhaler 200 mcg", 130, 60),
    ("Carbamazepine", "Tablet 200 mg", 140, 60),
    ("Ciprofloxacin", "Tablet 500 mg", 180, 80),
    ("Dolutegravir", "Tablet 50 mg", 74, 120),
    ("Enalapril", "Tablet 10 mg", 0, 100),
    ("Ferrous sulphate", "Tablet 200 mg", 240, 90),
    ("Fluoxetine", "Capsule 20 mg", 190, 80),
    ("Folic acid", "Tablet 5 mg", 320, 100),
    ("Furosemide", "Tablet 40 mg", 210, 80),
    ("Hydrochlorothiazide", "Tablet 25 mg", 230, 90),
    ("Ibuprofen", "Tablet 400 mg", 410, 150),
    ("Insulin glargine", "Pen 100 U/mL", 0, 40),
    ("Isoniazid", "Tablet 300 mg", 165, 70),
    ("Metformin", "Tablet 850 mg", 380, 150),
    ("Metronidazole", "Tablet 400 mg", 200, 80),
    ("Paracetamol", "Tablet 500 mg", 480, 200),
    ("Prednisone", "Tablet 5 mg", 150, 60),
    ("Pyrazinamide", "Tablet 500 mg", 120, 50),
    ("Rifampicin", "Capsule 600 mg", 310, 120),
    ("Salbutamol", "Inhaler 100 mcg", 220, 90),
    ("Simvastatin", "Tablet 20 mg", 290, 110),
    ("Sotalol", "Tablet 80 mg", 160, 60),
    ("Spironolactone", "Tablet 25 mg", 95, 50),
    ("Sumatriptan", "Tablet 50 mg", 42, 50),
    ("Warfarin", "Tablet 5 mg", 240, 100),
]


class Command(BaseCommand):
    help = "Add the starting stock list, skipping anything already on the shelf."

    def handle(self, *args, **options):
        added, skipped = 0, 0

        for drug, form, level, reorder_at in STARTING_STOCK:
            _, created = StockItem.objects.get_or_create(
                drug=drug,
                form=form,
                defaults={
                    "level": min(level, MAX_STOCK_LEVEL),
                    "reorder_at": reorder_at,
                },
            )
            if created:
                added += 1
            else:
                skipped += 1

        self.stdout.write(self.style.SUCCESS(
            f"{added} added, {skipped} already there. {StockItem.objects.count()} items on the shelf."
        ))