# ProSafe ML V2: final report

*Build + evaluation of the V2 machine-learning component and the map of future integration changes.
Nothing outside `ProSafe-ML-V2/` was modified.*

> **Update:** the results for presentation now come from the simplified three-experiment pipeline
> (`src/run_experiments.py`): see `EXPERIMENT_RESULTS.md` and `critical_failure_analysis.md` in this folder. This
> report documents the earlier development procedure (leave-one-worker-out selection and the frozen production
> candidate), which is kept for reference. The production candidate has not been changed.

## 0. Executive summary

* **Preprocessing.** The current system computes only percentage deviations from a single 60-s packet; V2 needs
  28 of its 38 features from per-second history. A complete, fully causal **streaming preprocessor with a
  data-quality gate** was built. Its feature rules were reverse-engineered from the development data and reproduce
  the offline training features **exactly** (100 % for raw, deviation, gas-ratio, rolling, trend and noise-dose
  features; 99.98 % for exposure counters).
* **UNCERTAIN** is a data-quality outcome of the gate. The classifier is 3-class and is never called when the gate
  says UNCERTAIN (tested).
* **Model.** Worker-grouped (leave-one-worker-out) selection chose **Logistic Regression on the EXTENDED feature set**
  (C = 0.01, balanced class weights, median imputation + standardization). Development LOWO: macro F1 **0.706**,
  Critical recall **0.905**, balanced accuracy 0.850, Critical->Safe **0**. Tree models failed to transfer Critical
  across workers (Critical recall 0-14 %).
* **External test (W_002, evaluated once after freezing).** Primary hybrid model (Exp 3): accuracy 0.909, macro F1
  **0.615**, balanced accuracy 0.618, Safe F1 0.94, Warning F1 0.90, but **Critical recall 0.000 (FNR 1.000)**.
  All 260 Critical seconds were predicted **Warning**; none were predicted Safe. W_002's Critical episodes are
  UV-driven (91 % with critical UV exposure, little heat), a mode that barely exists in the training data, where
  Critical is heat-driven. Every candidate trained on W_001 + synthetic misses them.
* **Hybrid training** raised W_002 macro F1 over both baselines (+0.062 vs synthetic-only, +0.027 vs W_001-only)
  but did **not** help Critical. The synthetic-only model flags every W_002 Critical second, but at 7.5 % precision
  (3,442 Critical alarms for 260 true Critical seconds).
* **Verdict:** V2's preprocessing is ready for shadow integration. The V2 classifier is **not** ready to be the sole
  Critical detector. Deterministic critical-exposure guardrails and more real workers with diverse Critical modes
  are needed. Two hard integration blockers exist: 1 Hz sampling and sensor-unit alignment in the firmware.

---

## 1. Current-system preprocessing map

Full detail: `CURRENT_SYSTEM_FLOW.md`. In short:

| Stage | Today |
|---|---|
| Sensor filtering, contact checks | helmet firmware (EMA, beat averaging, finger detection) |
| Validation | helmet flags + backend `validationService` (one bad sensor rejects the **whole** 60-s packet) |
| Missing data, artifacts, gas baseline, rolling windows, trends, noise dose, UNCERTAIN | **not implemented** |
| Baseline lookup, % deviations, feature assembly | backend (`baselineService`, `deviationService`, `featureVectorService`, `mlService`) |
| Exposure accumulators | backend `exposureService` (noise >= 85 dB, HR dev >= 20 %) but **not sent to the model** |
| Inference | old ML service (XGBoost on 10 features incl. raw baselines) |
| Confidence gate (0.70), 5-vote smoothing, transitions, LED | backend `predictionService`, `alertService`, `helmetCommandService` |

Notable current issues: firmware gas is a raw ADC count and noise an uncalibrated RMS while the old model expected
ppm and dB. The firmware's body-temperature contact rule would reject 486 development seconds, all Warning/Critical.
A new worker gets the SAFE LED by default. The old 0.989 F1 came from a random row split, so it is not a cross-worker estimate.

