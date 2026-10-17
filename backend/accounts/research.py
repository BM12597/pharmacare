"""
The research pipeline.

Profiling and training are kept separate on purpose. A researcher uploads a
file, sees what is in it and confirms which column is the outcome, and only
then spends time on a training run. Guessing wrong and training anyway wastes
the run and teaches nobody anything.

Everything returned here is plain JSON so the frontend can draw the charts
itself; no images are generated server-side.
"""

import io
import math

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from lightgbm import LGBMClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

MAX_ROWS = 200_000
MAX_CATEGORIES = 40          # beyond this a column is an identifier, not a feature
CV_ROW_LIMIT = 20_000        # cross validation costs five more fits; not worth it past this
CURVE_POINTS = 60            # enough to draw a smooth curve without a huge payload


# ----------------------------------------------------------------- helpers

def _clean(value):
    """NaN and infinity are not valid JSON."""
    if value is None:
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        return None if (math.isnan(value) or math.isinf(value)) else round(float(value), 4)
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    return value


def _thin(values, target=CURVE_POINTS):
    """Cut a long curve down to a drawable number of points, keeping the ends."""
    values = list(values)
    if len(values) <= target:
        return values
    step = len(values) / target
    picked = [values[int(i * step)] for i in range(target)]
    picked[-1] = values[-1]
    return picked


def read_csv(raw_bytes, filename=""):
    """Read an uploaded file into a DataFrame, tolerating the usual variations."""
    if filename.lower().endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(raw_bytes))

    text = raw_bytes.decode("utf-8-sig", errors="replace")

    # Comma, semicolon and tab all turn up in exported clinical data.
    for separator in [",", ";", "\t", "|"]:
        try:
            frame = pd.read_csv(io.StringIO(text), sep=separator)
        except Exception:
            continue
        if frame.shape[1] > 1:
            return frame

    return pd.read_csv(io.StringIO(text))


# ----------------------------------------------------------------- profiling

def _looks_like_target(name, series):
    """Score how likely a column is the thing we are trying to predict."""
    lowered = name.lower()
    score = 0

    for word, weight in [("interact", 5), ("label", 4), ("target", 4), ("outcome", 3),
                         ("severity", 3), ("class", 2), ("risk", 2), ("adverse", 2),
                         ("result", 1)]:
        if word in lowered:
            score += weight

    unique = series.dropna().nunique()
    if unique == 2:
        score += 3
    elif 2 < unique <= 6:
        score += 2
    elif unique > 20:
        score -= 4

    return score


def profile(frame):
    """What is in this file, and what should we predict from it."""
    if len(frame) > MAX_ROWS:
        frame = frame.head(MAX_ROWS)

    columns = []
    for name in frame.columns:
        series = frame[name]
        numeric = pd.api.types.is_numeric_dtype(series)
        unique = int(series.dropna().nunique())

        columns.append({
            "name": str(name),
            "kind": "numeric" if numeric else "categorical",
            "missing": int(series.isna().sum()),
            "missing_pct": _clean(series.isna().mean() * 100),
            "unique": unique,
            "sample": [str(v) for v in series.dropna().unique()[:4]],
            "target_score": _looks_like_target(str(name), series),
        })

    ranked = sorted(columns, key=lambda c: c["target_score"], reverse=True)
    suggested = ranked[0]["name"] if ranked and ranked[0]["target_score"] > 0 else None

    usable = [
        c["name"] for c in columns
        if c["name"] != suggested
        and (c["kind"] == "numeric" or c["unique"] <= MAX_CATEGORIES)
        and c["missing_pct"] < 60
    ]

    return {
        "rows": int(len(frame)),
        "columns": columns,
        "edge_list": detect_edge_list(frame),
        "suggested_target": suggested,
        "suggested_features": usable,
        "preview": [
            {str(k): _clean(v) if not isinstance(v, str) else v for k, v in row.items()}
            for row in frame.head(8).to_dict("records")
        ],
    }


def class_balance(series):
    counts = series.value_counts(dropna=False)
    return [{"label": str(label), "count": int(count)} for label, count in counts.items()]


