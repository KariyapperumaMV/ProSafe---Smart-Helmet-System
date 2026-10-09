# ProSafe ML flow before V2 (historical)

> **Superseded on 2026-10-09.** This describes the v1 path as it was *before* the V2 integration (60-s packets, backend-built 10-feature vector, old ML service). The live system now follows `BACKEND_INTEGRATION_V2.md`. Kept for reference only.

This maps exactly where the **currently deployed** ProSafe system does each processing stage. Everything here was
read from the code; nothing in these projects was modified.

Projects inspected:

| Project | Role | Key files |
|---|---|---|
| `ProSafe-Helmet/` | ESP32 firmware | `src/main.cpp` |
| `ProSafe-Web/backend/` | Node/Express backend, MongoDB | `services/sensorProcessingService.js` and the services it calls |
| `ProSafe-ML/` | old ML service (Flask) | `serve.py`, `src/predict.py`, `src/utils.py`, `src/train_models.py`, `app.py` |
| `ProSafe-Web/frontend/` | React dashboard | `components/ui/StatusBadge.jsx`, `components/users/*`, `components/dashboard/*` |

## 1. End-to-end flow today

```
ESP32 helmet (main.cpp)
  readAllSensors()            raw read + on-device filtering + per-sensor valid flags
  validateSensorReadings()    on-device range check (logged only)
  sendNormalPacket()          every 60 s: POST /api/helmet/data
                              {helmetId, timestamp, heartRate, bodyTemp, ambientTemp, noise, gas, uv, gps?}
                              invalid reading -> -1 sentinel
        |
        v
Backend  routes/helmetDataRoutes.js  POST /api/helmet/data -> controllers/helmetDataController.receiveHelmetData
         services/sensorProcessingService.processPacket()  (orchestrator)
  1 validationService.validatePacket()          required + numeric + plausibility range  -> 400 rejects WHOLE packet
  2 baselineService.resolveWorkerId()           helmetId -> workerId (User.helmetId)
  3 baselineService.getWorkerBaseline()         User.baselineHeartRate / baselineBodyTemperature
  4 deviationService.calculatePhysiologicalDeviations()   HR % and body-temp % deviation
  5 exposureService.updateExposureDurations()   noise / HR-deviation accumulators (WorkerProcessingState)
  6 featureVectorService.buildFeatureVector()   internal feature object
  7 mlService.runPrediction()                   toMlRequestPayload() -> POST {ML_SERVICE_URL}/predict
        |
        v
Old ML service  ProSafe-ML/serve.py  POST /predict
  checks the 10 FEATURE_COLUMNS, float-casts
  src/predict.py SafetyPredictor.predict_with_confidence()   XGBoost (no scaling)
  returns {"predicted_class": "SAFE|WARNING|CRITICAL", "probabilities": {...}}
        |
        v
Backend (continued)
  8 predictionService.checkPredictionConfidence()    accept only if max probability >= 0.70
  9 predictionService.updatePredictionHistory()      majority vote of last 5 accepted predictions (ties -> more severe)
 10 predictionService.compareAndUpdateRiskState()    WorkerProcessingState.currentRiskState
 11 alertService.generateAlert() + notificationService   only on a state change
 12 HelmetData.create()                              raw + processed + prediction (+ skippedReason)
 13 helmetCommandService.sendRiskCommand()           LED command SET_RISK SAFE|WARNING|CRITICAL
        |
        v
Frontend  shows WorkerProcessingState.currentRiskState / operationalState, prediction timeline,
          environmental sensor categories (display-only thresholds from config/sensorRanges.js)
```

## 2. Stage-by-stage location map

Legend: **A** = inside backend, **B** = inside ML service, **C** = frontend / demo only,
**D** = nowhere / not implemented, **H** = on the helmet (firmware).

