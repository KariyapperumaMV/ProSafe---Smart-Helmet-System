# ProSafe ML (v1): Original Worker Safety Classifier

> **Status: historical, not used by the running system.** Since 2026-10-09 the ProSafe backend calls the
> **ProSafe ML V2** service ([`../ProSafe-ML-V2`](../ProSafe-ML-V2/README.md)) on port 8001. This folder and its
> Flask service on port 8000 are kept unchanged for reference. Nothing in the current backend, frontend or ML V2
> code imports from or calls this folder.

The first ProSafe machine-learning prototype: a multi-class classifier that predicts construction-worker safety risk
(`Safe` / `Warning` / `Critical`) from one set of smart-helmet readings. It introduced the personalized idea that
ProSafe kept: each worker has their own heart-rate and body-temperature baseline, and the model learns from deviation
rather than fixed thresholds.

For the overall system, see the [project README](../README.md).

## Relationship to ProSafe ML V2

| Aspect | ProSafe ML v1 (this folder) | ProSafe ML V2 |
| --- | --- | --- |
| Status | Historical reference, not called | Deployed decision service |
| Input | One reading as a 10-value feature vector, built by the caller | Raw 1 Hz readings, processed by a streaming preprocessor |
| Features | 10: 6 raw sensor values, the 2 raw baselines, 2 deviation percentages | 38 (EXTENDED): raw values, deviations, gas ratio, rolling statistics, trends, noise dose, exposure counters |
| Baselines | Used directly as model features | Context for the deviation features only; never model features |
| Temporal context | None (each row is independent) | Rolling windows, trends and exposure durations |
| Data-quality handling | None | Data-quality gate that returns UNCERTAIN instead of a prediction |
| Dataset | One synthetic dataset, 20,000 rows, 90 workers | Synthetic S_001–S_004 plus real workers W_001–W_003 |
| Evaluation | Random stratified 80/20 split of rows + 5-fold CV | Training and test data always come from different workers |
| Gas unit | Column named `gas_ppm` | `gas` in sensor units (V2 accepts `gas_ppm` only as a legacy alias) |
| Service | `serve.py`, port 8000, `POST /predict` | `serve.py`, port 8001, `POST /predict/raw` |