def correlation(frame, columns):
    """Correlation between the numeric features, for the heatmap."""
    numeric = frame[columns].select_dtypes(include=[np.number])
    numeric = numeric.loc[:, numeric.nunique() > 1]

    if numeric.shape[1] < 2:
        return {"labels": [], "matrix": []}

    numeric = numeric.iloc[:, :12]   # a 12x12 grid is the most that stays readable
    matrix = numeric.corr().fillna(0)

    return {
        "labels": [str(c) for c in matrix.columns],
        "matrix": [[_clean(v) for v in row] for row in matrix.values],
    }


# ----------------------------------------------------------- pair datasets

def detect_edge_list(frame):
    """
    Spot a file that lists interacting pairs and nothing else.

    A dataset like db_drug_interactions.csv has two drug columns and a
    description, every row an interaction. There is no label to learn from,
    because there are no examples of a pair that does not interact.
    """
    candidates = [
        c for c in frame.columns
        if not pd.api.types.is_numeric_dtype(frame[c]) and frame[c].nunique() > 20
    ]

    for i in range(len(candidates)):
        for j in range(i + 1, len(candidates)):
            left, right = candidates[i], candidates[j]

            values_left = set(frame[left].dropna().astype(str).str.strip())
            values_right = set(frame[right].dropna().astype(str).str.strip())
            shared = values_left & values_right

            # The same names appear in both columns, which is what an edge list
            # looks like. Free text would not overlap this way.
            smaller = min(len(values_left), len(values_right)) or 1
            if len(shared) / smaller < 0.3:
                continue

            # A long text column is a description, not a node.
            if frame[left].astype(str).str.len().mean() > 60:
                continue
            if frame[right].astype(str).str.len().mean() > 60:
                continue

            return {"left": str(left), "right": str(right),
                    "nodes": len(values_left | values_right)}

    return None


def build_from_pairs(frame, left, right, negative_ratio=1.0, max_pairs=40_000, seed=42,
                     description=None):
    """
    Turn a list of interacting pairs into something a model can learn from.

    Two steps, both from build_pipeline.py:

      1. Every listed pair is a positive. Pairs of drugs that are not listed
         together are sampled as negatives, on the assumption that an
         undocumented pair is far more likely to be safe than documented and
         omitted. That assumption is the weak point of this approach and is
         worth stating in a write-up.

      2. Each pair is described by where the two drugs sit in the interaction
         graph: how many partners each has, how many they share, and three
         standard link-prediction scores. The model never sees the drug names,
         so it has to learn from the structure.
    """
    rng = np.random.default_rng(seed)

    left_values = frame[left].astype(str).str.strip()
    right_values = frame[right].astype(str).str.strip()

    graph = {}
    for a, b in zip(left_values, right_values):
        if a == b:
            continue
        graph.setdefault(a, set()).add(b)
        graph.setdefault(b, set()).add(a)

    nodes = list(graph)
    if len(nodes) < 20:
        raise ValueError("Too few distinct drugs to build an interaction graph.")

    positives = {tuple(sorted((a, b))) for a, b in zip(left_values, right_values) if a != b}

    # Keep the run to a size that finishes while somebody is watching.
    budget = max(2000, int(max_pairs / (1 + negative_ratio)))
    positive_list = list(positives)

    if len(positive_list) > budget:
        picked = rng.choice(len(positive_list), budget, replace=False)
        positive_sample = [positive_list[i] for i in picked]
    else:
        positive_sample = positive_list

    wanted_negatives = int(len(positive_sample) * negative_ratio)
    negatives = set()
    attempts = 0

    while len(negatives) < wanted_negatives and attempts < wanted_negatives * 60:
        attempts += 1
        i, j = rng.integers(0, len(nodes), 2)
        if i == j:
            continue
        pair = tuple(sorted((nodes[i], nodes[j])))
        if pair not in positives:
            negatives.add(pair)

    # Precomputed once; the Adamic-Adar sum needs it for every shared partner.
    log_degree = {node: math.log(len(edges)) for node, edges in graph.items() if len(edges) > 1}

    def features_for(a, b):
        neighbours_a = graph.get(a, set())
        neighbours_b = graph.get(b, set())
        common = neighbours_a & neighbours_b
        union = len(neighbours_a | neighbours_b)

        return (
            len(neighbours_a),
            len(neighbours_b),
            len(common),
            len(common) / union if union else 0.0,
            sum(1.0 / log_degree[z] for z in common if z in log_degree),
            len(neighbours_a) * len(neighbours_b),
        )

    rows = []
    for pair, label in [(p, 1) for p in positive_sample] + [(p, 0) for p in negatives]:
        rows.append((*pair, *features_for(*pair), label))

    built = pd.DataFrame(rows, columns=[
        "drug_a", "drug_b",
        "degree_a", "degree_b", "common_neighbours",
        "jaccard", "adamic_adar", "preferential_attachment",
        "interaction",
    ]).sample(frac=1.0, random_state=seed).reset_index(drop=True)

    degrees = [len(edges) for edges in graph.values()]

    stats = {
        "nodes": len(nodes),
        "documented_pairs": len(positives),
        "positives_used": len(positive_sample),
        "negatives_generated": len(negatives),
        "mean_degree": round(float(np.mean(degrees)), 1),
        "max_degree": int(max(degrees)),
        "density": round(2 * len(positives) / (len(nodes) * (len(nodes) - 1)), 4),
    }

    # Everything the prescribing side would need to use this model later: the
    # graph it was built from, the spellings it knows, and the documented
    # pairs if the file carried a description for them.
    bundle = {
        "graph": graph,
        "canonical": {name.lower(): name for name in nodes},
        "desc_map": _descriptions(frame, left_values, right_values, description),
    }

    return built, stats, bundle