| Stage | Where | Exact implementation | Notes |
|---|---|---|---|
| Raw sensor validation | **H** + **A** | `main.cpp readAllSensors()` sets `mq2Valid`, `ambientTempValid`, `bodyTempValid`, `heartRateValid`, `noiseValid`, `uvIndexValid`; `validateSensorReadings()`. Backend `validationService.validatePacket()` with `config/processingConfig.js sensorLimits` (HR 20-220, body 25-45, ambient -20-70, noise 0-160, gas 0-10000, UV 0-15) | Helmet sends `-1` for an invalid reading; the backend range check then rejects the **entire packet** with HTTP 400. |
| Sensor noise filtering | **H** | LM35 EMA (alpha 0.2), MAX30102 4-beat average + finger detection (IR threshold), DHT11 3 retries | Not repeated in the backend. |
| Missing-value handling | **D** | none | A single invalid sensor discards the whole 60-s packet (nothing stored, no prediction). No imputation anywhere. Firmware substitutes a **fabricated** ambient value (34.5 degC / 58 %RH) after 5 DHT failures and flags it valid (`DHT_FALLBACK_TEMP_C`). |
| Artifact detection | **H** (partial) | finger/contact checks for HR; body temp valid only if 32-45 degC **and** >= 1.5 degC above ambient | The ambient-delta contact rule rejects valid readings whenever ambient is within 1.5 degC of body temperature (~35 degC+), exactly the hot conditions that matter: 486 development rows (1.5 %) would be rejected, **all of them Warning (305) or Critical (181)**. No artifact detection in backend or ML. |
| Worker identification | **A** | `baselineService.resolveWorkerId()` | helmetId -> User.helmetId. |
| Baseline lookup | **A** | `baselineService.getWorkerBaseline()` reads `User.baselineHeartRate`, `User.baselineBodyTemperature` | Missing baseline -> ML skipped (`skippedReason: MISSING_BASELINE`). |
| HR deviation | **A** (+**C** in demo) | `deviationService.calculateDeviation()` -> `(HR-baseline)/baseline*100` | Only the **%** form; no bpm form. The old Streamlit `app.py compute_deviations()` repeats it for the demo. |
| Body-temp deviation | **A** (+**C**) | same function, % only | No degC form. |
| Gas baseline / ratio | **D** | - | Gas is sent as a raw MQ-2 **ADC value 0-4095** (`mq2Value`), but the old model was trained on `gas_ppm` 0-600. No calibration anywhere. |
| Rolling windows / trends | **D** | - | Every prediction uses one 60-s snapshot. |
| Exposure duration | **A** (computed, then dropped) | `exposureService.updateExposureDurations()`: noise >= 85 dB and HR deviation >= 20 % accumulators, elapsed time since last packet (60 s default, 120 s cap), reset on a normal packet, stored in `WorkerProcessingState` | `buildFeatureVector()` includes them, but `mlService.toMlRequestPayload()` **does not send them** to the model. They are stored in `HelmetData.processed` and used by Analytics only. |
| Noise dose | **D** | - | |
| Temporal state | **A** | `models/WorkerProcessingState.js`: exposure accumulators, `predictionHistory` (last 5), `currentRiskState`, `lastPacketAt`, emergency fields | One document per worker. |
| Data-quality / uncertainty | **D** (partly **A**) | No UNCERTAIN output. The backend records `prediction.skippedReason` (WORKER_NOT_FOUND, MISSING_BASELINE, ML errors) and `accepted=false` for low confidence, and keeps the last risk state. | The architecture doc calls a low-confidence cycle "uncertain", but it is never surfaced as a state. |
| Model feature construction | **A** | `featureVectorService.buildFeatureVector()` then `mlService.toMlRequestPayload()` maps to the old names `ambient_temp_c, uv_index, gas_ppm, noise_db, body_temp_c, heart_rate_bpm, baseline_hr_bpm, baseline_body_temp_c, hr_deviation_pct, body_temp_deviation_pct` | Raw baselines are sent as **model features**. |
| Backend -> ML request | **A** -> **B** | `mlService.runPrediction()` POST `{ML_SERVICE_URL}/predict`, JSON of the 10 features, 5 s timeout (`config/config.env ML_SERVICE_URL=http://localhost:8000`) | |
| ML input validation | **B** | `ProSafe-ML/serve.py predict()` 400 if any of the 10 keys is missing or non-numeric | |
| Model inference | **B** | `ProSafe-ML/src/predict.py SafetyPredictor.predict_with_confidence()`; artifacts `models/best_model.pkl` (XGBoost), `best_model_meta.pkl` (`use_scaled: False`), `scaler.pkl`, `label_encoder.pkl`, `all_models_meta.pkl` (stores absolute Windows paths) | |
| ML -> backend response | **B** -> **A** | `{"predicted_class": "SAFE|WARNING|CRITICAL", "probabilities": {"CRITICAL":..,"SAFE":..,"WARNING":..}}` | `mlService.normalizeRiskLabel()` also accepts `risk_level`; anything else -> `ok:false`. |
| Confidence check | **A** | `predictionService.checkPredictionConfidence()`, `ML_CONFIDENCE_THRESHOLD=0.70` | |
| Prediction smoothing | **A** | `predictionService.updatePredictionHistory()` majority vote over `PREDICTION_WINDOW_SIZE=5`, ties -> more severe | The architecture doc's "single high-confidence CRITICAL escalates immediately" rule is **not implemented**. |
| SAFE/WARNING/CRITICAL handling | **A** | `constants/riskStates.js` (only 3 states); `compareAndUpdateRiskState()`; `alertService.generateAlert()`; `helmetCommandService.sendRiskCommand()` | A brand-new worker with no state is sent the **SAFE** LED (`sensorProcessingService` fallback), contradicting the project rule "never convert uncertainty into SAFE". |
| Display | **C** | `StatusBadge.jsx RiskBadge` (SAFE/WARNING/CRITICAL, null -> "Unknown"), `WorkerSafetyCard.jsx` (EMERGENCY/UNKNOWN), `CurrentConditionCard.jsx` (NO_DATA/NO_HELMET/UNKNOWN), `PredictionTimelineChart.jsx` (3 states), `sensorRanges.js` display-only thresholds | No UNCERTAIN state anywhere. |

