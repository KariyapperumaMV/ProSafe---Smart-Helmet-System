# ProSafe ML V2 in the live system (implemented 2026-10-09)

ProSafe ML V2 is now the decision path of the ProSafe system. This document describes what was built, the contracts
between the parts, and the limits that still apply. `CURRENT_SYSTEM_FLOW.md` describes the system **before** this
integration (the v1 path), kept for reference.

```
Helmet (ESP32)        1 Hz samples, own timestamp per sample, null = channel not readable
   | POST /api/helmet/data  {helmetId, samples:[...]}  every ~5 s (unsent samples kept on failure)
   v
Backend (Node)        validate identity + structure only -> resolve worker from helmet
   |                  -> worker baseline (User.baselineHeartRate / baselineBodyTemperature; context, NOT a feature)
   | POST {ML_SERVICE_URL}/predict/raw  {readings:[...]} in received order
   v
ProSafe ML V2         StreamingPreprocessor (per-worker WorkerState: hold, artifacts, deviations, session gas
(Python, :8001)       baseline, rolling stats, trends, 12 exposure counters, NIOSH dose)
   |                  -> data-quality gate: UNCERTAIN (reason)  ->  classifier NOT called
   |                                    READY  ->  XGBoost EXTENDED (38 features) -> SAFE / WARNING / CRITICAL
   v
Backend               session sync -> 0.70 confidence rule -> 5-vote smoothing (UNCERTAIN never votes)
   |                  -> transition alerts / DATA_QUALITY alerts -> one HelmetData per sample
   |                  -> WorkerProcessingState -> LED command (SAFE / WARNING / CRITICAL / UNCERTAIN)
   v
MongoDB, notifications, helmet LED (polls GET /api/helmet/command/:helmetId every 5 s)
   v
Frontend              status badges, dashboard counts, timeline, alerts: SAFE / WARNING / CRITICAL / UNCERTAIN
```

Python V2 is the **single source of feature truth**: the backend computes no model feature, and nothing is
preprocessed twice. The v1 10-feature vector (raw baselines as features, `POST /predict` on the old service) is retired.

---

## 1. Production model

| | |
|---|---|
| Model | XGBoost, feature set **EXTENDED** (38 features, frozen order `utils.EXTENDED_FEATURE_COLUMNS`), unscaled |
| Artifact | promoted from `models/experiments/exp2_xgboost.pkl` by `src/promote_model.py` (verifies identity, metrics and W_002 prediction parity; refuses anything else) |
| Version | `prosafe-ml-v2-xgboost-extended-exp2-2026-10-09` |
| Trained on | synthetic workers S_001-S_004 + real worker W_001 (Experiment 2). **W_002 was never used for training.** |
| External test (W_002) | accuracy 0.9546, balanced accuracy 0.6766, macro F1 0.6848, Critical recall 0.0885, Critical precision 0.2054, Critical F1 0.1237, Critical->Safe 0 |
| Hyperparameters | subsample 1.0, reg_lambda 5, reg_alpha 0.1, n_estimators 20, min_child_weight 1, max_depth 8, learning_rate 0.15, gamma 0.05, colsample_bytree 0.6; balanced class weights, Critical x1.0, Warning x0.75 |

**Known limitation, stated plainly:** on W_002 the model detected **23 of 260** Critical seconds. The other 237 were
predicted **Warning** (none Safe). W_002's Critical episodes are UV-driven, a pattern almost absent from the training
data (`outputs/critical_failure_analysis.md`). The model must not be treated as a reliable Critical detector for
patterns like that. The backend therefore keeps an explicit, tested **backstop integration point**
(`ProSafe-Web/backend/services/criticalBackstopService.js`). It is deliberately a no-op, so no thresholds were invented
for it. A validated deterministic rule set can be plugged in there. It can only raise severity, and it is flagged per
sample (`prediction.backstopState`).

