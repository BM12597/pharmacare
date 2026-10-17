"""
The trained interaction models, wired into the application.

Two models, both built in build_pipeline.py:

  * LightGBM over graph topology features, which predicts whether two drugs
    interact when the pair is not already documented.
  * TF-IDF and logistic regression over the interaction text, which labels the
    mechanism of a documented interaction.

Documented pairs are returned from the lookup table rather than predicted.
There is no sense asking a model to guess something the dataset already
states outright.

Two rules this module enforces that the notebook version does not:

  1. An unrecognised drug name is reported as unrecognised. The graph gives an
     unknown name zero edges, and the model scores that near 1%, which reads
     as "safe" when it means "never heard of it". For a prescribing tool that
     is the most dangerous possible failure, so it is refused outright.

  2. A mechanism is only reported for documented pairs. For an inferred pair
     the classifier is reading a placeholder sentence, so whatever it returns
     says nothing about the drugs.
"""

import logging
import math
import threading

import numpy as np
import pandas as pd
from django.conf import settings

logger = logging.getLogger(__name__)

# Where build_pipeline.py wrote its artifacts.
MODEL_DIR = getattr(settings, "MODEL_DIR", settings.BASE_DIR / "models")

ARTIFACTS = {
    "lgb_model": "lightgbm_drug_model.pkl",
    "adj_graph": "adj_graph.pkl",
    "nlp_model": "nlp_mechanism_model.pkl",
    "vectorizer": "nlp_vectorizer.pkl",
    "desc_map": "desc_map.pkl",
    "canonical_drugs": "canonical_drugs.pkl",
}

# The column names the shipped LightGBM model was trained on, in the order it
# wants them. A model trained in the research workspace names its columns
# differently, so the names travel with the model rather than being assumed.
SHIPPED_FEATURES = [
    "Drug_1", "Drug_2",
    "deg_1", "deg_2", "common_neighbors",
    "jaccard", "adamic_adar", "pref_attachment",
]

# Everything above is roughly 40 MB on disk and takes a few seconds to load,
# so it is loaded once per worker and kept.
_bundle = None
_lock = threading.Lock()


def reset():
    """
    Forget the loaded models.

    Called when a different model is promoted in the research workspace, so
    the next prescription is checked against the new one without a restart.
    """
    global _bundle
    with _lock:
        _bundle = None


def _shipped_present():
    return all((MODEL_DIR / name).exists() for name in ARTIFACTS.values())


def _promoted_path():
    """The bundle a researcher promoted, or None to use the shipped files."""
    try:
        from . import registry

        return registry.live_bundle_path()
    except Exception:
        # The registry table may not exist yet on a half-migrated database.
        # That is not a reason to stop screening prescriptions.
        return None


def _load():
    global _bundle
    if _bundle is not None:
        return _bundle

    with _lock:
        if _bundle is not None:
            return _bundle

        import joblib

        promoted = _promoted_path()

        if promoted is not None:
            saved = joblib.load(promoted)

            # A promoted bundle replaces the prediction half outright: its own
            # model, its own graph, its own names. The mechanism classifier is
            # only there if the shipped files are installed, and a documented
            # pair falls back to the bundle's own table when they are not.
            shipped = _load_shipped(joblib) if _shipped_present() else {}

            _bundle = {
                "lgb_model": saved["model"],
                "adj_graph": saved["graph"],
                "canonical_drugs": saved["canonical"],
                "desc_map": saved.get("desc_map") or shipped.get("desc_map") or {},
                "nlp_model": shipped.get("nlp_model"),
                "vectorizer": shipped.get("vectorizer"),
                "feature_names": saved.get("feature_order") or SHIPPED_FEATURES,
                "origin": "promoted",
            }

            logger.info("Promoted model loaded from %s: %s drugs", promoted.name,
                        len(_bundle["adj_graph"]))
            return _bundle

        if not _shipped_present():
            missing = [n for n in ARTIFACTS.values() if not (MODEL_DIR / n).exists()]
            raise FileNotFoundError(
                f"{missing[0]} is missing from {MODEL_DIR}. Run build_pipeline.py "
                "and copy the .pkl files there, or train and promote a model in "
                "the research workspace."
            )

        loaded = _load_shipped(joblib)
        loaded["feature_names"] = SHIPPED_FEATURES
        loaded["origin"] = "shipped"

        _bundle = loaded
        logger.info("Interaction models loaded: %s drugs, %s documented pairs",
                    len(loaded["adj_graph"]), len(loaded["desc_map"]))
        return _bundle


def _load_shipped(joblib):
    loaded = {}
    for key, filename in ARTIFACTS.items():
        path = MODEL_DIR / filename
        if not path.exists():
            raise FileNotFoundError(
                f"{filename} is missing from {MODEL_DIR}. Run build_pipeline.py "
                "and copy the .pkl files there."
            )
        loaded[key] = joblib.load(path)
    return loaded


