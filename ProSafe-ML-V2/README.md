# ProSafe ML V2

The risk-decision service of the ProSafe smart-helmet system. Since 2026-10-09 the backend calls this service for
every helmet sample; see **`BACKEND_INTEGRATION_V2.md`** for the end-to-end integration (firmware, backend, frontend,
contracts, start-up, open items). The old `ProSafe-ML/` service is kept but no longer used.

V2 has two components:

| Component | What | Code |
|---|---|---|
| **A. Preprocessing / feature engineering** | raw 1 Hz observations -> validation, causal cleaning, missing-data hold, personalized deviations, session gas baseline, rolling stats, trends, exposure counters, NIOSH noise dose, **data-quality gate** (READY or UNCERTAIN) | `src/preprocessing.py`, `src/streaming_preprocessor.py` |
| **B. ML classification** | model-ready features -> Safe / Warning / Critical | `src/predict.py`, `src/modeling.py` |
| Glue | UNCERTAIN -> classifier not called; READY -> classifier | `src/inference_pipeline.py`, `serve.py` |

System outputs: **SAFE, WARNING, CRITICAL, UNCERTAIN**. Classifier classes: **Safe, Warning, Critical** only. UNCERTAIN
is a data-quality outcome, never a fourth class. Worker baselines are context for the deviation features, never model
features.

## Production model

**XGBoost, EXTENDED feature set (38 features), Experiment 2 artifact.** Trained on the synthetic workers plus real
worker W_001; W_002 is the external test worker and was never used for training. Version
`prosafe-ml-v2-xgboost-extended-exp2-2026-10-09`.

| W_002 external test | Accuracy | Balanced acc. | Macro F1 | Critical recall | Critical precision | Critical F1 | Critical->Safe |
|---|---|---|---|---|---|---|---|
| XGBoost EXTENDED | 0.9546 | 0.6766 | 0.6848 | 0.0885 (23/260) | 0.2054 | 0.1237 | 0 |

**Limitation:** 237 of W_002's 260 Critical seconds were predicted Warning (none Safe). Its Critical episodes are
UV-driven, a pattern almost absent from the training data (`outputs/critical_failure_analysis.md`). Do not rely on the
model alone as a Critical detector for such patterns. The backend provides a backstop integration point for that
(`BACKEND_INTEGRATION_V2.md` section 1).

`python src/promote_model.py` promoted it. The script checks the experiment artifact (algorithm, experiment, training
files, feature set, 38 columns, recorded W_002 metrics) and refuses anything else. It archived the previous candidate,
wrote `models/best_model.pkl`, `best_model_meta.pkl`, `label_encoder.pkl`, `all_models_meta.pkl` and
`frozen_config.json`, and proved that the production loader reproduces the artifact's W_002 predictions and
probabilities exactly. `python src/promote_model.py --check` re-verifies without changing anything. The model is
unscaled, so no `scaler.pkl` is needed.

## Run the service

```
pip install -r requirements.txt
python serve.py                       # port 8001
curl http://localhost:8001/health     # {"status":"ok","model_name":"XGBoost","feature_set":"EXTENDED","feature_count":38,...}
```

`POST /predict/raw` (production, `{"readings": [...]}` of raw 1 Hz samples) and `POST /predict` (one model-ready
feature vector, for testing). `/health` answers 503 "unhealthy" if any model other than the promoted one is loaded.
Per-worker streaming state is held in process memory: run a single process, and expect a restart to put every worker
back into warm-up (UNCERTAIN).

## The three experiments (how the model was chosen)

| # | Train | Test |
|---|---|---|
| 1 Synthetic -> Worker 1 | `data/prosafe_synthetic_ml_ready.csv` | `data/prosafe_W001_ml_ready.csv` |
| 2 Synthetic + Worker 1 -> Worker 2 | synthetic + W_001 | `data/prosafe_W002_ml_ready.csv` |
| 3 Worker 1 -> Worker 2 | W_001 | W_002 |

`python src/run_experiments.py` gives Random Forest, XGBoost, SVM and Logistic Regression the same training-side
optimization: 12 seeded configurations x 3 feature sets = 36 candidates per algorithm per experiment, with
leave-one-training-worker-out validation, or contiguous time blocks with a 300-row purge for Experiment 3. It selects
with one rule: accuracy within 0.01 of the best, then macro F1 -> balanced accuracy -> Critical recall -> fewest
Critical->Safe. Each selection is scored once on the test worker. Results are in `outputs/EXPERIMENT_RESULTS.md`; models
are in `models/experiments/`. The decision to deploy the Experiment-2 XGBoost was made after all W_002 results were
known, so W_002 is no longer an unbiased estimate for it. A new unseen real worker is needed for that.

## Layout

```
data/                         the three ML-ready datasets (only copies)
src/
  utils.py                    paths, feature contract, forbidden predictors, aliases, guarded data loaders
  preprocessing.py            V2 preprocessing rules + data-quality vocabulary
  streaming_preprocessor.py   per-worker online feature engine + quality gate (baseline change -> new session)
  inference_pipeline.py       raw reading -> gate -> classifier; READY / UNCERTAIN response contract
  predict.py                  SafetyPredictor (model-ready features -> Safe/Warning/Critical)
  promote_model.py            verify + promote the selected experiment artifact (no training)
  modeling.py                 fold-safe fitting, metrics, ranking rule
  run_experiments.py          the training/evaluation command (fair optimization of all four algorithms)
  plot_style.py               chart style
tests/
  test_production_integration.py  promoted artifact parity, feature contract, baseline lifecycle, raw replay, HTTP contract
  test_streaming_preprocessor.py  warm-up, isolation, sessions, missing data, gate, pipeline, HTTP service
  test_preprocessing_parity.py    online features reproduce the offline training features (--report writes a report)
models/
  best_model.pkl, best_model_meta.pkl, label_encoder.pkl, all_models_meta.pkl, frozen_config.json   production model
  experiments/                one model per algorithm per experiment (12)
outputs/                      experiment results
archive/                      earlier outputs, the previous model candidate, retired scripts (see archive/README.md)
serve.py                      the decision service (Flask, port 8001)
app.py                        Streamlit demo (model-ready prediction and raw-stream replay)
BACKEND_INTEGRATION_V2.md     the implemented end-to-end integration
PREPROCESSING_V2_DESIGN.md    V2 preprocessing design (rules, offline vs online, WorkerState, UNCERTAIN, resets)
CURRENT_SYSTEM_FLOW.md        the pre-integration (v1) flow, historical
requirements.txt
```

## Tests (from this folder, Python 3.12)

```
python tests/test_production_integration.py
python tests/test_streaming_preprocessor.py
python tests/test_preprocessing_parity.py
```

`gas` is in the V2 dataset's sensor units, **not** calibrated ppm. `gas_ppm` is accepted only as a legacy alias.

## Why these scores are lower than the old ~99 %

The old ProSafe model was scored on a random 80/20 split of rows from one synthetic dataset, so near-identical
neighbouring seconds of the same workers sat on both sides of the split. V2 always tests on a **different**
dataset/worker than it trained on. That is harder and more realistic; the two numbers measure different things.