The decision to deploy this Experiment-2 model was made after all experiments' W_002 results were known, so W_002 is no
longer an unbiased estimate for the deployed choice. A new unseen real worker is needed for that.

The previous V2 candidate (Logistic Regression) and its scaler, registry and frozen config are archived in
`archive/old_model_candidates/logistic_regression_candidate_2026-10-08/`. `predict.py` only loads `scaler.pkl` for a
model whose metadata says `use_scaled: true`.

## 2. Helmet firmware (`ProSafe-Helmet/src/main.cpp`)

* **Sampling.** One sample per second (`SAMPLE_INTERVAL_MS`), each stamped with NTP-synced UTC time
  (`configTime`). Samples are not recorded until the clock is synced. Beat detection and the LM35 filter keep running
  every loop iteration. There is no averaging across samples.
* **Transport.** A ring buffer of 120 samples is uploaded every ~5 s (`UPLOAD_INTERVAL_MS`, at most 30 per request).
  On 2xx the batch is removed. On 4xx it is dropped and logged, because a structurally rejected batch would fail
  forever. On a network error or 5xx it is kept and retried. When the buffer is full the oldest sample is dropped; V2
  then sees a gap.
* **Invalid channels** are sent as `null`, never as `-1` and never as a fabricated value. The DHT11 fallback
  (34.5 °C / 58 %) was removed. So was the "body temperature must exceed ambient by 1.5 °C" contact rule, which
  rejected genuine readings in heat. Skin contact and plausibility are judged by V2.
* **LED.** Blue means UNCERTAIN. It is used at start-up, when the backend sends `UNCERTAIN`, and when no valid command
  has arrived for 30 s (`COMMAND_STALE_AFTER_MS`). The helmet never falls back to green.
  Red/amber/green = CRITICAL/WARNING/SAFE; red = emergency (unchanged).

| Channel | Sent as | Conversion | Status |
|---|---|---|---|
| heartRate | bpm | MAX30102, 4-beat average (unchanged) | as before |
| bodyTemp | °C | LM35 10 mV/°C, EMA (unchanged) | contact delta removed |
| ambientTemp | °C | DHT11 | no fallback. The DHT library caches reads for 2 s, so at 1 Hz the value refreshes every ~2 s |
| noise | dB SPL | INMP441: RMS of 24-bit samples (DC removed) -> dBFS; SPL = 94 + 26 + dBFS (`INMP441_DBFS_AT_94DB_SPL`) | **approximate, unweighted (not dBA), uncalibrated**. Set `NOISE_CAL_OFFSET_DB` against a reference meter |
| uv | UV index (fractional) | GUVA-S12SD: Vout[mV] / 100 (`UV_MV_PER_INDEX`) | module-datasheet approximation |
| gas | V2 "sensor units", **not ppm** | `(adc - GAS_ADC_OFFSET) * GAS_UNITS_PER_ADC_COUNT`, default percent of ADC full scale | **UNVERIFIED.** The training data's gas scale (~4-55) has no documented relation to the MQ-2 ADC. Calibration is a required manual step. Gas *ratio* to the session baseline (V2) is unit-free |

The firmware compiles with PlatformIO (`pio run`). It has **not** been run on hardware in this integration.

## 3. Backend ingestion (`POST /api/helmet/data`)

```json
{"helmetId": "BS-H-001", "samples": [
  {"timestamp": "2026-10-09T03:30:05.123Z", "heartRate": 84, "bodyTemp": 36.71, "ambientTemp": 29.1,
   "noise": 71.4, "gas": 12.31, "uv": 2.63}, ...]}
```

The legacy single-sample body (`{helmetId, timestamp, heartRate, ...}`) is still accepted.

* `validationService.validateHelmetBatch` checks **identity and structure only**: helmetId, optional workerId type,
  samples array (1-600), and a valid timestamp per sample. A non-numeric value or `-1` in a channel becomes `null`;
  out-of-range values are passed through. One bad channel never rejects a sample.