def is_ready():
    """
    Whether anything is installed to screen with.

    Either the shipped artifacts, or a model somebody trained and promoted in
    the research workspace. Both are checked without loading 40 MB.
    """
    return _promoted_path() is not None or _shipped_present()


def source():
    """Which models are answering: 'promoted', 'shipped' or None."""
    if _promoted_path() is not None:
        return "promoted"
    return "shipped" if _shipped_present() else None


# ---------------------------------------------------------------- naming

# The dataset uses DrugBank names. South African prescriptions do not. Without
# this, the two commonest drugs in the country miss the graph entirely.
SYNONYMS = {
    "aspirin": "acetylsalicylic acid",
    "asa": "acetylsalicylic acid",
    "disprin": "acetylsalicylic acid",
    "paracetamol": "acetaminophen",
    "panado": "acetaminophen",
    "adco-dol": "acetaminophen",
    "salbutamol": "salbutamol",
    "albuterol": "salbutamol",
    "adrenaline": "epinephrine",
    "noradrenaline": "norepinephrine",
    "frusemide": "furosemide",
    "lignocaine": "lidocaine",
    "amoxycillin": "amoxicillin",
    "co-trimoxazole": "sulfamethoxazole",
    "bactrim": "sulfamethoxazole",
    "rifampin": "rifampicin",
    "glibenclamide": "glyburide",
    "pethidine": "meperidine",
    "cyclosporin": "cyclosporine",
    "oestradiol": "estradiol",
    "thyroxine": "levothyroxine",
    "vitamin k": "phytonadione",
    "folate": "folic acid",
}


def resolve(name):
    """
    Turn what somebody typed into a name the model knows.

    Returns (canonical_name, matched_how) where matched_how is 'exact',
    'synonym', 'partial' or None.
    """
    bundle = _load()
    canonical = bundle["canonical_drugs"]

    key = (name or "").strip().lower()
    if not key:
        return None, None

    if key in canonical:
        return canonical[key], "exact"

    if key in SYNONYMS and SYNONYMS[key] in canonical:
        return canonical[SYNONYMS[key]], "synonym"

    # "Warfarin sodium 5 mg" should still find warfarin.
    first_word = key.split()[0]
    if first_word in canonical:
        return canonical[first_word], "partial"
    if first_word in SYNONYMS and SYNONYMS[first_word] in canonical:
        return canonical[SYNONYMS[first_word]], "synonym"

    return None, None


def suggest(name, limit=6):
    """Near matches, so an unrecognised name can offer something useful."""
    bundle = _load()
    key = (name or "").strip().lower()
    if len(key) < 3:
        return []

    names = bundle["canonical_drugs"]
    starts = [v for k, v in names.items() if k.startswith(key)]
    contains = [v for k, v in names.items() if key in k and v not in starts]

    # A search for "aspirin" should find acetylsalicylic acid, or the type-ahead
    # is useless for exactly the names people actually type.
    for typed, dataset_name in SYNONYMS.items():
        if typed.startswith(key) or key in typed:
            resolved = names.get(dataset_name)
            if resolved and resolved not in starts and resolved not in contains:
                starts.append(resolved)

    return (starts + contains)[:limit]


# ---------------------------------------------------------------- features

def graph_features(drug_a, drug_b):
    """The six topology features the LightGBM model was trained on."""
    graph = _load()["adj_graph"]

    neighbours_a = graph.get(drug_a, set())
    neighbours_b = graph.get(drug_b, set())
    common = neighbours_a & neighbours_b
    union = len(neighbours_a | neighbours_b)

    return {
        "deg_1": len(neighbours_a),
        "deg_2": len(neighbours_b),
        "common_neighbors": len(common),
        "jaccard": len(common) / union if union else 0.0,
        "adamic_adar": sum(1.0 / math.log(len(graph[z])) for z in common if len(graph[z]) > 1),
        "pref_attachment": len(neighbours_a) * len(neighbours_b),
    }


# The dataset says an interaction exists, not how bad it is. Grading every
# documented pair as severe means a doctor sees five red warnings on a routine
# script and stops reading them, which is worse than no warnings at all. The
# mechanism classifier already sorts interactions into kinds, so the grade
# comes from there. These bands are a clinical judgement call, not a model
# output, and are meant to be reviewed by a pharmacist.
MECHANISM_SEVERITY = {
    "Increased Serum Concentration (Toxicity Risk)": "severe",
    "Increased Severity of Adverse Reactions": "severe",
    "Decreased Serum Concentration (Reduced Efficacy)": "moderate",
    "Altered Metabolic Rate": "moderate",
    "Altered Excretion Rate": "moderate",
    "Increased Photosensitizing Activity Risk": "mild",
    "General Mechanism Alteration": "moderate",
}