## 2. V2 preprocessing architecture

Full specification: `PREPROCESSING_V2_DESIGN.md`. Code: `src/preprocessing.py` (rules, quality vocabulary),
`src/streaming_preprocessor.py` (per-worker engine), `src/inference_pipeline.py` (gate + classifier).

* **Recovered offline rules:** rolling mean/std with 20 %-of-window minimum samples; median-split trends
  (60 s/20 s and 300 s/100 s); 12 exposure counters on short smoothed signals (ambient 30-s mean 30/35 degC,
  UV 10-s mean 3/8, gas-ratio 10-s mean 2/4, noise 10-s Leq 80/85 dB, HR-dev 30-s mean 20/40 %, body-dev 60-s mean
  0.5/1.0 degC); NIOSH REL workday dose; per-session gas baseline; warm-up of 180 s (cold start) / 20 samples.
* **Offline vs online:** OPTION A, fully causal. Spikes are held (IMPUTED), real level changes are confirmed after
  3 consistent samples, and the gas baseline uses a provisional running median frozen at 180 s. No fixed delay.
* **Per-worker `WorkerState`** with session lifecycle (gap > 30 min, new workday, helmet/wearer change, manual reset),
  JSON export/import for persistence.
* **Parity:** exact on every causal feature family (development replay, 27.9k rows per feature; counters 99.977 %),
  0 artifact rejections on clean data. Documented gaps: offline gas-baseline hindsight, LOCF vs NaN for a
  missing raw value, and a counter-freeze behaviour during long dropouts found post-freeze on W_002 (not adopted).
* **Tests:** 24 behavioural tests + 5 parity tests, all passing.

## 3. Uncertainty handling

* ML-ready files contain only `Safe`, `Warning`, `Critical` (verified for all three; no `Uncertain` label anywhere),
  so no training stop was needed. UNCERTAIN rows had been removed upstream.
* The LabelEncoder holds exactly the 3 classes; `SafetyPredictor` refuses non-model-ready input.
* Runtime: the gate returns `UNCERTAIN` with a reason (`SENSOR_WARMUP`, `INSUFFICIENT_HISTORY`, `BASELINE_UNAVAILABLE`,
  `BODY_CONTACT_FAILURE`, `SENSOR_UNAVAILABLE`, `TOO_MANY_MISSING_SENSORS`, `UNSTABLE_HR`, `PACKET_LOSS`,
  `MAJOR_TIMESTAMP_GAP`, `GAS_BASELINE_UNAVAILABLE`, `OUT_OF_ORDER_TIMESTAMP`, `INVALID_PACKET`,
  `REQUIRED_FEATURES_UNAVAILABLE`); the API returns `{"predicted_class": "UNCERTAIN", "probabilities": {},
  "uncertain_reason": ...}`; the classifier call counter proves it is not invoked.
* **Data-quality coverage** (inferred from the 1 Hz timeline; no audit file available):

| Worker | Expected 1 Hz observations | Valid/imputed (ML-ready) | UNCERTAIN (inferred) | % |
|---|---|---|---|---|
| S_001 | 5,000 | 4,559 | 441 | 8.82 |
| S_002 | 5,000 | 4,668 | 332 | 6.64 |
| S_003 | 5,000 | 4,706 | 294 | 5.88 |
| S_004 | 5,000 | 4,631 | 369 | 7.38 |
| W_001 | 14,400 | 14,015 | 385 | 2.67 |
| W_002 | 14,397 | 13,825 | 572 | 3.97 |

180 s per workday (and 19 s per later session) of these are the warm-up; the rest are mid-session drops. UNCERTAIN is
**not** part of any confusion matrix below.

## 4. Datasets