The scores below are much higher than V2's because a random row split puts near-identical rows of the same synthetic
workers on both sides of the split. The two sets of numbers measure different things and should not be compared
directly (see [ML V2: why the scores differ](../ProSafe-ML-V2/README.md#why-these-scores-are-lower-than-the-v1-scores)).

## Folder contents

```
ProSafe-ML/
├── data/worker_safety_dataset.csv   synthetic dataset (20,000 rows, 90 workers)
├── src/
│   ├── utils.py                     paths, the 10-feature list, dataset loader
│   ├── eda.py                       exploratory data analysis (plots to outputs/eda/)
│   ├── train_models.py              training, comparison, cross-validation, model saving
│   └── predict.py                   SafetyPredictor (inference)
├── models/                          saved artifacts (best_model.pkl, scaler.pkl, label_encoder.pkl,
│                                    best_model_meta.pkl, all_models_meta.pkl, one .pkl per algorithm)
├── outputs/                         comparison and cross-validation CSVs, confusion matrices,
│                                    feature importance and comparison charts
├── reference/                       earlier baseline: train_models.py, its artifacts and results (do not edit)
├── app.py                           Streamlit demo
├── serve.py                         Flask service used by the backend before V2 (port 8000)
├── requirements.txt
├── package.json, package-lock.json, node_modules/   an npm package named "streamlit"; not used by any Python code
└── streamlit.log                    log of an earlier local Streamlit run
```

## Dataset

`data/worker_safety_dataset.csv` is synthetic: 20,000 rows, 90 worker IDs (`W001`, ...), classes
Critical 7,000 / Warning 7,000 / Safe 6,000.

| Column | Role |
| --- | --- |
| `worker_id`, `timestamp` | Identifiers, not used as features |
| `ambient_temp_c`, `uv_index`, `gas_ppm`, `noise_db` | Environmental features |
| `body_temp_c`, `heart_rate_bpm` | Physiological features |
| `baseline_hr_bpm`, `baseline_body_temp_c` | Worker baselines (used as features in v1) |
| `hr_deviation_pct`, `body_temp_deviation_pct` | Personalized deviation features |
| `risk_level` | Target: `Safe`, `Warning`, `Critical` |

The labels are part of the synthetic dataset; the code that generated them is not in this repository.

## Training workflow (`src/train_models.py`)

1. Load the dataset and validate the columns (`utils.load_dataset`).
2. Stratified 80/20 train/test split (`random_state=42`).
3. Train Random Forest, XGBoost, SVM (RBF) and Logistic Regression. SVM and Logistic Regression use a
   `StandardScaler` fitted on the training split.
4. 5-fold stratified cross-validation (weighted F1) for each model.
5. Save the comparison CSVs and plots to `outputs/`, every model to `models/`, and the best model with
   `best_model_meta.pkl` (model name and whether it needs scaling).

Hyperparameter tuning (`tune_best_model`) exists but is commented out in `main()`.

## Saved results

From `outputs/model_comparison_results.csv` (20% hold-out, weighted metrics) and
`outputs/cross_validation_results.csv` (5-fold weighted F1):

| Model | Accuracy | Weighted F1 | CV F1 mean ± std |
| --- | --- | --- | --- |
| **XGBoost** (saved as best) | 0.9888 | 0.9888 | 0.9876 ± 0.0015 |
| Random Forest | 0.9755 | 0.9755 | 0.9786 ± 0.0043 |
| SVM | 0.9255 | 0.9258 | 0.9262 ± 0.0027 |
| Logistic Regression | 0.6408 | 0.6417 | 0.6372 ± 0.0101 |

These are random-split scores on synthetic data. They are not evidence of performance on real workers.

## Running the scripts

Python 3.10 or newer. The scripts resolve paths from their own location, so they can be run from any working
directory; the commands below assume this folder.

```bash
python -m venv venv
venv\Scripts\activate          # Windows; on macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
```

| Command | Effect |
| --- | --- |
| `python src/predict.py` | Loads the saved best model and prints three example predictions. Read-only |
| `python serve.py` | Starts the historical Flask service on port 8000 (`PORT` overrides it) |
| `python -m streamlit run app.py` | Streamlit demo (sliders, presets, model picker, probabilities) |
| `python src/eda.py` | Writes EDA plots and summary statistics to `outputs/eda/` |
| `python src/train_models.py` | **Retrains and overwrites** `models/` and `outputs/` |

**Do not retrain unless you intend to replace the historical artifacts.** Retraining overwrites the saved models and
results in this folder. It does not affect the running system, which uses ML V2. To experiment, work on a copy of the
folder.

### Historical HTTP service (`serve.py`)

| Endpoint | Behaviour |
| --- | --- |
| `GET /health` | `{"status": "ok", "model": "<model name>"}` |
| `POST /predict` | Body: the 10 features of `utils.FEATURE_COLUMNS`, all numeric. Returns `{"predicted_class": "SAFE" \| "WARNING" \| "CRITICAL", "probabilities": {...}}`. HTTP 400 if a feature is missing or non-numeric |

### Programmatic use

```python
from predict import SafetyPredictor   # with src/ on sys.path

predictor = SafetyPredictor.load()
predictor.predict_with_confidence({
    "ambient_temp_c": 38.5, "uv_index": 9.2, "gas_ppm": 350.0, "noise_db": 88.0,
    "body_temp_c": 39.1, "heart_rate_bpm": 115, "baseline_hr_bpm": 75, "baseline_body_temp_c": 36.8,
    "hr_deviation_pct": 53.33, "body_temp_deviation_pct": 6.25,
})   # illustrative input -> {"risk_level": ..., "probabilities": {...}}
```

## Known issues

- `models/all_models_meta.pkl` stores **absolute** model paths from the machine where training last ran.
  `SafetyPredictor.load()` (used by `serve.py` and `predict.py`) is not affected, but `load_named()` (used by the
  Streamlit model picker) fails with `FileNotFoundError` in a checkout at a different path until the models are
  retrained there. `streamlit.log` shows this error from an earlier folder location.
- The original README referred to a `PRESENTATION_QA.md` file; it does not exist in this folder.
- `package.json` / `node_modules` install an npm package called `streamlit`, which is unrelated to the Python
  Streamlit package and is not used.
- No automated tests exist for this folder.
- Each prediction uses one reading only: no temporal context and no data-quality handling. These limits motivated V2.