# Some things are dangerous whatever the mechanism text says.
HIGH_RISK_TERMS = [
    "anticoagulant", "bleeding", "haemorrh", "hemorrh",
    "qt", "arrhythm", "serotonin syndrome", "respiratory depression",
    "lactic acidosis", "nephrotox", "hepatotox", "myopathy", "rhabdomyolysis",
]


def documented_severity(description, mechanism):
    lowered = (description or "").lower()

    if any(term in lowered for term in HIGH_RISK_TERMS):
        return "severe"

    return MECHANISM_SEVERITY.get(mechanism, "moderate")


def band(probability):
    if probability >= 0.85:
        return "severe"
    if probability >= 0.5:
        return "moderate"
    if probability >= 0.25:
        return "mild"
    return "clear"


# ---------------------------------------------------------------- the check

def analyze(name_a, name_b):
    """
    Check one pair.

    'source' says where the answer came from and matters more than the number:

      documented   the dataset states this interaction outright
      predicted    the model inferred it from the interaction graph
      unrecognised one or both names are not in the dataset
    """
    canonical_a, match_a = resolve(name_a)
    canonical_b, match_b = resolve(name_b)

    unknown = [
        original for original, resolved in [(name_a, canonical_a), (name_b, canonical_b)]
        if resolved is None
    ]

    if unknown:
        return {
            "drug_a": name_a,
            "drug_b": name_b,
            "source": "unrecognised",
            "severity": "unknown",
            "probability": None,
            "unknown_drugs": unknown,
            "suggestions": {drug: suggest(drug) for drug in unknown},
            "description": (
                f"{' and '.join(unknown)} not found in the interaction dataset. "
                "This is not a safety result — check the spelling or use the generic name."
            ),
            "mechanism": None,
        }

    bundle = _load()
    key = (canonical_a.lower(), canonical_b.lower())
    documented = bundle["desc_map"].get(key)

    if documented is not None:
        # The mechanism classifier is one of the shipped artifacts. A promoted
        # model trained on a file without the shipped files installed has the
        # documented pairs but nothing to label them with, and saying nothing
        # is better than inventing a mechanism.
        mechanism = None
        if bundle.get("nlp_model") is not None and bundle.get("vectorizer") is not None:
            mechanism = str(bundle["nlp_model"].predict(
                bundle["vectorizer"].transform([documented])
            )[0])

        return {
            "drug_a": canonical_a,
            "drug_b": canonical_b,
            "matched_as": [match_a, match_b],
            "source": "documented",
            "severity": documented_severity(documented, mechanism),
            "probability": 1.0,
            "description": documented,
            "mechanism": mechanism,
        }

    features = graph_features(canonical_a, canonical_b)

    # The column names belong to whichever model is loaded. The shipped one
    # calls them Drug_1 and deg_1; one trained in the research workspace calls
    # them drug_a and degree_a. The values are the same six numbers either way.
    names = bundle.get("feature_names") or SHIPPED_FEATURES
    values = [
        canonical_a, canonical_b,
        features["deg_1"], features["deg_2"], features["common_neighbors"],
        features["jaccard"], features["adamic_adar"], features["pref_attachment"],
    ]

    frame = pd.DataFrame([dict(zip(names, values))])
    for column in names[:2]:
        frame[column] = frame[column].astype("category")

    probability = float(bundle["lgb_model"].predict_proba(frame)[0][1])

    return {
        "drug_a": canonical_a,
        "drug_b": canonical_b,
        "matched_as": [match_a, match_b],
        "source": "predicted",
        "severity": band(probability),
        "probability": round(probability, 4),
        # No mechanism here: there is no text to read, so the classifier would
        # be labelling a placeholder sentence.
        "mechanism": None,
        "description": (
            "Not documented in the dataset. The model estimates the risk from how "
            "these two drugs sit in the interaction graph."
        ),
        "evidence": {
            "known_interactions_a": features["deg_1"],
            "known_interactions_b": features["deg_2"],
            "shared_partners": features["common_neighbors"],
            "jaccard": round(features["jaccard"], 4),
        },
    }


def screen(drug_names):
    """Every pair in a prescription, worst first."""
    names = [n for n in dict.fromkeys(n.strip() for n in drug_names if n and n.strip())]

    results = []
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            results.append(analyze(names[i], names[j]))

    order = {"severe": 0, "moderate": 1, "mild": 2, "unknown": 3, "clear": 4}
    results.sort(key=lambda r: (order.get(r["severity"], 5), -(r["probability"] or 0)))

    return {
        "drugs": names,
        "pairs_checked": len(results),
        "findings": [r for r in results if r["severity"] != "clear"],
        "clear": [r for r in results if r["severity"] == "clear"],
        "worst": results[0]["severity"] if results else "clear",
    }