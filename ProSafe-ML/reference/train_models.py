"""
ML Model Training & Comparison Script
======================================
Trains and compares 4 classification algorithms on the worker safety dataset:
- Random Forest
- XGBoost
- Support Vector Machine (SVM)
- Logistic Regression

Outputs:
- Performance comparison table (accuracy, precision, recall, F1)
- Classification reports for each model
- Confusion matrices
- Feature importance plot (for tree-based models)
- Saves the best-performing model for later use
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import joblib
import warnings
warnings.filterwarnings("ignore")

from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    classification_report, confusion_matrix
)
from xgboost import XGBClassifier


# ============================================================
# 1. LOAD THE DATASET
# ============================================================
print("=" * 60)
print("LOADING DATASET")
print("=" * 60)

DATA_PATH = "worker_safety_dataset.csv"   # Place the CSV in the same folder as this script
df = pd.read_csv(DATA_PATH)

print(f"Dataset loaded: {df.shape[0]} rows, {df.shape[1]} columns")
print(f"\nClass distribution:")
print(df["risk_level"].value_counts())
print(f"\nClass percentages:")
print(df["risk_level"].value_counts(normalize=True).round(3) * 100)


# ============================================================
# 2. FEATURE SELECTION
# ============================================================
# Drop identifier/metadata columns that should NOT be used as features
# (worker_id and timestamp are identifiers, not predictive features)
FEATURE_COLUMNS = [
    "ambient_temp_c",
    "uv_index",
    "gas_ppm",
    "noise_db",
    "body_temp_c",
    "heart_rate_bpm",
    "baseline_hr_bpm",
    "baseline_body_temp_c",
    "hr_deviation_pct",
    "body_temp_deviation_pct"
]
TARGET_COLUMN = "risk_level"

X = df[FEATURE_COLUMNS].copy()
y = df[TARGET_COLUMN].copy()

print(f"\nFeatures used ({len(FEATURE_COLUMNS)}): {FEATURE_COLUMNS}")
print(f"Target: {TARGET_COLUMN}")


# ============================================================
# 3. ENCODE TARGET LABELS
# ============================================================
# Convert string labels (Safe/Warning/Critical) to numeric (0/1/2)
label_encoder = LabelEncoder()
y_encoded = label_encoder.fit_transform(y)

print(f"\nLabel mapping:")
for i, cls in enumerate(label_encoder.classes_):
    print(f"  {cls} -> {i}")


# ============================================================
# 4. TRAIN-TEST SPLIT
# ============================================================
X_train, X_test, y_train, y_test = train_test_split(
    X, y_encoded,
    test_size=0.20,
    random_state=42,
    stratify=y_encoded   # ensures class proportions match in train & test
)

print(f"\nTrain set: {X_train.shape[0]} rows")
print(f"Test set:  {X_test.shape[0]} rows")


# ============================================================
# 5. SCALE FEATURES (needed for SVM and Logistic Regression)
# ============================================================
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)


# ============================================================
# 6. DEFINE MODELS
# ============================================================
models = {
    "Random Forest": {
        "model": RandomForestClassifier(
            n_estimators=200,
            max_depth=15,
            random_state=42,
            n_jobs=-1
        ),
        "use_scaled": False   # tree-based models don't need scaling
    },
    "XGBoost": {
        "model": XGBClassifier(
            n_estimators=200,
            max_depth=8,
            learning_rate=0.1,
            random_state=42,
            eval_metric="mlogloss",
            n_jobs=-1
        ),
        "use_scaled": False
    },
    "SVM": {
        "model": SVC(
            kernel="rbf",
            C=1.0,
            gamma="scale",
            random_state=42
        ),
        "use_scaled": True
    },
    "Logistic Regression": {
        "model": LogisticRegression(
            max_iter=1000,
            random_state=42,
            n_jobs=-1
        ),
        "use_scaled": True
    }
}


# ============================================================
# 7. TRAIN & EVALUATE EACH MODEL
# ============================================================
print("\n" + "=" * 60)
print("TRAINING & EVALUATING MODELS")
print("=" * 60)

results = []
trained_models = {}

for name, cfg in models.items():
    print(f"\nTraining {name}...")
    model = cfg["model"]

    # Pick the right feature set
    if cfg["use_scaled"]:
        X_tr, X_te = X_train_scaled, X_test_scaled
    else:
        X_tr, X_te = X_train, X_test

    # Train
    model.fit(X_tr, y_train)

    # Predict
    y_pred = model.predict(X_te)

    # Metrics
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, average="weighted", zero_division=0)
    rec = recall_score(y_test, y_pred, average="weighted", zero_division=0)
    f1 = f1_score(y_test, y_pred, average="weighted", zero_division=0)

    results.append({
        "Model": name,
        "Accuracy": round(acc, 4),
        "Precision": round(prec, 4),
        "Recall": round(rec, 4),
        "F1-Score": round(f1, 4)
    })

    trained_models[name] = {
        "model": model,
        "y_pred": y_pred,
        "use_scaled": cfg["use_scaled"]
    }

    print(f"  Accuracy:  {acc:.4f}")
    print(f"  Precision: {prec:.4f}")
    print(f"  Recall:    {rec:.4f}")
    print(f"  F1-Score:  {f1:.4f}")


# ============================================================
# 8. COMPARISON TABLE
# ============================================================
print("\n" + "=" * 60)
print("MODEL COMPARISON SUMMARY")
print("=" * 60)
results_df = pd.DataFrame(results).sort_values("F1-Score", ascending=False).reset_index(drop=True)
print(results_df.to_string(index=False))

results_df.to_csv("model_comparison_results.csv", index=False)
print("\nResults saved to: model_comparison_results.csv")


# ============================================================
# 9. DETAILED CLASSIFICATION REPORTS
# ============================================================
print("\n" + "=" * 60)
print("DETAILED CLASSIFICATION REPORTS")
print("=" * 60)

for name, info in trained_models.items():
    print(f"\n--- {name} ---")
    print(classification_report(
        y_test, info["y_pred"],
        target_names=label_encoder.classes_,
        zero_division=0
    ))


# ============================================================
# 10. CONFUSION MATRICES (combined plot)
# ============================================================
fig, axes = plt.subplots(2, 2, figsize=(14, 12))
axes = axes.ravel()

for idx, (name, info) in enumerate(trained_models.items()):
    cm = confusion_matrix(y_test, info["y_pred"])
    sns.heatmap(
        cm, annot=True, fmt="d", cmap="Blues",
        xticklabels=label_encoder.classes_,
        yticklabels=label_encoder.classes_,
        ax=axes[idx], cbar=False
    )
    axes[idx].set_title(f"{name}\nConfusion Matrix", fontsize=12)
    axes[idx].set_xlabel("Predicted")
    axes[idx].set_ylabel("Actual")

plt.tight_layout()
plt.savefig("confusion_matrices.png", dpi=120, bbox_inches="tight")
plt.close()
print("\nConfusion matrices saved to: confusion_matrices.png")


# ============================================================
# 11. FEATURE IMPORTANCE (Random Forest & XGBoost)
# ============================================================
fig, axes = plt.subplots(1, 2, figsize=(16, 6))

for idx, model_name in enumerate(["Random Forest", "XGBoost"]):
    model = trained_models[model_name]["model"]
    importances = model.feature_importances_
    feat_imp = pd.DataFrame({
        "Feature": FEATURE_COLUMNS,
        "Importance": importances
    }).sort_values("Importance", ascending=True)

    axes[idx].barh(feat_imp["Feature"], feat_imp["Importance"], color="steelblue")
    axes[idx].set_title(f"{model_name} - Feature Importance", fontsize=12)
    axes[idx].set_xlabel("Importance Score")

plt.tight_layout()
plt.savefig("feature_importance.png", dpi=120, bbox_inches="tight")
plt.close()
print("Feature importance plot saved to: feature_importance.png")


# ============================================================
# 12. MODEL COMPARISON BAR CHART
# ============================================================
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
ax.grid(axis="y", linestyle="--", alpha=0.5)

plt.tight_layout()
plt.savefig("model_comparison_chart.png", dpi=120, bbox_inches="tight")
plt.close()
print("Model comparison chart saved to: model_comparison_chart.png")


# ============================================================
# 13. SAVE THE BEST MODEL
# ============================================================
best_model_name = results_df.iloc[0]["Model"]
best_model = trained_models[best_model_name]["model"]

print("\n" + "=" * 60)
print(f"BEST MODEL: {best_model_name}")
print(f"F1-Score: {results_df.iloc[0]['F1-Score']}")
print("=" * 60)

# Save the model + scaler + label encoder for production use
joblib.dump(best_model, "best_model.pkl")
joblib.dump(scaler, "scaler.pkl")
joblib.dump(label_encoder, "label_encoder.pkl")

print("\nSaved artifacts:")
print("  - best_model.pkl       (the trained classifier)")
print("  - scaler.pkl           (feature scaler, needed if SVM/LogReg won)")
print("  - label_encoder.pkl    (to decode 0/1/2 back to Safe/Warning/Critical)")


# ============================================================
# 14. INFERENCE EXAMPLE (how to use the saved model later)
# ============================================================
print("\n" + "=" * 60)
print("INFERENCE EXAMPLE")
print("=" * 60)

# Simulate a new helmet reading
sample_reading = pd.DataFrame([{
    "ambient_temp_c": 38.5,
    "uv_index": 9.2,
    "gas_ppm": 350,
    "noise_db": 88,
    "body_temp_c": 39.1,
    "heart_rate_bpm": 115,
    "baseline_hr_bpm": 75,
    "baseline_body_temp_c": 36.8,
    "hr_deviation_pct": ((115 - 75) / 75) * 100,
    "body_temp_deviation_pct": ((39.1 - 36.8) / 36.8) * 100
}])

# Load the saved model
loaded_model = joblib.load("best_model.pkl")
loaded_encoder = joblib.load("label_encoder.pkl")

# Predict (apply scaler if the best model needs it)
if trained_models[best_model_name]["use_scaled"]:
    loaded_scaler = joblib.load("scaler.pkl")
    sample_scaled = loaded_scaler.transform(sample_reading[FEATURE_COLUMNS])
    pred = loaded_model.predict(sample_scaled)
else:
    pred = loaded_model.predict(sample_reading[FEATURE_COLUMNS])

predicted_label = loaded_encoder.inverse_transform(pred)[0]

print(f"\nSample reading (severe conditions):")
print(sample_reading.to_string(index=False))
print(f"\n>>> Predicted risk level: {predicted_label}")

print("\n" + "=" * 60)
print("ALL DONE")
print("=" * 60)
