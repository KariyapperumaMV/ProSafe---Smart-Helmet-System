"""
Train & compare 4 classifiers on the Worker Safety dataset.

Models:
    Random Forest, XGBoost, SVM (RBF), Logistic Regression

Pipeline:
    1. Load + split (stratified 80/20)
    2. Encode labels, fit scaler (used only by SVM + LogReg)
    3. Train each model, score on the test set
    4. 5-fold stratified cross-validation to confirm the split wasn't lucky
    5. Save plots, comparison CSV, and the winning model artifacts
    6. (Optional, commented) GridSearchCV hyperparameter tuning

Run from project root:
    python src/train_models.py
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass
from typing import Any

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.svm import SVC
from xgboost import XGBClassifier

from utils import (
    ALL_MODELS_META_PATH,
    BEST_MODEL_META_PATH,
    BEST_MODEL_PATH,
    FEATURE_COLUMNS,
    LABEL_ENCODER_PATH,
    MODELS_DIR,
    OUTPUTS_DIR,
    RANDOM_STATE,
    SCALER_PATH,
    ensure_dirs,
    load_dataset,
    model_slug,
    split_features_target,
)

warnings.filterwarnings("ignore")
sns.set_theme(style="whitegrid", context="notebook")


@dataclass
class ModelSpec:
    """Bundle a classifier with whether it needs scaled inputs."""
    name: str
    estimator: Any
    use_scaled: bool


def build_models() -> list[ModelSpec]:
    """Define the 4 candidate models with their fixed hyperparameters.

    use_scaled flags which models need StandardScaler — only distance/margin
    based learners (SVM, LogReg). Tree ensembles are invariant to monotonic
    feature scaling, so scaling them is wasted compute (and can subtly hurt
    interpretability of feature_importances_).
    """
    return [
        ModelSpec(
            name="Random Forest",
            estimator=RandomForestClassifier(
                n_estimators=200,
                max_depth=15,
                random_state=RANDOM_STATE,
                n_jobs=-1,
            ),
            use_scaled=False,
        ),
        ModelSpec(
            name="XGBoost",
            estimator=XGBClassifier(
                n_estimators=200,
                max_depth=8,
                learning_rate=0.1,
                random_state=RANDOM_STATE,
                eval_metric="mlogloss",
                n_jobs=-1,
            ),
            use_scaled=False,
        ),
        ModelSpec(
            name="SVM",
            estimator=SVC(
                kernel="rbf",
                C=1.0,
                gamma="scale",
                random_state=RANDOM_STATE,
            ),
            use_scaled=True,
        ),
        ModelSpec(
            name="Logistic Regression",
            estimator=LogisticRegression(
                max_iter=1000,
                random_state=RANDOM_STATE,
                n_jobs=-1,
            ),
            use_scaled=True,
        ),
    ]


def train_and_evaluate(
    specs: list[ModelSpec],
    X_train: pd.DataFrame,
    X_test: pd.DataFrame,
    y_train: np.ndarray,
    y_test: np.ndarray,
    X_train_scaled: np.ndarray,
    X_test_scaled: np.ndarray,
) -> tuple[pd.DataFrame, dict[str, dict]]:
    """Fit each model, return a comparison DataFrame and per-model artifacts."""
    print("\n" + "=" * 60)
    print("TRAINING & EVALUATING MODELS")
    print("=" * 60)

    rows = []
    trained: dict[str, dict] = {}

    for spec in specs:
        print(f"\nTraining {spec.name}...")
        # Pick the right input view for this model family
        Xtr, Xte = (
            (X_train_scaled, X_test_scaled) if spec.use_scaled else (X_train, X_test)
        )

        spec.estimator.fit(Xtr, y_train)
        y_pred = spec.estimator.predict(Xte)

        # Weighted averages handle the slight class imbalance (30/35/35).
        # zero_division=0 silences warnings if a class is never predicted.
        metrics = {
            "Model": spec.name,
            "Accuracy": accuracy_score(y_test, y_pred),
            "Precision": precision_score(y_test, y_pred, average="weighted", zero_division=0),
            "Recall": recall_score(y_test, y_pred, average="weighted", zero_division=0),
            "F1-Score": f1_score(y_test, y_pred, average="weighted", zero_division=0),
        }
        rows.append(metrics)
        trained[spec.name] = {"spec": spec, "y_pred": y_pred}

        for k, v in metrics.items():
            if k != "Model":
                print(f"  {k:<10}: {v:.4f}")

    results_df = (
        pd.DataFrame(rows)
        .round(4)
        .sort_values("F1-Score", ascending=False)
        .reset_index(drop=True)
    )
    return results_df, trained


def run_cross_validation(
    specs: list[ModelSpec],
    X: pd.DataFrame,
    X_scaled: np.ndarray,
    y: np.ndarray,
    n_splits: int = 5,
) -> pd.DataFrame:
    """5-fold stratified CV F1 (weighted) — confirms the holdout score isn't a fluke.

    Uses the *full* dataset (not just training rows) — CV manages its own
    train/val splits internally, so this is the standard approach.
    """
    print("\n" + "=" * 60)
    print(f"{n_splits}-FOLD STRATIFIED CROSS-VALIDATION")
    print("=" * 60)

    cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=RANDOM_STATE)
    rows = []
    for spec in specs:
        # IMPORTANT: pre-scaling X for SVM/LogReg here leaks test-fold info into
        # the scaler's fit. For *comparison* purposes this is fine and matches
        # the reference; for a production pipeline use sklearn.Pipeline so the
        # scaler is refit per fold.
        data = X_scaled if spec.use_scaled else X
        scores = cross_val_score(
            spec.estimator, data, y, cv=cv, scoring="f1_weighted", n_jobs=-1
        )
        rows.append(
            {
                "Model": spec.name,
                "CV F1 Mean": round(scores.mean(), 4),
                "CV F1 Std": round(scores.std(), 4),
                "CV F1 Min": round(scores.min(), 4),
                "CV F1 Max": round(scores.max(), 4),
            }
        )
        print(
            f"  {spec.name:<22} F1 = {scores.mean():.4f} +/- {scores.std():.4f}  "
            f"(min={scores.min():.4f}, max={scores.max():.4f})"
        )

    return pd.DataFrame(rows).sort_values("CV F1 Mean", ascending=False).reset_index(drop=True)


def plot_confusion_matrices(trained: dict, y_test, class_names, out_path) -> None:
    """2x2 grid of confusion matrices, one per model."""
    fig, axes = plt.subplots(2, 2, figsize=(13, 11))
    axes = axes.ravel()
    for i, (name, info) in enumerate(trained.items()):
        cm = confusion_matrix(y_test, info["y_pred"])
        sns.heatmap(
            cm,
            annot=True,
            fmt="d",
            cmap="Blues",
            xticklabels=class_names,
            yticklabels=class_names,
            ax=axes[i],
            cbar=False,
        )
        axes[i].set_title(name)
        axes[i].set_xlabel("Predicted")
        axes[i].set_ylabel("Actual")
    plt.tight_layout()
    plt.savefig(out_path, dpi=120, bbox_inches="tight")
    plt.close(fig)


def plot_feature_importance(trained: dict, out_path) -> None:
    """Horizontal bars of feature_importances_ for the two tree models."""
    tree_models = [n for n in ("Random Forest", "XGBoost") if n in trained]
    fig, axes = plt.subplots(1, len(tree_models), figsize=(8 * len(tree_models), 6))
    if len(tree_models) == 1:
        axes = [axes]

    for ax, name in zip(axes, tree_models):
        model = trained[name]["spec"].estimator
        imp = pd.DataFrame(
            {"Feature": FEATURE_COLUMNS, "Importance": model.feature_importances_}
        ).sort_values("Importance", ascending=True)
        ax.barh(imp["Feature"], imp["Importance"], color="steelblue", edgecolor="black")
        ax.set_title(f"{name} — Feature Importance")
        ax.set_xlabel("Importance")

    plt.tight_layout()
    plt.savefig(out_path, dpi=120, bbox_inches="tight")
    plt.close(fig)


def plot_model_comparison(results_df: pd.DataFrame, out_path) -> None:
    """Grouped bar chart comparing accuracy/precision/recall/F1 across models."""
    metrics = ["Accuracy", "Precision", "Recall", "F1-Score"]
    x = np.arange(len(results_df))
    width = 0.2

    fig, ax = plt.subplots(figsize=(12, 6))
    for i, metric in enumerate(metrics):
        ax.bar(x + i * width, results_df[metric], width, label=metric)

    ax.set_xticks(x + width * 1.5)
    ax.set_xticklabels(results_df["Model"], rotation=15)
    ax.set_ylabel("Score")
    ax.set_title("Model Performance Comparison")
    ax.set_ylim(0, 1.05)
    ax.legend(loc="lower right")
    ax.grid(axis="y", linestyle="--", alpha=0.4)
    plt.tight_layout()
    plt.savefig(out_path, dpi=120, bbox_inches="tight")
    plt.close(fig)


def save_all_artifacts(
    best_name: str,
    trained: dict,
    scaler: StandardScaler,
    label_encoder: LabelEncoder,
    results_df: pd.DataFrame,
) -> None:
    """Persist EVERY trained model + shared preprocessing artifacts.

    Saves:
    - One pickle per model (for the Streamlit dropdown to load on demand).
    - best_model.pkl as a copy of the winner (backwards compatible with predict.py).
    - best_model_meta.pkl with the winner's name + use_scaled flag.
    - all_models_meta.pkl mapping each model name to its path, scaling flag,
      and test-set metrics — the UI uses this to populate the picker and show
      per-model scores in the sidebar.
    """
    # Per-model pickles
    all_meta: dict[str, dict] = {}
    metrics_lookup = results_df.set_index("Model").to_dict(orient="index")

    for name, info in trained.items():
        spec: ModelSpec = info["spec"]
        path = MODELS_DIR / f"{model_slug(name)}.pkl"
        joblib.dump(spec.estimator, path)
        all_meta[name] = {
            "path": path,
            "use_scaled": spec.use_scaled,
            "metrics": metrics_lookup.get(name, {}),
        }

    # Shared preprocessing
    joblib.dump(scaler, SCALER_PATH)
    joblib.dump(label_encoder, LABEL_ENCODER_PATH)

    # Best-model duplicates (kept so predict.py's default load() still works)
    best_spec: ModelSpec = trained[best_name]["spec"]
    joblib.dump(best_spec.estimator, BEST_MODEL_PATH)
    joblib.dump(
        {"model_name": best_name, "use_scaled": best_spec.use_scaled},
        BEST_MODEL_META_PATH,
    )

    # Registry for the UI
    joblib.dump(all_meta, ALL_MODELS_META_PATH)

    print(f"\nSaved artifacts:")
    for name, m in all_meta.items():
        print(f"  {m['path'].name:<28}  ({name})")
    print(f"  {SCALER_PATH.name}")
    print(f"  {LABEL_ENCODER_PATH.name}")
    print(f"  {BEST_MODEL_PATH.name}  (copy of winner: {best_name})")
    print(f"  {BEST_MODEL_META_PATH.name}")
    print(f"  {ALL_MODELS_META_PATH.name}  (registry of all 4 models)")


# ---------------------------------------------------------------------------
# Optional: hyperparameter tuning. Commented out by default (slow on full data).
# Uncomment the call in main() to run, then rerun this script.
# ---------------------------------------------------------------------------
def tune_best_model(X_train, y_train, best_name: str) -> None:
    """GridSearchCV over a small grid for the best-performing tree model.

    Only implemented for Random Forest and XGBoost — tuning SVM on 16k rows
    with an RBF kernel is prohibitively slow and out of scope for the demo.
    """
    from sklearn.model_selection import GridSearchCV

    if best_name == "Random Forest":
        param_grid = {
            "n_estimators": [200, 300, 500],
            "max_depth": [10, 15, 20, None],
            "min_samples_split": [2, 5],
        }
        base = RandomForestClassifier(random_state=RANDOM_STATE, n_jobs=-1)
    elif best_name == "XGBoost":
        param_grid = {
            "n_estimators": [200, 300],
            "max_depth": [6, 8, 10],
            "learning_rate": [0.05, 0.1, 0.2],
        }
        base = XGBClassifier(
            random_state=RANDOM_STATE, eval_metric="mlogloss", n_jobs=-1
        )
    else:
        print(f"Tuning not configured for {best_name}; skipping.")
        return

    grid = GridSearchCV(
        base, param_grid, scoring="f1_weighted", cv=3, n_jobs=-1, verbose=1
    )
    grid.fit(X_train, y_train)
    print(f"\nBest params for {best_name}: {grid.best_params_}")
    print(f"Best CV F1: {grid.best_score_:.4f}")


def main() -> None:
    ensure_dirs()

    # ---- 1. Load + describe ------------------------------------------------
    print("=" * 60)
    print("LOADING DATASET")
    print("=" * 60)
    df = load_dataset()
    X, y_raw = split_features_target(df)
    print(f"Rows: {len(df):,} | Features: {len(FEATURE_COLUMNS)}")
    print(f"\nClass counts:\n{y_raw.value_counts().to_string()}")

    # ---- 2. Encode + split + scale ----------------------------------------
    label_encoder = LabelEncoder()
    y = label_encoder.fit_transform(y_raw)
    print(f"\nLabel mapping: {dict(zip(label_encoder.classes_, range(len(label_encoder.classes_))))}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=RANDOM_STATE, stratify=y
    )
    print(f"Train: {len(X_train):,} | Test: {len(X_test):,}")

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    # Pre-scale full X once for CV (see caveat in run_cross_validation)
    X_scaled_full = scaler.fit_transform(X)
    # Re-fit on train only so the saved scaler matches the training pipeline
    scaler.fit(X_train)

    # ---- 3. Train + evaluate ----------------------------------------------
    specs = build_models()
    results_df, trained = train_and_evaluate(
        specs, X_train, X_test, y_train, y_test, X_train_scaled, X_test_scaled
    )

    # ---- 4. Comparison table + classification reports ---------------------
    print("\n" + "=" * 60)
    print("MODEL COMPARISON (sorted by F1)")
    print("=" * 60)
    print(results_df.to_string(index=False))
    results_csv = OUTPUTS_DIR / "model_comparison_results.csv"
    results_df.to_csv(results_csv, index=False)
    print(f"\nSaved: {results_csv}")

    print("\n" + "=" * 60)
    print("DETAILED CLASSIFICATION REPORTS")
    print("=" * 60)
    for name, info in trained.items():
        print(f"\n--- {name} ---")
        print(
            classification_report(
                y_test,
                info["y_pred"],
                target_names=label_encoder.classes_,
                zero_division=0,
            )
        )

    # ---- 5. Cross-validation ----------------------------------------------
    cv_df = run_cross_validation(specs, X, X_scaled_full, y)
    cv_csv = OUTPUTS_DIR / "cross_validation_results.csv"
    cv_df.to_csv(cv_csv, index=False)
    print(f"\nSaved: {cv_csv}")

    # ---- 6. Plots ---------------------------------------------------------
    plot_confusion_matrices(
        trained, y_test, label_encoder.classes_, OUTPUTS_DIR / "confusion_matrices.png"
    )
    plot_feature_importance(trained, OUTPUTS_DIR / "feature_importance.png")
    plot_model_comparison(results_df, OUTPUTS_DIR / "model_comparison_chart.png")
    print(f"Plots saved to: {OUTPUTS_DIR}")

    # ---- 7. Save best model -----------------------------------------------
    best_name = results_df.iloc[0]["Model"]
    print("\n" + "=" * 60)
    print(f"BEST MODEL: {best_name}  (F1 = {results_df.iloc[0]['F1-Score']})")
    print("=" * 60)
    save_all_artifacts(best_name, trained, scaler, label_encoder, results_df)

    # ---- 8. Optional hyperparameter tuning --------------------------------
    # Uncomment the line below to grid-search the winning model. It is slow
    # (minutes, not seconds) and rarely moves F1 by more than ~0.5pp on this
    # dataset, so it is off by default.
    #
    # tune_best_model(X_train, y_train, best_name)

    print("\nDone.")


if __name__ == "__main__":
    main()