* The worker is resolved from the helmet (unchanged rules). Samples are forwarded **in received order**; the backend
  never reorders. V2 marks late samples `OUT_OF_ORDER_TIMESTAMP`.
* Samples whose (worker, timestamp) is already stored, for example a helmet retry after a lost response, are skipped
  (`duplicatesSkipped`).
* Uploads of the same worker are processed one at a time (in-process queue), because V2 state and smoothing are
  order-dependent.
* Timestamps are sent to V2 in site-local time with an explicit offset (`APP_TIMEZONE`, e.g. `+05:30`), so V2's
  workday (noise-dose day) follows the local calendar.

## 4. Worker baselines (User Management)

* Canonical fields: `User.baselineHeartRate` (bpm) and `User.baselineBodyTemperature` (°C). They apply to the
  **WORKER role only** and have no defaults.
* Create/update validation (`userService.validateBaselines`, mirrored in `frontend/src/utils/validators.js`): both or
  neither; numeric; HR 30-220 bpm and body temperature 30-43 °C (the same plausibility ranges V2 applies to those
  channels). Multipart string values are parsed.
* Both empty is allowed ("not measured yet"). V2 then reports UNCERTAIN / `BASELINE_UNAVAILABLE`, and after 30 s a
  DATA_QUALITY alert ("worker baseline not set") is raised.
* A role change WORKER -> ADMIN clears the baselines (and the helmet). Admin accounts cannot carry baselines.
* Authorization is unchanged: only ADMIN may create or update users (`PUT /api/users/:id`). `PATCH /api/users/me`
  rejects baseline fields, so a worker cannot change their own baseline.
* Migration: none needed. The fields already existed as nullable, and existing users stay valid.
* `baselineService.getWorkerBaseline` returns explicit unavailability (`unavailableReason: WORKER_NOT_FOUND |
  BASELINE_UNAVAILABLE`, null values). A baseline is never partially sent.
* **Baseline change mid-session.** The backend sends the stored baselines with every reading. If they differ from
  the ones the current V2 session was built on (edited or cleared), V2 ends **only that worker's** session
  (`BASELINE_CHANGED`) and starts a new one: 20 samples of `INSUFFICIENT_HISTORY`, no 180-s warm-up. A baseline added
  to a session that had none is adopted in place.
* The gas baseline is **not** a User field. V2 computes it per session (median of the first 180 s, provisional from 20
  samples).

## 5. ProSafe ML V2 service (`serve.py`, port 8001)

| Endpoint | Purpose |
|---|---|
| `GET /health` | `{"status": "ok", "model_name": "XGBoost", "feature_set": "EXTENDED", "feature_count": 38, "model_version", "use_scaled": false, "raw_endpoint_enabled": true}`. HTTP 503 `status: "unhealthy"` + `problems` if the loaded model is not the expected one; both predict endpoints then answer 503 |
| `POST /predict/raw` | production path. `{"readings": [...]}` (max 600), processed in order under a lock |
| `POST /predict` | model-ready path for testing: one 38-feature vector |
| `GET /schema` | feature contract |

Raw reading:
`{worker_id, helmet_id, timestamp, heart_rate, body_temperature, ambient_temperature, uv_index, gas, noise, baseline_hr, baseline_body_temperature}`.
Sensor values and baselines may be null. Baselines are context and never model features.

READY result (one per reading, same order):

```json
{"predicted_class": "WARNING", "probabilities": {"SAFE": 0.04, "WARNING": 0.91, "CRITICAL": 0.05},
 "model_ready": true, "data_quality": "VALID", "model_name": "XGBoost", "feature_set": "EXTENDED",
 "model_version": "prosafe-ml-v2-xgboost-extended-exp2-2026-10-09", "worker_id": "W-001",
 "timestamp": 1791516780.0, "session_id": "W-001:2026-10-09:1:1791516600", "session_elapsed_s": 180.0,
 "imputed_channels": [], "deferred_features": [],
 "derived": {"hr_deviation_pct": 4.1, "body_temp_deviation_pct": 0.2, "noise_critical_exposure_sec": 0, ...}}
```

