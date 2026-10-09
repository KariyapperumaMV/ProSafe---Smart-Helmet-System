"""
Promote the selected experiment artifact to the production slot read by
predict.py / serve.py / app.py. No training, tuning or reselection happens here.

    python src/promote_model.py            # verify + promote (archives the previous candidate first)
    python src/promote_model.py --check    # verify only, change nothing

Selected model (decided by the project owner after the final fair comparison):
XGBoost, EXTENDED feature set (38 features), Experiment 2 artifact
(trained on synthetic S_001-S_004 + real W_001; external test worker W_002).

The script refuses to promote anything else: the source bundle must report
algorithm XGBoost, experiment EXP2, the synthetic + W_001 training files, the
EXTENDED feature set with exactly the 38 frozen columns, use_scaled False and
the recorded W_002 metrics (accuracy ~0.9546, macro F1 ~0.6848). After writing
the production files it reloads them through SafetyPredictor and checks that
every W_002 prediction and probability is identical to the source bundle.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone

import joblib
import numpy as np

from utils import (
    ALL_MODELS_META_PATH,
    BEST_MODEL_META_PATH,
    BEST_MODEL_PATH,
    DEFERRABLE_FEATURES,
    EXTENDED_FEATURE_COLUMNS,
    FROZEN_CONFIG_PATH,
    LABEL_ENCODER_PATH,
    MODELS_DIR,
    PROJECT_ROOT,
    RISK_CLASSES,
    SCALER_PATH,
    W002_DATA_PATH,
    _read_ml_ready,
    file_sha256,
)

SOURCE_BUNDLE = MODELS_DIR / "experiments" / "exp2_xgboost.pkl"
MODEL_VERSION = "prosafe-ml-v2-xgboost-extended-exp2-2026-10-09"
ARCHIVE_DIR = PROJECT_ROOT / "archive" / "old_model_candidates" / "logistic_regression_candidate_2026-10-08"

EXPECTED = {
    "algorithm": "XGBoost",
    "experiment": "EXP2",
    "feature_set": "EXTENDED",
    "trained_on": ["prosafe_synthetic_ml_ready.csv", "prosafe_W001_ml_ready.csv"],
    "use_scaled": False,
    "accuracy": 0.9546,
    "macro_f1": 0.6848,
}
TOLERANCE = 5e-4

# Previous-candidate files that become stale once the XGBoost model is promoted.
STALE_FILES = ["best_model.pkl", "best_model_meta.pkl", "all_models_meta.pkl", "label_encoder.pkl", "scaler.pkl",
               "frozen_config.json", "logistic_regression.pkl", "random_forest.pkl", "svm.pkl", "xgboost.pkl"]


def verify_bundle(bundle: dict) -> list[str]:
    problems = []
    for key in ("algorithm", "experiment", "feature_set", "trained_on", "use_scaled"):
        if bundle.get(key) != EXPECTED[key]:
            problems.append(f"{key} = {bundle.get(key)!r}, expected {EXPECTED[key]!r}")
    cols = list(bundle.get("feature_columns", []))
    if cols != list(EXTENDED_FEATURE_COLUMNS) or len(cols) != 38:
        problems.append(f"feature_columns differ from the 38 EXTENDED columns (got {len(cols)})")
    tm = bundle.get("test_metrics", {})
    for key in ("accuracy", "macro_f1"):
        if abs(tm.get(key, -1) - EXPECTED[key]) > TOLERANCE:
            problems.append(f"test {key} = {tm.get(key)}, expected ~{EXPECTED[key]}")
    if bundle.get("scaler") is not None:
        problems.append("bundle carries a scaler although use_scaled is False")
    if sorted(bundle["label_encoder"].classes_.tolist()) != sorted(RISK_CLASSES):
        problems.append(f"label encoder classes {bundle['label_encoder'].classes_.tolist()}")
    return problems


def w002_predictions(model, label_encoder, columns):
    df = _read_ml_ready(W002_DATA_PATH)
    X = df[columns]
    labels = label_encoder.inverse_transform(model.predict(X).astype(int))
    return df, labels, model.predict_proba(X)


def build_metadata(bundle: dict) -> dict:
    tm, hp = bundle["test_metrics"], bundle["hyperparameters"]
    return {
        "model_name": "XGBoost",
        "model_version": MODEL_VERSION,
        "version": MODEL_VERSION,
        "feature_set": "EXTENDED",
        "feature_columns": list(bundle["feature_columns"]),
        "feature_count": len(bundle["feature_columns"]),
        "use_scaled": False,
        "classes": list(RISK_CLASSES),
        "hyperparameters": hp,
        "class_weighting": {k: hp[k] for k in ("class_weight", "critical_weight", "warning_weight") if k in hp},
        "supports_missing_values": True,
        "deferrable_features": [c for c in DEFERRABLE_FEATURES if c in bundle["feature_columns"]],
        "experiment": "Experiment 2: Synthetic + Worker 1 -> Worker 2 Real",
        "training_data": ["prosafe_synthetic_ml_ready.csv (S_001-S_004)", "prosafe_W001_ml_ready.csv (W_001)"],
        "trained_on_workers": ["S_001", "S_002", "S_003", "S_004", "W_001"],
        "n_train": bundle["n_train"],
        "external_test_data": "prosafe_W002_ml_ready.csv (W_002) - external test only, never used for training",
        "test_accuracy": tm["accuracy"],
        "test_balanced_accuracy": tm["balanced_accuracy"],
        "test_macro_f1": tm["macro_f1"],
        "test_critical_recall": tm["critical_recall"],
        "test_critical_precision": tm["critical_precision"],
        "test_critical_f1": tm["critical_f1"],
        "test_critical_to_safe_count": tm["critical_to_safe_count"],
        "test_critical_support": tm["critical_support"],
        "test_metrics": tm,
        "cross_validation": bundle["cross_validation"],
        "known_limitation": (
            f"W_002 Critical recall {tm['critical_recall']:.4f} "
            f"({tm['critical_support'] - tm['critical_false_negative_count']}/{tm['critical_support']} Critical seconds "
            f"detected; {tm['critical_to_warning_count']} predicted Warning, {tm['critical_to_safe_count']} predicted Safe). "
            "The W_002 Critical episodes are UV-driven, a pattern almost absent from the training data."),
        "source_artifact": "models/experiments/exp2_xgboost.pkl",
        "source_artifact_sha256": file_sha256(SOURCE_BUNDLE),
        "promoted_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def frozen_config(meta: dict) -> dict:
    return {
        "frozen_at_utc": meta["promoted_at_utc"],
        "frozen_before_external_test": True,
        "external_test_worker": "W_002",
        "external_test_policy": (
            "Hyperparameters, feature set and class weighting of this model were chosen on the training side only "
            "(leave-one-training-worker-out over S_001-S_004 + W_001) and the refitted model was scored once on W_002. "
            "The later decision to deploy this Experiment-2 model was made after the W_002 results of all experiments "
            "were known, so the W_002 numbers are no longer an unbiased estimate of the deployed choice; a new unseen "
            "real worker is needed for that."),
        "algorithm": meta["model_name"],
        "model_version": meta["model_version"],
        "feature_set": meta["feature_set"],
        "feature_columns": meta["feature_columns"],
        "hyperparameters": meta["hyperparameters"],
        "uses_scaling": False,
        "scaling": "None. XGBoost receives the raw feature values; deferrable warm-up NaNs are handled natively.",
        "class_weighting": meta["class_weighting"],
        "classes": meta["classes"],
        "training_data": meta["training_data"],
        "source_artifact": meta["source_artifact"],
        "source_artifact_sha256": meta["source_artifact_sha256"],
    }


def archive_previous() -> list[str]:
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    moved = []
    for name in STALE_FILES:
        src = MODELS_DIR / name
        if src.exists():
            dst = ARCHIVE_DIR / name
            if dst.exists():
                raise FileExistsError(f"{dst} already exists; refusing to overwrite archived material")
            shutil.move(str(src), str(dst))
            moved.append(name)
    return moved


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify the source bundle only")
    args = ap.parse_args()

    if not SOURCE_BUNDLE.exists():
        print(f"Source artifact not found: {SOURCE_BUNDLE}")
        return 1
    bundle = joblib.load(SOURCE_BUNDLE)
    problems = verify_bundle(bundle)
    tm = bundle["test_metrics"]
    print(f"Source: {SOURCE_BUNDLE.relative_to(PROJECT_ROOT)}")
    print(f"  algorithm={bundle['algorithm']} experiment={bundle['experiment']} feature_set={bundle['feature_set']} "
          f"features={len(bundle['feature_columns'])} use_scaled={bundle['use_scaled']}")
    print(f"  trained_on={bundle['trained_on']}")
    print(f"  W_002 accuracy={tm['accuracy']:.4f} macro_f1={tm['macro_f1']:.4f} "
          f"critical_recall={tm['critical_recall']:.4f} critical->safe={tm['critical_to_safe_count']}")
    print(f"  hyperparameters={bundle['hyperparameters']}")
    if problems:
        print("REFUSING TO PROMOTE:\n  " + "\n  ".join(problems))
        return 1
    print("Verification passed.")
    if args.check:
        return 0

    moved = archive_previous()
    print(f"Archived previous candidate files to {ARCHIVE_DIR.relative_to(PROJECT_ROOT)}: {moved}")

    meta = build_metadata(bundle)
    joblib.dump(bundle["model"], BEST_MODEL_PATH)
    joblib.dump(bundle["label_encoder"], LABEL_ENCODER_PATH)
    meta["best_model_sha256"] = file_sha256(BEST_MODEL_PATH)
    joblib.dump(meta, BEST_MODEL_META_PATH)
    joblib.dump({"XGBoost": {
        "path": BEST_MODEL_PATH.name,
        "use_scaled": False,
        "feature_set": meta["feature_set"],
        "feature_columns": meta["feature_columns"],
        "hyperparameters": meta["hyperparameters"],
        "model_version": MODEL_VERSION,
        "is_best": True,
        "metrics": {"source": "external test W_002 (Experiment 2)", **tm},
        "cross_validation": bundle["cross_validation"],
    }}, ALL_MODELS_META_PATH)
    FROZEN_CONFIG_PATH.write_text(json.dumps(frozen_config(meta), indent=2), encoding="utf-8")
    assert not SCALER_PATH.exists()

    # Reload through the production loader and prove parity with the source bundle on W_002.
    from predict import SafetyPredictor
    pred = SafetyPredictor.load()
    df, src_labels, src_proba = w002_predictions(bundle["model"], bundle["label_encoder"], bundle["feature_columns"])
    prod_labels = pred.predict_frame(df)
    prod_proba = pred.predict_proba_frame(df)[list(bundle["label_encoder"].classes_)].to_numpy()
    same_labels = bool((prod_labels == src_labels).all())
    same_proba = bool(np.array_equal(prod_proba, src_proba))
    acc = float((prod_labels == df["risk_level"].to_numpy()).mean())
    crit = df["risk_level"].to_numpy() == "Critical"
    print(f"Production loader: {pred.model_name} {pred.feature_set} {len(pred.feature_columns)} features, "
          f"use_scaled={pred.use_scaled}, scaler={'none' if pred.scaler is None else type(pred.scaler).__name__}")
    print(f"W_002 parity with source bundle: labels identical={same_labels}, probabilities identical={same_proba}, "
          f"accuracy={acc:.4f}, Critical caught={int((prod_labels[crit] == 'Critical').sum())}/{int(crit.sum())}")
    if not (same_labels and same_proba):
        print("PARITY FAILED")
        return 1
    print(f"Promoted {MODEL_VERSION}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