def _descriptions(frame, left_values, right_values, column):
    """
    The documented pairs, keyed the way the screening code looks them up.

    Without a description column this is empty, and a promoted model can
    predict but cannot quote the dataset. That is worth knowing rather than
    papering over with a placeholder sentence.
    """
    if not column or column not in frame.columns:
        return {}

    text = frame[column].astype(str)
    found = {}

    for a, b, description in zip(left_values, right_values, text):
        if a == b or not description or description.lower() == "nan":
            continue
        found[(a.lower(), b.lower())] = description[:1000]
        found[(b.lower(), a.lower())] = description[:1000]

    return found


# The drug names are included because LightGBM can split on them directly.
# Logistic regression drops them automatically, which makes the comparison
# between the two models more interesting rather than less.
PAIR_FEATURES = [
    "drug_a", "drug_b",
    "degree_a", "degree_b", "common_neighbours",
    "jaccard", "adamic_adar", "preferential_attachment",
]


# ----------------------------------------------------------------- training

def leak_check(frame, target, features):
    """
    Find features that give the answer away.

    A column derived from the label — a severity grade next to an interaction
    flag, say — will score beautifully and teach nothing. Better to say so than
    to report 100% accuracy with a straight face.
    """
    suspicious = []
    y = frame[target].astype(str)

    for name in features:
        series = frame[name]

        if pd.api.types.is_numeric_dtype(series) and series.nunique() > 12:
            continue

        grouped = pd.DataFrame({"feature": series.astype(str), "label": y})
        purity = grouped.groupby("feature")["label"].agg(
            lambda group: group.value_counts(normalize=True).max()
        )
        weights = grouped["feature"].value_counts(normalize=True)
        weighted_purity = float((purity * weights.reindex(purity.index)).sum())

        if weighted_purity >= 0.97:
            suspicious.append({
                "feature": str(name),
                "purity": _clean(weighted_purity * 100),
            })

    return suspicious