UNCERTAIN result: `{"predicted_class": "UNCERTAIN", "probabilities": {}, "model_ready": false, "data_quality":
"UNCERTAIN", "uncertain_reason": "SENSOR_WARMUP", "uncertain_reasons": [...], model identity, session fields}`. The
classifier was not called, so there are no probabilities and none are invented.

Gate reasons (V2): `SENSOR_WARMUP` (first 180 s of a cold session), `INSUFFICIENT_HISTORY` (20 samples),
`BASELINE_UNAVAILABLE`, `GAS_BASELINE_UNAVAILABLE`, `MAJOR_TIMESTAMP_GAP`, `PACKET_LOSS`, `OUT_OF_ORDER_TIMESTAMP`,
`BODY_CONTACT_FAILURE`, `SENSOR_UNAVAILABLE`, `TOO_MANY_MISSING_SENSORS`, `UNSTABLE_HR`, `INVALID_PACKET`,
`REQUIRED_FEATURES_UNAVAILABLE`. The warm-up rules are unchanged from the offline framework.

`derived` echoes a few already-computed V2 features so the backend can store and display them without re-implementing
formulas. They are stored in `HelmetData.processed` and never fed back.

**State:** per-worker `WorkerState` lives in the V2 process memory (single process, threaded, one lock). A restart
loses it: every worker re-enters warm-up (UNCERTAIN), and nothing is guessed. `export_state()` / `import_state()`
exist for external persistence, but they are not wired in yet.

## 6. Backend post-processing (`sensorProcessingService`, `predictionService`)

1. **Session sync.** A new V2 `session_id` clears the vote history and the confirmed risk state.
2. **0.70 confidence rule** (unchanged, not re-tuned). A READY prediction whose top probability is below 0.70 is stored
   with its real probabilities but reported as UNCERTAIN / `LOW_CONFIDENCE`. It does not vote.
3. **Smoothing.** Majority vote over the last 5 **accepted** predictions; ties go to the more severe state; UNCERTAIN
   never votes. There is no Critical bypass, unchanged from v1. At 1 Hz, a change becomes the confirmed state about
   3 s after the classifier starts agreeing (3 of 5 votes).
4. **Transitions.** An alert and notifications are raised for every change of the confirmed state, except when SAFE is
   first established in a fresh session (`null -> SAFE`). An elevated first state (`null -> WARNING`) does alert.
5. **Data quality.** `WorkerProcessingState.dataQualityState` = `READY | UNCERTAIN`, with `uncertainReason(s)` and
   `uncertainSince`. If a non-warm-up reason persists for >= 30 s (`DATA_QUALITY_ALERT_AFTER_SECONDS`), one
   `DATA_QUALITY` alert is raised per UNCERTAIN episode, and at most one per worker per 10 min
   (`DATA_QUALITY_ALERT_COOLDOWN_MINUTES`). Admins get a `DATA_QUALITY_ALERT` notification. `SENSOR_WARMUP`,
   `INSUFFICIENT_HISTORY` and `GAS_BASELINE_UNAVAILABLE` alone never alert.
6. **ML unavailable** (not configured, unreachable, timeout, HTTP error, malformed response, wrong model, result count
   mismatch). Every sample is stored as UNCERTAIN / `ML_SERVICE_UNAVAILABLE`; it is **never SAFE**. Raw data is kept.