| File | Rows | Workers | Safe | Warning | Critical | Role |
|---|---|---|---|---|---|---|
| `prosafe_synthetic_ml_ready.csv` | 18,564 | S_001-S_004 (one ~83-min session each) | 5,783 | 12,207 | 574 | development |
| `prosafe_W001_ml_ready.csv` | 14,015 | W_001 (09:00-11:00 + 13:00-15:00) | 3,413 | 9,381 | 1,221 | development (real) |
| `prosafe_W002_ml_ready.csv` | 13,825 | W_002 (same schedule) | 7,114 | 6,451 | 260 | **external test only** |

41 columns each; minute-resolution timestamps (rows are 1 Hz in file order; ~60 rows share each stamp); no duplicate
rows; NaNs only in warm-up long-window features and a few raw environmental values. **`baseline_hr` and
`baseline_body_temperature` are absent** (verified) and are on the forbidden-predictor list anyway. S_002 has no
Critical rows. Details: `outputs/eda/dataset_validation.md`.

## 5. Feature sets

* **CORE (26):** 6 raw sensors, 4 deviations, gas ratio, 8 rolling statistics, 6 trends, noise dose.
* **EXTENDED (38):** CORE + 12 warning/critical exposure-duration counters.
* Never predictors (enforced by `utils.assert_feature_contract`): worker_id, timestamp, risk_level, raw baselines,
  evidence/label/rule/artifact/quality/uncertain columns.

## 6. Models

Logistic Regression, Random Forest, XGBoost, SVM (RBF), all with balanced class handling (class_weight, or balanced
sample weights for XGBoost), no SMOTE. Scale-sensitive models use median imputation + StandardScaler; trees take NaN
natively. Everything is fitted inside the training fold. Evaluation is worker-grouped only (no random row splits).

## 7. Development cross-validation (leave-one-worker-out over S_001-S_004 + W_001)

Pooled out-of-fold, default hyperparameters (`outputs/comparison/candidate_lowo_results.csv`):

| Model | Set | Macro F1 | Critical recall | Balanced acc. | Critical->Safe | Accuracy |
|---|---|---|---|---|---|---|
| **Logistic Regression** | **EXTENDED** | **0.659** | **0.857** | **0.795** | 0.000 | 0.751 |
| XGBoost | EXTENDED | 0.639 | 0.138 | 0.643 | 0.000 | 0.827 |
| SVM | EXTENDED | 0.564 | 0.035 | 0.585 | 0.000 | 0.802 |
| Random Forest | EXTENDED | 0.583 | 0.000 | 0.609 | 0.000 | 0.856 |
| XGBoost | CORE | 0.592 | 0.111 | 0.595 | 0.009 | 0.789 |
| Random Forest | CORE | 0.575 | 0.041 | 0.578 | 0.000 | 0.819 |
| Logistic Regression | CORE | 0.575 | 0.835 | 0.722 | 0.000 | 0.653 |
| SVM | CORE | 0.519 | 0.059 | 0.546 | 0.011 | 0.720 |

Charts: `outputs/comparison/candidate_macro_f1.png`, `candidate_critical_recall.png`, `core_vs_extended.png`.

Tree ensembles reach higher *accuracy* but almost never recognise another worker's Critical seconds: they split on
absolute levels that differ between workers. The linear model transfers far better.

## 8. Selected model

Pre-registered rule: pooled macro F1 (ties within 0.005), then Critical recall, balanced accuracy, lower
Critical->Safe; EXTENDED must beat the best CORE by > 0.01.

* Selected: **Logistic Regression / EXTENDED** (beats best CORE by 0.067).
* Tuning (LOWO grid over C): C = 0.01, 0.03 and 0.1 tied on macro F1 (0.706-0.710). Critical recall picked
  **C = 0.01** (0.905 vs 0.857 at the default C = 1).
* **Frozen** at 2026-10-08 05:08:08 UTC before W_002 was evaluated (`models/frozen_config.json`): algorithm,
  38-feature order, hyperparameters, scaling (median impute + StandardScaler), class weighting, label mapping
  (Critical 0, Safe 1, Warning 2).
