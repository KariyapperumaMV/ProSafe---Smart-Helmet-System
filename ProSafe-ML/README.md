# Worker Safety ML

A multi-class classifier that predicts construction-worker safety risk (`Safe` / `Warning` / `Critical`) from smart-helmet sensor data. The model uses **personalized deviation features** — each worker has their own heart-rate and body-temperature baseline, and the model learns from deviation rather than fixed thresholds.

Part of a research project on a personalized AI-driven wearable safety monitoring system for construction workers.

---

## Project description

The smart helmet streams 8 sensor readings per worker:

| Category | Features |
| --- | --- |
| Environmental | `ambient_temp_c`, `uv_index`, `gas_ppm` (MQ2), `noise_db` |
| Physiological (live) | `body_temp_c`, `heart_rate_bpm` |
| Physiological (baseline) | `baseline_hr_bpm`, `baseline_body_temp_c` |
| Derived (personalized) | `hr_deviation_pct`, `body_temp_deviation_pct` |

The classifier compares four algorithms — **Random Forest**, **XGBoost**, **SVM (RBF)**, and **Logistic Regression** — and persists the best for inference.

Benchmark: **XGBoost reaches ~98.9% weighted F1** on the 20,000-row synthetic dataset (90 unique workers).

---

## Folder structure

```
worker-safety-ml/
├── data/                       # input dataset (worker_safety_dataset.csv)
├── models/                     # saved .pkl artifacts (created by training)
│   ├── best_model.pkl
│   ├── scaler.pkl
│   ├── label_encoder.pkl
│   └── best_model_meta.pkl     # records winning model + whether it needs scaling
├── outputs/                    # generated plots + CSVs
│   ├── eda/                    # EDA visuals
│   ├── model_comparison_results.csv
│   ├── cross_validation_results.csv
│   ├── confusion_matrices.png
│   ├── feature_importance.png
│   └── model_comparison_chart.png
├── reference/                  # baseline implementation (do not edit)
├── src/
│   ├── utils.py                # shared paths, feature list, dataset loader
│   ├── eda.py                  # exploratory data analysis
│   ├── train_models.py         # training, comparison, cross-validation
│   └── predict.py              # inference (SafetyPredictor class)
├── app.py                      # Streamlit demo UI
├── PRESENTATION_QA.md          # Q&A doc for presenting the project
├── requirements.txt
└── README.md
```

---

## Installation

Requires **Python 3.10+**.

### Windows (PowerShell)

```powershell
py -3.10 -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### macOS / Linux

```bash
python3.10 -m venv venv
source venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### Verify

```
python -c "import pandas, numpy, sklearn, xgboost, matplotlib, seaborn, joblib; print('OK')"
```

---

## How to run

All scripts must be run **from the project root** (paths are resolved relative to the project, not the CWD, so it Just Works).

### 1. Exploratory data analysis

```
python src/eda.py
```

Writes plots to `outputs/eda/`:

- `01_class_distribution.png`
- `02_feature_histograms.png`
- `03_correlation_heatmap.png`
- `04_boxplots_by_risk_level.png`
- `summary_statistics.csv`

### 2. Train + compare models

```
python src/train_models.py
```

This:

1. Loads the dataset, stratifies an 80/20 split.
2. Trains Random Forest, XGBoost, SVM, and Logistic Regression.
3. Runs 5-fold stratified cross-validation on each.
4. Saves comparison CSVs and three plots to `outputs/`.
5. Persists the winning model + scaler + label encoder + metadata to `models/`.

**To enable hyperparameter tuning**, uncomment the `tune_best_model(...)` call near the end of `main()` and re-run. It is off by default because it adds several minutes for ~0.5pp F1 gain.

### 3. Run inference

```
python src/predict.py
```

Demos three example predictions (one per risk level). Sample output:

```
Loaded model: XGBoost (scaling=off)

--- Critical — heat-stress + toxic gas ---
  Predicted: Critical
  Probabilities: Critical=98.7%, Safe=0.1%, Warning=1.2%
```

### 4. Interactive Streamlit demo (for presentations)

```
streamlit run app.py
```

Opens a browser-based UI at `http://localhost:8501` where you can:

- **Adjust sensor sliders** for both environmental and physiological readings
- **Load preset scenarios** (Safe / Warning / Critical) from the sidebar
- See the **personalized deviation** auto-computed from the raw vitals
- Get a **color-coded risk prediction** with per-class probabilities
- Inspect **feature importance** to see which signals the model relies on

The app loads the trained model from `models/` — so run `python src/train_models.py` first.

### Programmatic use

```python
from predict import SafetyPredictor

predictor = SafetyPredictor.load()   # do this once at startup

risk = predictor.predict_risk({
    "ambient_temp_c": 38.5,
    "uv_index": 9.2,
    "gas_ppm": 350.0,
    "noise_db": 88.0,
    "body_temp_c": 39.1,
    "heart_rate_bpm": 115,
    "baseline_hr_bpm": 75,
    "baseline_body_temp_c": 36.8,
    "hr_deviation_pct": 53.33,
    "body_temp_deviation_pct": 6.25,
})
# -> "Critical"
```

---

## Expected results

On the 20,000-row dataset (`random_state=42`):

| Model | Accuracy | F1 (weighted) |
| --- | --- | --- |
| **XGBoost** | ~0.989 | **~0.989** |
| Random Forest | ~0.985 | ~0.985 |
| SVM (RBF) | ~0.95 | ~0.95 |
| Logistic Regression | ~0.85 | ~0.85 |

Cross-validation F1 standard deviation should be very small (< 0.005) for the tree models, confirming the holdout result is not a lucky split.

The two most important features (by `feature_importances_`) are typically `hr_deviation_pct` and `body_temp_deviation_pct` — strong empirical support for the personalized-baseline approach versus fixed thresholds.

---

## Reproducibility

`random_state=42` is set everywhere: train/test split, each classifier, the cross-validation `StratifiedKFold`, and the GridSearchCV grid. Runs are deterministic on the same package versions.