## 3. Old ML project: training-time preprocessing

| Stage | Where | Notes |
|---|---|---|
| Data | `ProSafe-ML/data/worker_safety_dataset.csv` | 20,000 synthetic rows, 90 workers, 10 features + baseline columns. |
| Split | `src/train_models.py` | **random row-level 80/20 split** and stratified 5-fold CV on rows, so the same workers appear in train and test. |
| Scaling | `train_models.py` | StandardScaler fitted on the training split (only used by SVM/LR). The CV pre-scales the full data (its own comment notes the leak). |
| Labels | `LabelEncoder` | alphabetical Critical/Safe/Warning. |
| Reported score | README | weighted F1 ~0.989 for XGBoost. It is optimistic because it is a within-worker, random-row estimate. |

## 4. Summary: which preprocessing happens where today

* **A - backend:** packet validation, worker resolution, baseline lookup, HR/body-temp **percentage** deviation,
  two exposure accumulators (not sent to the model), feature-vector assembly and renaming, confidence gate,
  5-vote smoothing, risk-state transitions, alerts, LED command.
* **B - ML service:** presence/numeric check of 10 features, model inference, label upper-casing.
* **C - frontend/demo only:** the old Streamlit `app.py` recomputes deviations for its sliders; the frontend
  classifies environmental readings for display only.
* **H - helmet:** sensor filtering (EMA, beat averaging), finger/contact checks, per-sensor valid flags, 60-s packets.
* **D - nowhere:** missing-value imputation, artifact detection beyond firmware contact checks, gas calibration /
  gas baseline, any rolling statistics or trends, noise dose, warning/critical exposure counters per sensor,
  a data-quality state / UNCERTAIN output, and per-second history.

## 5. Facts that constrain V2 integration

1. **Cadence:** packets every 60 s (`PACKET_INTERVAL_MS = 60000`). The V2 features are defined at **1 Hz**
   (30/60/300-s windows, second-level counters). See `BACKEND_INTEGRATION_V2.md`.
2. **Units differ from the V2 training data:** firmware `gas` is a raw ADC count, `noise` is the RMS of raw I2S
   samples (not dB), `uv` is an integer `map(adc, 0, 4095, 0, 15)`. The V2 datasets carry gas around 4-55
   (sensor units, not ppm), noise in dB (54-107), and fractional UV. The firmware must emit the same units as the
   data collection that produced the V2 datasets.
3. **The whole packet is rejected on one bad sensor.** V2 needs per-channel validity instead.
4. **Raw baselines are model features** in the old contract. In V2 they are profile inputs only.
5. **There is no UNCERTAIN** in `constants/riskStates.js`, Mongo enums (`HelmetData.prediction.*State`,
   `Alert.*RiskState`, `HelmetCommand.risk`, `WorkerProcessingState.currentRiskState`), LED mapping or frontend.