* Frozen config, development LOWO: macro F1 **0.706**, Critical recall **0.905**, balanced accuracy 0.850,
  Critical->Safe 0, accuracy 0.788. Per held-out worker macro F1: S_001 0.603, S_002 0.769, S_003 0.645,
  S_004 0.531, W_001 0.681.
* Production candidate: trained on **W_001 + all synthetic** (32,579 rows): `models/best_model.pkl`.

## 9. Experiments (frozen configuration)

| # | Train | Test | Accuracy | Bal. acc. | Macro F1 | Weighted F1 | Critical recall | Critical FNR | Critical->Safe | n_train | n_test |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | synthetic (leave-one-out) | held-out synthetic | 0.839 | 0.796 | **0.754** | 0.842 | 0.692 | 0.308 | 0.000 | ~13,923 | 18,564 |
| 2 | synthetic | W_002 | 0.714 | 0.796 | 0.553 | 0.757 | **1.000** | 0.000 | 0.000 | 18,564 | 13,825 |
| 3 | **W_001 + synthetic** | **W_002** | **0.909** | 0.618 | **0.615** | 0.906 | **0.000** | **1.000** | 0.000 | 32,579 | 13,825 |
| 4 | W_001 | W_002 | 0.874 | 0.596 | 0.588 | 0.866 | 0.000 | 1.000 | 0.000 | 14,015 | 13,825 |
| ref | dev LOWO | held-out dev worker | 0.788 | 0.850 | 0.706 | 0.809 | 0.905 | 0.095 | 0.000 | ~26,063 | 32,579 |
| ref | synthetic | W_001 | 0.705 | 0.853 | 0.681 | 0.738 | 1.000 | 0.000 | 0.000 | 18,564 | 14,015 |

Per-class F1 (Safe / Warning / Critical): Exp 1 0.80 / 0.87 / 0.59; Exp 2 0.94 / 0.58 / 0.14; **Exp 3 0.94 / 0.90 / 0.00**;
Exp 4 0.89 / 0.88 / 0.00. Full tables: `outputs/experiment_summary.md`, `outputs/experiment_summary.csv`.

Exp 3 confusion matrix on W_002 (rows true, columns predicted Safe/Warning/Critical):
Safe [6613, 501, 0], Warning [346, 5957, 148], Critical [0, 260, 0]. See `outputs/experiments/w002_confusion_matrix.png`.

Charts: `experiments_macro_f1.png`, `experiments_balanced_accuracy.png`, `experiments_critical_recall.png`,
`experiments_critical_fnr.png`, `transfer_gap.png`, `per_class_f1.png`, `experiments_confusion_matrices.png`,
`feature_importance.png` (all in `outputs/experiments/`).

## 10. Critical recall and false-negative rate

* Development (LOWO): Critical recall 0.905, FNR 0.095, Critical->Safe 0.
* W_002, production model: **Critical recall 0, FNR 1.0**; but Critical->Safe stays **0**. Every missed Critical
  second was reported as Warning, so the worker would still have been shown an elevated (Warning) state.
* At the episode level W_002 has **3 Critical episodes (33 s, 204 s, 23 s)**. The production model raised no Critical
  inside them; its nearest Critical predictions were 146-432 s away. With 3 episodes, any Critical-recall estimate on
  W_002 is statistically fragile, but a 0/3 result is still a clear negative signal.

### Why (post-freeze diagnosis; nothing was re-selected)

| Critical rows | heat-warning counter active | UV-critical counter active | median ambient | median UV |
|---|---|---|---|---|
| synthetic | 94 % | 13 % | 34.9 degC | 4.4 |
| W_001 | 99 % | 45 % | 31.7 degC | 7.7 |
| W_002 | **9 %** | **91 %** | **28.5 degC** | **8.9** |