7. **Operational state** (`operationalStateService`, the one rule every view and the LED use):
   EMERGENCY > a confirmed WARNING/CRITICAL (never hidden by uncertain data; shown with "data uncertain") >
   UNCERTAIN (latest data can't support a decision) > SAFE/WARNING/CRITICAL > UNKNOWN (no state). SAFE is never shown
   while the latest data are UNCERTAIN.
8. **LED command.** `SET_RISK` with SAFE/WARNING/CRITICAL/UNCERTAIN, using the same rule (emergency is handled on the
   helmet). The old "new worker -> SAFE" fallback is gone.

Latency from a sustained change to the LED: up to ~5 s batch upload, plus ~3 s smoothing, plus up to 5 s command
poll. This is on top of the feature windows themselves (10-300 s).

## 7. Storage

| Collection | Change |
|---|---|
| `HelmetData` | one document **per sample**. `raw.*` may be null. `processed` holds the V2 audit features (READY only; same field names as v1 plus `gasRatioToBaseline`, `noiseDosePct`). `prediction` gains `systemState`, `dataQuality`, `uncertainReason(s)`, `modelReady`, `modelName`, `modelVersion`, `featureSet`, `sessionId`, `backstopState`. `probabilities` is null for UNCERTAIN |
| `WorkerProcessingState` | `currentRiskState` is nullable (default null, was SAFE). Adds `dataQualityState`, `uncertainReason(s)`, `uncertainSince`, `dataQualityIssueSince`, `dataQualityAlertedForEpisode`, `lastDataQualityAlertAt`, `lastSessionId`, `lastModelVersion`. The v1 exposure accumulators are no longer in the schema; existing values are left in the documents and not deleted |
| `Alert` | type `DATA_QUALITY` with `dataQualityReason(s)` and `uncertainSince` |
| `HelmetCommand.risk` | allows `UNCERTAIN` |
| `Notification` | type `DATA_QUALITY_ALERT` |

Nothing existing is deleted or migrated. At 1 Hz one worker produces about 28,800 `HelmetData` documents per 8-h shift.
No retention policy was added; deciding one is a data-protection decision for the project owner.

## 8. Frontend

UNCERTAIN is a grey state (`--ps-uncertain`, dashed badge, hatched timeline segments), shown with its reason. It
appears in `StatusBadge` (`RiskBadge`, `OperationalStatus`), `WorkerSafetyCard`, `CurrentConditionCard`, the user
detail page, `HelmetDetailsModal`, `SafetyPredictionModal`, `PredictionTimelineChart`, and the `WorkerStatusSummary`
"Uncertain" bucket. DATA_QUALITY alerts appear in `RecentAlertsCard` (filter, tone), `AlertDetailModal` (reason, since)
and `NotificationBell`. The user Create/Edit form shows baseline inputs for Worker only (cleared when switching to
Admin), and the detail view shows them ("Not set" when null). Gas is labelled "units", never ppm. The backend's
gas display ranges came from the owner's ppm table; they are kept unchanged but labelled as uncalibrated sensor units.

## 9. Retired / kept

* Removed from the decision path: backend `exposureService.js`, `featureVectorService.js`, `mlService.toMlRequestPayload`,
  `runPrediction`, and per-channel range rejection. `deviationService` remains for **display only** (sensor-history
  popups and the safety-guidance attention flag).
* `ProSafe-ML/` (the old service on port 8000) is kept untouched but is no longer called. The V2 `POST /predict`
  model-ready endpoint is kept for testing.

## 10. Configuration and start-up

`ProSafe-Web/backend/config/config.env` (development values):

| Variable | Default | Meaning |
|---|---|---|
| `ML_SERVICE_URL` | `http://localhost:8001` | ProSafe ML V2 |
| `ML_REQUEST_TIMEOUT_MS` | 5000 | per batch |
| `ML_CONFIDENCE_THRESHOLD` | 0.70 | unchanged |
| `ML_EXPECTED_MODEL` / `ML_EXPECTED_FEATURE_SET` / `ML_EXPECTED_FEATURE_COUNT` | XGBoost / EXTENDED / 38 | anything else is refused |
| `PREDICTION_WINDOW_SIZE` | 5 | votes |
| `HELMET_SAMPLE_INTERVAL_SECONDS` / `HELMET_MAX_SAMPLES_PER_BATCH` | 1 / 600 | |
| `DATA_QUALITY_ALERT_AFTER_SECONDS` / `DATA_QUALITY_ALERT_COOLDOWN_MINUTES` | 30 / 10 | |
| `APP_TIMEZONE` | Asia/Colombo | site time sent to V2 |

V2 service environment: `PORT` (8001), `PROSAFE_ENABLE_RAW_ENDPOINT` (1), `PROSAFE_EXPECTED_MODEL` (XGBoost),
`PROSAFE_EXPECTED_FEATURE_SET` (EXTENDED), `PROSAFE_MAX_BATCH` (600).

Start order:

1. `cd ProSafe-ML-V2 && pip install -r requirements.txt && python serve.py`, then check
   `curl http://localhost:8001/health` (expects `"status": "ok"`, XGBoost, EXTENDED, 38).
2. `cd ProSafe-Web/backend && node server.js` (it connects to the database in `config.env` `DB_URI`). On start-up it logs `ProSafe ML V2 OK: XGBoost EXTENDED (38 features) ...` or
   `ProSafe ML V2 NOT READY ...`. In the second case the backend still runs, and every sample is UNCERTAIN.
3. `cd ProSafe-Web/frontend && npm run dev`.
4. Firmware: set the backend URL (and the Wi-Fi settings) in `main.cpp`, then `pio run -t upload`. The helmet needs
   internet access for NTP.

`serve.py` uses Flask's development server. For a real deployment, run it behind a production WSGI server as a
**single process**, because the streaming state is per process.

## 11. Tests

| Where | Command | Covers |
|---|---|---|
| ML-V2 | `python tests/test_production_integration.py` | promoted artifact == exp2 bundle (identical W_002 predictions/probabilities), metadata, 38-feature contract, baselines never features, baseline change/clear/null lifecycle, W_001 raw-replay prediction parity, HTTP contract (health, batch order, out-of-order, null baseline, baseline change, missing channels, bad requests) |
| ML-V2 | `python tests/test_streaming_preprocessor.py`, `python tests/test_preprocessing_parity.py` | streaming rules, gate, online/offline feature parity |
| backend | `npm test` | everything incl. `tests/v2Integration.test.js` (real mlService against a scripted fake V2: request contract, order, duplicates, warm-up, missing baseline + DATA_QUALITY, ML down, wrong model, low confidence, smoothing/session, timeline, guidance, backstop hook) and `tests/userBaselines.test.js` |
| backend, live | `PROSAFE_V2_LIVE_URL=http://127.0.0.1:8001 npx jest tests/liveV2.e2e.test.js` | backend (in-memory MongoDB) -> **running** V2: CRUD with baselines, W_001 replays at 1 Hz, warm-up -> READY, baseline edit restarts the session, missing-baseline worker, elevated (Warning/Critical) segment with transition alerts and LED |
| frontend | `npm test`, `npm run build` | baseline form fields/validation, UNCERTAIN display, existing suites |
| firmware | `pio run` | compiles (no hardware test) |

## 12. Open items

1. **Critical detection** (section 1): validated backstop rules and/or new labelled real workers with diverse Critical
   modes (UV, gas, noise, heat), then retraining and validation on a new unseen worker.
2. **Sensor calibration:** gas scale (unverified), noise (unweighted SPL vs. the training data's dB), UV module gain.
3. Persist V2 `WorkerState` (`export_state`) if the service must survive restarts without a fresh warm-up, and before
   running more than one V2 process.
4. Firmware HTTP calls are synchronous; a slow upload can delay a sample. Moving uploads to a FreeRTOS task would
   remove that.
5. A `HelmetData` retention policy for 1 Hz storage.