def _build_preprocessor(frame, features):
    numeric = [c for c in features if pd.api.types.is_numeric_dtype(frame[c])]
    categorical = [c for c in features if c not in numeric]

    # A column with a thousand distinct values becomes a thousand one-hot
    # columns, which is slower than the rest of the run put together and
    # rarely earns its keep. Dropped, and reported so nobody wonders why.
    dropped = [c for c in categorical if frame[c].nunique() > MAX_CATEGORIES]
    categorical = [c for c in categorical if c not in dropped]

    return ColumnTransformer([
        ("numeric", Pipeline([
            ("impute", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
        ]), numeric),
        ("categorical", Pipeline([
            ("impute", SimpleImputer(strategy="most_frequent")),
            ("encode", OneHotEncoder(handle_unknown="ignore", min_frequency=5, sparse_output=False)),
        ]), categorical),
    ], remainder="drop"), numeric, categorical, dropped


def _scores(y_true, y_pred, y_prob, positive_label):
    result = {
        "accuracy": _clean(accuracy_score(y_true, y_pred)),
        "precision": _clean(precision_score(y_true, y_pred, average="weighted", zero_division=0)),
        "recall": _clean(recall_score(y_true, y_pred, average="weighted", zero_division=0)),
        "f1": _clean(f1_score(y_true, y_pred, average="weighted", zero_division=0)),
        "roc_auc": None,
    }

    if y_prob is not None and len(np.unique(y_true)) == 2:
        result["roc_auc"] = _clean(roc_auc_score((y_true == positive_label).astype(int), y_prob))

    return result


def train(frame, target, features, test_size=0.2, random_state=42):
    """Train both models and return everything the charts need."""
    frame = frame[[target] + features].dropna(subset=[target])

    if len(frame) < 40:
        raise ValueError("At least 40 rows with a label are needed to train and test honestly.")

    y = frame[target]
    if pd.api.types.is_float_dtype(y) and y.nunique() > 12:
        raise ValueError(
            f"'{target}' looks continuous. Pick a column with a small number of "
            "distinct values, such as an interaction flag or a severity grade."
        )

    y = y.astype(str)
    classes = sorted(y.unique())

    if len(classes) < 2:
        raise ValueError(f"'{target}' only has one value, so there is nothing to learn.")
    if len(classes) > 12:
        raise ValueError(f"'{target}' has {len(classes)} values, which is too many to be a label.")

    warnings = []
    for leak in leak_check(frame, target, features):
        warnings.append(
            f"'{leak['feature']}' predicts the label {leak['purity']}% of the time on its own. "
            "It was most likely derived from it. Remove it and train again, or the scores "
            "below will flatter the model."
        )

    X = frame[features]

    # Keep the class proportions in both halves, or the test scores mean little.
    counts = y.value_counts()
    stratify = y if counts.min() >= 2 else None

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state, stratify=stratify
    )

    preprocessor, numeric_cols, categorical_cols, dropped_cols = _build_preprocessor(frame, features)

    for column in dropped_cols:
        warnings.append(
            f"'{column}' has {frame[column].nunique()} distinct values. Logistic regression "
            "cannot use it without turning it into that many columns, so it was left out of "
            "that model. LightGBM splits on categories directly and still uses it."
        )
    binary = len(classes) == 2
    positive = classes[-1]

    # LightGBM with the same settings as build_pipeline.py, so the page trains
    # the model the project actually ships rather than a stand-in.
    models = {
        "logistic_regression": LogisticRegression(max_iter=2000, class_weight="balanced"),
        "lightgbm": LGBMClassifier(
            n_estimators=250,
            learning_rate=0.05,
            num_leaves=63,
            verbosity=-1,
            random_state=random_state,
        ),
    }

    # LightGBM splits on categories directly, so it keeps columns that would
    # be dropped for logistic regression. That is the whole reason it can use
    # the drug names while the linear model cannot.
    def as_categorical(frame_in):
        prepared = frame_in.copy()
        for column in prepared.columns:
            if not pd.api.types.is_numeric_dtype(prepared[column]):
                prepared[column] = prepared[column].astype("category")
        return prepared

    X_train_cat, X_test_cat, X_cat = as_categorical(X_train), as_categorical(X_test), as_categorical(X)

    results = {}
    fitted = {}
    inputs = {}

    for name, estimator in models.items():
        if name == "lightgbm":
            pipeline = estimator
            pipeline.fit(X_train_cat, y_train)
            inputs[name] = (X_train_cat, X_test_cat, X_cat)
        else:
            pipeline = Pipeline([("prep", preprocessor), ("model", estimator)])
            pipeline.fit(X_train, y_train)
            inputs[name] = (X_train, X_test, X)

        fitted[name] = pipeline

        _, test_input, full_input = inputs[name]
        y_pred = pipeline.predict(test_input)

        y_prob = None
        if binary and hasattr(pipeline, "predict_proba"):
            column = list(pipeline.classes_).index(positive)
            y_prob = pipeline.predict_proba(test_input)[:, column]

        entry = {"metrics": _scores(y_test.values, y_pred, y_prob, positive)}

        matrix = confusion_matrix(y_test, y_pred, labels=classes)
        entry["confusion"] = {"labels": classes, "matrix": matrix.tolist()}

        if y_prob is not None:
            truth = (y_test.values == positive).astype(int)

            fpr, tpr, _ = roc_curve(truth, y_prob)
            entry["roc"] = _thin([{"x": _clean(a), "y": _clean(b)} for a, b in zip(fpr, tpr)])

            precision, recall, _ = precision_recall_curve(truth, y_prob)
            entry["pr"] = _thin([{"x": _clean(r), "y": _clean(p)} for r, p in zip(recall, precision)])

        # Cross validation says whether the split was lucky, but it means
        # fitting the model five more times. Past a certain size that costs
        # more than the answer is worth, so it is skipped.
        if len(X) <= CV_ROW_LIMIT:
            try:
                folds = cross_val_score(pipeline, full_input, y, cv=min(5, int(counts.min())), scoring="accuracy")
                entry["cv_mean"] = _clean(folds.mean())
                entry["cv_std"] = _clean(folds.std())
            except Exception:
                entry["cv_mean"] = entry["cv_std"] = None
        else:
            entry["cv_mean"] = entry["cv_std"] = None

        results[name] = entry

    # What the logistic regression actually learned, in the model's own terms.
    logistic = fitted["logistic_regression"]
    names = list(logistic.named_steps["prep"].get_feature_names_out())
    coefficients = logistic.named_steps["model"].coef_

    weights = coefficients[0] if binary else np.abs(coefficients).mean(axis=0)
    order = np.argsort(np.abs(weights))[::-1][:14]

    results["logistic_regression"]["coefficients"] = [
        {
            "feature": names[i].split("__", 1)[-1],
            "weight": _clean(weights[i]),
            "direction": "towards " + (str(positive) if weights[i] > 0 else f"not {positive}"),
        }
        for i in order
    ]

    # Permutation importance for the boosted model, since it has no coefficients.
    try:
        sample = X_test_cat if len(X_test_cat) <= 4000 else X_test_cat.sample(4000, random_state=random_state)
        sample_y = y_test.loc[sample.index]

        importance = permutation_importance(
            fitted["lightgbm"], sample, sample_y,
            n_repeats=3 if len(X) > CV_ROW_LIMIT else 5,
            random_state=random_state, scoring="accuracy"
        )
        ranked = np.argsort(importance.importances_mean)[::-1][:14]
        results["lightgbm"]["importances"] = [
            {"feature": str(features[i]), "weight": _clean(importance.importances_mean[i])}
            for i in ranked if importance.importances_mean[i] > 0
        ]
    except Exception:
        results["lightgbm"]["importances"] = []

    best = max(results, key=lambda k: results[k]["metrics"]["f1"] or 0)

    return {
        # The fitted estimators themselves, so the caller can keep the run
        # rather than only its scores. Stripped before the result is sent to
        # the browser — a model is not JSON.
        "_fitted": fitted,
        "target": target,
        "classes": classes,
        "features_used": {"numeric": numeric_cols, "categorical": categorical_cols},
        "rows_trained": int(len(X_train)),
        "rows_tested": int(len(X_test)),
        "class_balance": class_balance(y),
        "correlation": correlation(frame, features),
        "models": results,
        "best_model": best,
        "warnings": warnings,
    }