The labelled Critical state in W_002 comes from **sustained critical UV plus moderately elevated heart rate**, without
heat exposure. In the training data Critical almost always co-occurs with long heat exposure; the largest model
coefficient is `temp_warning_exposure_sec`. The production model's P(Critical) on W_002's Critical seconds
never exceeds 0.22 (median 0.05), below the 0.66 that true-Warning seconds reach at p99. **No probability threshold
recovers them** without flooding false alarms. This is a training-data coverage problem: two real workers cannot span
the Critical modes. The labelling framework's UV-driven Critical rule should be represented in synthetic and real
training data.

## 11. Did hybrid training improve W_002?

| Comparison | Macro F1 | Balanced acc. | Critical recall | Accuracy |
|---|---|---|---|---|
| Exp 3 vs Exp 2 (add real W_001 to synthetic) | **+0.062** | -0.179 | -1.000 | +0.195 |
| Exp 3 vs Exp 4 (add synthetic to real W_001) | **+0.027** | +0.022 | 0.000 | +0.036 |

**Partially.** Hybrid training is the best of the three on overall macro F1, accuracy and weighted F1, and gives the
best Safe/Warning separation. Adding synthetic data to W_001 helped a little on every overall metric. It did **not**
help the safety-critical class: Critical recall is 0, the same as real-only, while synthetic-only finds every
Critical second but buries them in false alarms (Critical precision 0.075). Synthetic augmentation is useful for
Safe/Warning calibration; it does not yet cover the Critical modes seen in real workers.

## 12. CORE vs EXTENDED

EXTENDED was better for every algorithm in development LOWO (macro F1 +0.007 to +0.084; LR +0.084, Critical recall
+0.02). On W_002 (post-freeze transparency table, Exp 3 setting) EXTENDED was again better on macro F1 for every
algorithm (LR 0.615 vs 0.515), yet only LR-CORE caught any W_002 Critical (13.9 %). Cautions that remain:
the exposure counters are close relatives of the labelling framework's own inputs (part of the gain may be learning
the labelling rule rather than physiology), and they are the features most sensitive to stream gaps in deployment.
Their online fidelity is 99.98 % on contiguous data.

## 13. Feature importance

Production model (|standardized coefficient|, normalized): `temp_warning_exposure_sec` 0.104,
`uv_warning_exposure_sec` 0.090, `noise_dose_pct` 0.056, `hr_critical_exposure_sec` 0.048,
`ambient_temp_rolling_mean_300s` 0.046, `noise_critical_exposure_sec` 0.045, `uv_rolling_mean_300s` 0.044,
`uv_index` 0.042, `body_temp_deviation_pct` 0.040, `body_temp_deviation_c` 0.039.
Permutation importance on W_002 (macro-F1 drop): `uv_warning_exposure_sec` 0.188 dominates; next
`hr_warning_exposure_sec` 0.012, `uv_critical_exposure_sec` 0.009. Exposure durations carry most of the signal.
`outputs/experiments/feature_importance*.csv|png`.

## 14. Synthetic-to-real gap

Trained on synthetic only: macro F1 0.754 on held-out synthetic workers, 0.681 on W_001 (dev) and **0.553 on W_002**,
a **0.201** macro-F1 gap. On real workers the synthetic model over-calls Critical (perfect recall, very low precision)
and under-calls Warning (W_002 Warning recall 0.41): the synthetic Warning/Critical boundary sits lower than the real
labels. `outputs/experiments/transfer_gap.png`.

## 15. Limitations

1. **Six workers in total**, one real development worker, one external worker, and only 3 Critical episodes in the
   external test. Per-worker metrics vary widely (dev LOWO macro F1 0.53-0.77).
2. **W_002 has now been used.** Any change made because of these results (new features, thresholds, guardrails,
   retraining) needs a new unseen worker for an unbiased estimate.
3. Labels come from a rule-based framework over largely the same signals, so the classifier partly learns that
   framework, the EXTENDED counters especially.
4. Raw baselines are excluded, but a linear model can still recover `HR - hr_deviation_bpm`; with few workers this is
   a mild identity channel.
