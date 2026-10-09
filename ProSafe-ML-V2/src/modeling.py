"""
Component B shared machinery: candidate algorithms, fold-safe fitting,
metrics, leave-one-worker-out (LOWO) evaluation and the ranking rule.

Everything that is fitted (imputer, scaler, class weights, the classifier) is
fitted on the TRAINING portion only, inside each fold.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.svm import SVC
from sklearn.utils.class_weight import compute_sample_weight
from xgboost import XGBClassifier

from utils import RANDOM_STATE, RISK_CLASSES, TARGET_COLUMN, WORKER_COLUMN, assert_feature_contract

ALGORITHMS: list[str] = ["Logistic Regression", "Random Forest", "XGBoost", "SVM"]

# Sensible fixed defaults for the candidate comparison (stage 1).
DEFAULT_PARAMS: dict[str, dict[str, Any]] = {
    "Logistic Regression": {"C": 1.0, "max_iter": 3000},
    "Random Forest": {"n_estimators": 300, "max_depth": None, "min_samples_leaf": 2, "max_features": "sqrt"},
    "XGBoost": {"n_estimators": 300, "max_depth": 6, "learning_rate": 0.1, "subsample": 0.8,
                "colsample_bytree": 0.8, "min_child_weight": 1, "reg_lambda": 1.0},
    "SVM": {"C": 1.0, "gamma": "scale"},
}

USES_SCALING: dict[str, bool] = {
    "Logistic Regression": True,
    "SVM": True,
    "Random Forest": False,  # trees are scale-invariant and handle NaN natively
    "XGBoost": False,
}

CLASS_WEIGHTING: dict[str, str] = {
    "Logistic Regression": "class_weight='balanced'",
    "Random Forest": "class_weight='balanced_subsample'",
    "XGBoost": "sample_weight = compute_sample_weight('balanced', y_train) (training fold only)",
    "SVM": "class_weight='balanced'",
}

PREPROCESSING_FOR_SCALED_MODELS = (
    "SimpleImputer(median) -> StandardScaler, fitted on the training rows only. "
    "Imputation only touches the deferrable warm-up NaNs and rare raw-sensor NaNs; tree models receive NaN natively."
)


def make_label_encoder() -> LabelEncoder:
    """Fit on the three risk classes only. UNCERTAIN is never a class."""
    le = LabelEncoder()
    le.fit(RISK_CLASSES)
    return le


def make_scaled_preprocessor() -> Pipeline:
    return Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())])


# XGBoost has no class_weight argument: these tuning keys are turned into training-only sample weights.
XGB_WEIGHT_KEYS = ("class_weight", "critical_weight", "warning_weight")


def class_sample_weights(labels, class_weight="balanced", critical_weight=1.0, warning_weight=1.0) -> np.ndarray:
    """Training-only sample weights: 'balanced' (or uniform for None), then optional Critical / Warning
    multipliers, rescaled to mean 1. With the defaults this equals compute_sample_weight('balanced', y)."""
    labels = np.asarray(labels)
    w = compute_sample_weight(class_weight, labels) if class_weight is not None else np.ones(len(labels))
    w = w * np.where(labels == "Critical", critical_weight, 1.0) * np.where(labels == "Warning", warning_weight, 1.0)
    return w / w.mean()


def build_estimator(name: str, params: Optional[dict] = None, probability: bool = False):
    p = dict(DEFAULT_PARAMS[name] if params is None else params)
    if name == "Logistic Regression":
        return LogisticRegression(**{"class_weight": "balanced", "random_state": RANDOM_STATE, **p})
    if name == "Random Forest":
        return RandomForestClassifier(**{"class_weight": "balanced_subsample", "n_jobs": -1, "random_state": RANDOM_STATE, **p})
    if name == "XGBoost":
        p = {k: v for k, v in p.items() if k not in XGB_WEIGHT_KEYS}  # class weighting is applied as sample weights
        return XGBClassifier(objective="multi:softprob", eval_metric="mlogloss", tree_method="hist",
                             n_jobs=-1, random_state=RANDOM_STATE, **p)
    if name == "SVM":
        return SVC(**{"kernel": "rbf", "class_weight": "balanced", "random_state": RANDOM_STATE, **p}, probability=probability)
    raise KeyError(name)


@dataclass
class FittedModel:
    name: str
    params: dict
    feature_columns: list[str]
    estimator: Any
    preprocessor: Optional[Pipeline]
    label_encoder: LabelEncoder
    fit_seconds: float = 0.0

    @property
    def use_scaled(self) -> bool:
        return self.preprocessor is not None

    def _X(self, X: pd.DataFrame):
        X = X[self.feature_columns]
        return self.preprocessor.transform(X) if self.preprocessor is not None else X

    def predict_labels(self, X: pd.DataFrame) -> np.ndarray:
        return self.label_encoder.inverse_transform(self.estimator.predict(self._X(X)).astype(int))

    def predict_proba(self, X: pd.DataFrame) -> Optional[np.ndarray]:
        if not hasattr(self.estimator, "predict_proba"):
            return None
        try:
            return self.estimator.predict_proba(self._X(X))
        except AttributeError:  # SVC(probability=False)
            return None


def fit_model(name: str, params: Optional[dict], train: pd.DataFrame, feature_columns: list[str],
              probability: bool = False) -> FittedModel:
    assert_feature_contract(feature_columns)
    le = make_label_encoder()
    X = train[feature_columns]
    y = le.transform(train[TARGET_COLUMN])
    pre = make_scaled_preprocessor().fit(X) if USES_SCALING[name] else None
    Xt = pre.transform(X) if pre is not None else X
    est = build_estimator(name, params, probability=probability)
    pw = dict(DEFAULT_PARAMS[name] if params is None else params)
    kw = ({"sample_weight": class_sample_weights(train[TARGET_COLUMN].values, pw.get("class_weight", "balanced"),
                                                 pw.get("critical_weight", 1.0), pw.get("warning_weight", 1.0))}
          if name == "XGBoost" else {})
    t0 = time.time()
    est.fit(Xt, y, **kw)
    return FittedModel(name, dict(DEFAULT_PARAMS[name] if params is None else params), list(feature_columns),
                       est, pre, le, time.time() - t0)


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------
def compute_metrics(y_true, y_pred) -> dict:
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    p, r, f, s = precision_recall_fscore_support(y_true, y_pred, labels=RISK_CLASSES, zero_division=0)
    cm = confusion_matrix(y_true, y_pred, labels=RISK_CLASSES)
    present = [c for c in RISK_CLASSES if (y_true == c).any()]
    m = {
        "accuracy": accuracy_score(y_true, y_pred),
        "balanced_accuracy": balanced_accuracy_score(y_true, y_pred),
        # macro averages over the classes PRESENT in y_true (sklearn semantics would
        # count an absent class as F1=0 and silently drag the average down)
        "macro_precision": float(np.mean([p[RISK_CLASSES.index(c)] for c in present])),
        "macro_recall": float(np.mean([r[RISK_CLASSES.index(c)] for c in present])),
        "macro_f1": float(np.mean([f[RISK_CLASSES.index(c)] for c in present])),
        "weighted_f1": f1_score(y_true, y_pred, labels=RISK_CLASSES, average="weighted", zero_division=0),
    }
    for i, c in enumerate(RISK_CLASSES):
        k = c.lower()
        m[f"{k}_precision"], m[f"{k}_recall"], m[f"{k}_f1"], m[f"{k}_support"] = p[i], r[i], f[i], int(s[i])
    crit = RISK_CLASSES.index("Critical")
    safe = RISK_CLASSES.index("Safe")
    n_crit = cm[crit].sum()
    m["critical_recall"] = m["critical_recall"] if n_crit else np.nan
    m["critical_false_negative_rate"] = (1.0 - m["critical_recall"]) if n_crit else np.nan
    m["critical_to_safe_rate"] = cm[crit, safe] / n_crit if n_crit else np.nan
    m["n_test"] = int(len(y_true))
    m["confusion_matrix"] = cm.tolist()
    return {k: (float(v) if isinstance(v, (np.floating, float)) else v) for k, v in m.items()}


METRIC_COLUMNS = [
    "accuracy", "balanced_accuracy", "macro_precision", "macro_recall", "macro_f1", "weighted_f1",
    "safe_precision", "safe_recall", "safe_f1",
    "warning_precision", "warning_recall", "warning_f1",
    "critical_precision", "critical_recall", "critical_f1",
    "critical_false_negative_rate", "critical_to_safe_rate",
]

# ---------------------------------------------------------------------------
# Ranking rule (pre-registered before any model was trained)
#   1. macro F1 -- candidates within MACRO_F1_TIE_TOL of the best count as tied
#   2. critical recall      3. balanced accuracy      4. lower Critical->Safe rate
# ---------------------------------------------------------------------------
MACRO_F1_TIE_TOL = 0.005
# EXTENDED adds 12 exposure counters that are close relatives of the labeling
# framework's own inputs and are the features most sensitive to stream gaps in
# deployment. It must beat the best CORE candidate by more than this margin.
EXTENDED_MIN_GAIN = 0.01


def rank_candidates(rows: list[dict]) -> list[dict]:
    """Sort result dicts (each with the four ranking metrics) best-first."""
    remaining = list(rows)
    ordered = []
    while remaining:
        best_f1 = max(r["macro_f1"] for r in remaining)
        tied = [r for r in remaining if r["macro_f1"] >= best_f1 - MACRO_F1_TIE_TOL]
        tied.sort(key=lambda r: (-_nz(r["critical_recall"]), -r["balanced_accuracy"], _nz(r["critical_to_safe_rate"]), -r["macro_f1"]))
        winner = tied[0]
        ordered.append(winner)
        remaining.remove(winner)
    return ordered


def _nz(x) -> float:
    return 0.0 if x is None or (isinstance(x, float) and np.isnan(x)) else float(x)


# ---------------------------------------------------------------------------
# Leave-one-worker-out
# ---------------------------------------------------------------------------
@dataclass
class CVResult:
    name: str
    feature_set: str
    params: dict
    pooled: dict
    per_fold: list[dict] = field(default_factory=list)
    oof: Optional[pd.DataFrame] = None
    seconds: float = 0.0

    def summary_row(self) -> dict:
        row = {"model": self.name, "feature_set": self.feature_set}
        row.update({k: self.pooled[k] for k in METRIC_COLUMNS})
        f1s = [f["macro_f1"] for f in self.per_fold]
        row["fold_macro_f1_mean"] = float(np.mean(f1s))
        row["fold_macro_f1_std"] = float(np.std(f1s))
        row["fold_macro_f1_min"] = float(np.min(f1s))
        row["n_folds"] = len(self.per_fold)
        row["seconds"] = round(self.seconds, 1)
        return row


def lowo_cv(df: pd.DataFrame, workers: list[str], name: str, params: Optional[dict], feature_set: str,
            feature_columns: list[str]) -> CVResult:
    t0 = time.time()
    oof_parts, per_fold = [], []
    for held_out in workers:
        train = df[df[WORKER_COLUMN].isin([w for w in workers if w != held_out])]
        test = df[df[WORKER_COLUMN] == held_out]
        fm = fit_model(name, params, train, feature_columns)
        pred = fm.predict_labels(test)
        fold = compute_metrics(test[TARGET_COLUMN].values, pred)
        fold.update({"held_out_worker": held_out, "n_train": int(len(train))})
        per_fold.append(fold)
        oof_parts.append(pd.DataFrame({WORKER_COLUMN: held_out, "y_true": test[TARGET_COLUMN].values, "y_pred": pred}))
    oof = pd.concat(oof_parts, ignore_index=True)
    pooled = compute_metrics(oof["y_true"], oof["y_pred"])
    return CVResult(name, feature_set, dict(DEFAULT_PARAMS[name] if params is None else params),
                    pooled, per_fold, oof, time.time() - t0)