5. Only the selected algorithm was tuned (per the plan); the tree models were compared at sensible defaults.
6. Offline rules were reverse-engineered. The offline gas-baseline estimator, artifact interpolation and the
   counter-freeze during long dropouts are not exactly reproducible online.
7. Training-data timestamps have minute resolution; within-minute positions are inferred from row order.
8. LR imputes not-yet-available warm-up features with the training median (the same as for the training NaN rows).
   A stricter mode (UNCERTAIN until all 38 exist, ~250 s) is available but was not evaluated.
9. Probability outputs were not calibrated; the backend's 0.70 confidence threshold should be re-derived on
   development data.

## 16. Backend preprocessing changes still needed (detail: `BACKEND_INTEGRATION_V2.md`)

* Firmware: **1 Hz sampling** with batched upload; **unit alignment** (gas sensor units of the V2 data collection,
  calibrated dBA noise, continuous UV index); `null` instead of `-1`; drop the ambient-delta contact rule and the
  fabricated DHT fallback values.
* Backend: batch endpoint; per-channel validation; run the V2 preprocessor (recommended inside the V2 service via
  `POST /predict/raw` with persisted `WorkerState`, rather than a JS port); stop sending raw baselines; replace the two
  exposure accumulators with the 12 V2 counters; workday noise dose; per-session gas baseline.
* New state: `dataQualityState`/`uncertainReason`/`uncertainSince`, V2 features per sample, serialized `WorkerState`;
  `DATA_QUALITY` alert type; UNCERTAIN excluded from smoothing and never converted to SAFE (fix the new-worker SAFE
  LED default); `HelmetCommand.risk` + firmware support an UNCERTAIN LED pattern.
* **Safety guardrail:** keep deterministic critical-exposure rules (e.g. sustained critical UV / heat / gas / noise
  exposure combined with HR deviation) alongside the classifier until Critical coverage is fixed. Design them on
  development data and validate them on a new worker.

## 17. Frontend UNCERTAIN changes still needed

`StatusBadge.RiskBadge` and `CurrentConditionCard` badge maps (neutral tone + icon + "Uncertain" label + reason),
`WorkerSafetyCard` (last confirmed risk + data-quality state), `PredictionTimelineChart` / `SafetyPredictionModal`
(grey UNCERTAIN segments), `WorkerStatusSummary` (Uncertain bucket), alerts UI for `DATA_QUALITY`, analytics
coverage metric, safety-guidance text for UNCERTAIN, and the matching tests.

## 18. Recommended next steps

1. Shadow-run V2 preprocessing on live 1 Hz data once the firmware streams it; compare gate coverage with the
   offline estimate (2.7-8.8 % UNCERTAIN).
2. Collect more real workers, deliberately covering UV-, gas- and noise-driven Critical conditions; extend the
   synthetic generator to those modes.
3. Retrain with the same frozen procedure; consider cross-worker-robust variants (feature normalisation per worker,
   monotonic constraints) evaluated by LOWO only.
4. Validate on a **new** unseen worker before any production switch.

## 19. Reproduce

```
python src/eda.py                          # validation + EDA (W_002: structure only)
python src/train_models.py                 # LOWO comparison, selection, tuning, FREEZE, production artifacts
python src/evaluate.py                     # Experiments 1-4 + post-freeze analyses + charts
python tests/test_preprocessing_parity.py  # online vs offline feature parity (development workers)
python tests/test_streaming_preprocessor.py
python src/predict.py                      # SafetyPredictor demo
python serve.py                            # V2 service on :8001 (raw endpoint: PROSAFE_ENABLE_RAW_ENDPOINT=1)
streamlit run app.py
```

Artifacts (`models/`): `best_model.pkl` (Logistic Regression), `best_model_meta.pkl`, `all_models_meta.pkl`
(4 models, relative paths), `scaler.pkl` (median imputer + StandardScaler), `label_encoder.pkl` (3 classes),
`frozen_config.json`, per-algorithm `*.pkl`, JSON copies of the metadata.
