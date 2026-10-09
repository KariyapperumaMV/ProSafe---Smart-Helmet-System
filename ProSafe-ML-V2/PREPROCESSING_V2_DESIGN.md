# ProSafe V2: preprocessing design

ProSafe V2 has two separate components:

```
COMPONENT A  preprocessing / feature engineering        src/preprocessing.py  (rules, primitives, vocabulary)
                                                        src/streaming_preprocessor.py  (per-worker online engine)
  raw 1 Hz observation
   -> sensor-quality checking -> cleaning -> missing-data handling
   -> personalized baseline lookup -> deviations
   -> rolling statistics -> trends -> exposure durations
   -> gas baseline ratio -> noise dose
   -> data-quality decision: READY (VALID | IMPUTED)  or  UNCERTAIN (+reason)
   -> model-ready feature vector

COMPONENT B  ML classification                           src/predict.py SafetyPredictor
  model-ready feature vector -> Safe | Warning | Critical

Glue                                                     src/inference_pipeline.py ProSafeInferencePipeline
  UNCERTAIN -> classifier NOT called -> system output UNCERTAIN
```

**UNCERTAIN is not a fourth class.** The classifier is trained on Safe/Warning/Critical only; its LabelEncoder holds
exactly those three. UNCERTAIN means "not enough trustworthy sensor information to make a reliable risk prediction"
and is produced only by the quality gate. The complete system therefore has four outputs
(SAFE/WARNING/CRITICAL/UNCERTAIN); the classifier has three.

---

## 1. Current vs V2, stage by stage

"Current" refers to the deployed system (`CURRENT_SYSTEM_FLOW.md`). H = helmet firmware, A = backend, B = ML service.

| Stage | Current: exists? where | V2 rule | V2 implementation |
|---|---|---|---|
| Raw sensor validation | Yes: H valid flags; A range check that rejects the **whole** packet | Per-channel plausibility (HR 30-220 bpm, body 30-43 degC, ambient -20-60 degC, UV 0-15, gas >= 0, noise 20-140 dB); `-1` firmware sentinel, `None`, NaN, non-numeric = missing; HR 0 or body < 30 degC = no skin contact. One bad channel never discards the others. | `PreprocessingConfig.channels`, `StreamingPreprocessor._update_channel()` |
| Missing-data handling | **No** (packet rejected) | Causal last-observation-carried-forward (LOCF) for at most `max_hold_s` (HR 3 s, body 10 s, ambient 10 s, UV/gas/noise 5 s), marked **IMPUTED**. Held values feed the model input but are **never pushed into rolling windows**. Beyond the hold limit the channel is unavailable and the result is UNCERTAIN. | `_update_channel()`, `ChannelLimits.max_hold_s` |
| Artifact detection | Partial on H (finger detection, contact delta) | Physiological channels only: a sample further than 40 bpm (HR) / 1.0 degC (body) from the median of the last 5 accepted samples is a suspected artifact, held (IMPUTED) and not learned. Three consecutive self-consistent "jumps" confirm a real level change; those samples are then added to the windows. Environmental channels have **no** jump filter (a sudden gas/noise rise is a hazard, not an artifact). Limits sit above the largest 1-s change in the cleaned development data (29 bpm, 0.29 degC), so clean data passes untouched (0 rejections in the parity replay). | `_update_channel()`, `ChannelState` |
| Worker baseline retrieval | Yes (A, `User.baseline*`) | Same source (backend worker profile). Snapshot taken at session start; if missing it is re-queried each second; until then UNCERTAIN `BASELINE_UNAVAILABLE`. Baselines are **never** model features. | `WorkerProfile`, `BaselineProvider`, `_start_session()` |
| HR deviation | % only (A) | `hr_deviation_bpm = HR - b`, `hr_deviation_pct = (HR - b)/b*100` | `preprocessing.hr_deviation()` |
| Body-temp deviation | % only (A) | `body_temp_deviation_c = BT - b`, `body_temp_deviation_pct = (BT - b)/b*100` | `preprocessing.body_temp_deviation()` |
| Gas baseline | **No** | Per session: median of valid gas samples in the first 180 s of the session. A provisional running median is used from 20 samples on; the value is frozen at 180 s. Optional calibrated override `WorkerProfile.gas_baseline`. | `GasBaselineCalibrator` |
| Gas ratio | **No** | `gas_ratio_to_baseline = gas / session_gas_baseline` | `preprocessing.gas_ratio()` |
| Rolling HR | **No** | mean 30 s (>= 6 samples), mean 60 s (>= 12), std 60 s ddof=1 (>= 12) | `ROLLING_SPECS`, `window_stat()` |
| Rolling body temp | **No** | mean 300 s (>= 60 samples) | `ROLLING_SPECS` |
| Rolling environment | **No** | ambient mean 300 s, UV mean 300 s (>= 60), gas mean 30 s (>= 6), noise mean 60 s (>= 12) | `ROLLING_SPECS` |
| Trends | **No** | Median-split slope: `(median(last k s) - median(first k s of W)) / (W - k) * 60` per minute. W=60, k=20 for HR/gas/noise; W=300, k=100 for body/ambient/UV. Each half needs >= k/2 samples. | `TREND_SPECS`, `median_split_trend()` |
| Exposure durations | Partial (A: noise >= 85 dB and HR dev >= 20 %, never sent to the model) | Twelve counters = consecutive seconds a **smoothed** signal is >= threshold; start at 1 s, +dt while qualifying, reset to 0 otherwise; warning counters keep running above critical. See table 2. | `EXPOSURE_RULES`, `_process()` step 5 |
| Noise dose | **No** | NIOSH REL: 85 dBA criterion, 3 dB exchange, 80 dBA threshold, 8 h; `+100*(dt/60)/(480/2^((L-85)/3))` per valid sample; accumulates per **workday** and survives session breaks. | `niosh_dose_increment_pct()`, `WorkerState.noise_dose_pct` |
| Data-quality / uncertainty | **No** (only `skippedReason`) | VALID / IMPUTED / UNCERTAIN with explicit reasons (section 5). | `PreprocessResult`, gate in `_process()` step 7 |
| Model-ready feature generation | Yes, 10 old columns incl. raw baselines (A) | The 38 V2 features (CORE 26 + 12 exposure counters) in frozen order; deferrable long-window features may be NaN only during warm-up. | `PreprocessResult.features`, `utils.FEATURE_SETS` |

### Table 2: exposure counters (recovered from development data)

| Counter | Smoothed signal (causal, min 1 sample) | Warning | Critical | Per-row state agreement (dev, contiguous) |
|---|---|---|---|---|
| temp | ambient temperature, 30 s mean | >= 30 degC | >= 35 degC | 100 % / 100 % |
| uv | UV index, 10 s mean | >= 3 | >= 8 | 99.99 % / 100 % |
| gas | gas ratio to session baseline, 10 s mean | >= 2.0 | >= 4.0 | 99.99 % / 100 % |
| noise | **Leq** over 10 s, `10*log10(mean(10^(L/10)))` | >= 80 dB | >= 85 dB | 100 % / 100 % |
| hr | HR deviation %, 30 s mean | >= 20 % | >= 40 % | 99.94 % / 100 % |
| body temp | body-temp deviation degC, 60 s mean | >= 0.5 degC | >= 1.0 degC **(ASSUMED: never active in any data)** | 99.99 % / 100 % |

Residual disagreements are threshold-equality float ties (a 30 s mean of exactly 20.000 % etc.).

---

## 2. How the V2 rules were obtained (and kept free of W_002)

The offline pipeline that produced the ML-ready CSVs is not in this repository, so its rules were
**reverse-engineered from the development files** and verified numerically:

* Timestamps are minute-resolution; rows are 1 Hz in file order. Exact second offsets are known only inside full
  60-row minutes, so the fits used contiguous full-minute stretches.
* Rolling means/std: exact (std ddof=1). Trends: an exhaustive search over head/tail sizes and estimators found the
  median-split form exact (mean-split and OLS slopes do not fit).
* Counters: separability search over 10 signals x {mean, median, min, max} x 9 windows, then state-machine simulation.
  Noise matched no arithmetic smoothing; the energy-equivalent level over 10 s matched exactly.
* Noise dose: per-second increments match NIOSH REL to the CSV rounding (max error 9.8e-5); OSHA (90 dBA, 5 dB) is off by 0.49.
* Warm-up / min-sample rules: from NaN runs after session starts (`heart_rate_rolling_mean_30s` available at the 20th
  sample, 300-s means at the 60th, 60-s trends at the 50th, 300-s trends at the 250th sample).

The exploratory pass initially loaded all three files. **Every rule was then re-derived on development workers only**
(S_001-S_004 + W_001) and came out identical. Artifact and stability limits were checked against development
maxima only. W_002 had no influence on any preprocessing rule.

---

## 3. Offline vs online preprocessing

The ML-ready files were produced **offline** over complete recordings. Three offline behaviours are not causal:

| Offline behaviour | Evidence | Why it can't run online as-is | V2 online behaviour |
|---|---|---|---|
| Artifact confirmation / interpolation with a few seconds of look-ahead | stated in the brief; consistent with clean HR in the files | needs future samples | causal hold-and-confirm (section 1); confirmed jumps are added to the windows late |
| Session gas baseline computed retrospectively | afternoon sessions have a gas ratio from their 20th second, but no window of kept samples reproduces the baseline; the offline calibration rows were removed | needs the session's later samples | running median of the first 180 s, provisional from sample 20, frozen at 180 s |
| Temporal features computed over the full stream, then UNCERTAIN rows removed | counters/dose continue across removed rows (e.g. S_001 11:12 missing minute) | the online engine sees exactly what arrives | identical when the data arrives; gaps are bridged (counters <= 120 s) or reset |

### OPTION A (fully causal) vs OPTION B (3-5 s buffering delay)

| | A: fully causal (**implemented**) | B: fixed 3-5 s delay |
|---|---|---|
| Alert latency | none added | +3-5 s on every output, including genuine CRITICAL onsets |
| Artifact handling | suspected spike held (LOCF) immediately; a real step change is accepted after 3 samples (a 2-s lag that applies **only** to abrupt jumps) | spike can be interpolated from both sides, closer to offline |
| Parity with training data | exact for every causal feature (section 7); differs only at artifact points and in the first 180 s gas calibration | marginally closer at artifact points |
| Complexity / state | one-pass, no re-emission | output queue, delayed emission, harder backend semantics |

**Decision: OPTION A.** In a worker-safety system an unconditional delay on every decision costs more than the small
parity gain at rare artifact points. The cleaned training data contained no 1-s HR change above 29 bpm, so the causal
filter changes nothing on data like the training data. Option B could be added later as a `confirmation_delay_s`
output buffer without changing any feature definition.

---

## 4. Per-worker state (`WorkerState`)

```
WorkerState                       (one per worker_id; never shared)
  worker_id
  workday, noise_dose_pct         NIOSH dose for the current workday
  sessions_today, last_session_end_t, last_session_end_reason
  last_t, last_quality
  session: SessionState
     session_id, started_at, cold_start, helmet_id
     baseline_hr, baseline_body_temperature        snapshot from the worker profile
     gas: GasBaselineCalibrator                    samples / provisional / frozen / override
     windows[channel]: TimedWindow                 accepted (t, value) only; 60 s for HR/gas/noise, 300 s for body/ambient/UV
     channels[channel]: ChannelState               last accepted (t, v), pending suspects, artifact counters
     counters[12]: ExposureCounterState            value_s, active
     receipts                                      timestamps of the last 60 s (packet-loss check)
     sample_count, samples_since_gap, gap_refill, last_t
```

* Histories are keyed by `worker_id`; a helmet that changes wearer ends the previous wearer's session.
* `export_state()` / `import_state()` give a JSON-serializable snapshot for a backend state store; the round trip is
  tested to produce byte-identical subsequent outputs.
* Memory per worker: about 6 x 300 floats plus small scalars, a few kB.

---

## 5. Data-quality states and UNCERTAIN

| Result | Meaning | Classifier |
|---|---|---|
| READY / VALID | every model input observed this second | called |
| READY / IMPUTED | at least one raw input briefly held (causal LOCF within hold limits) | called; `imputed_channels` listed |
| UNCERTAIN | reliable features cannot be constructed | **not called** |

UNCERTAIN reasons (all applicable reasons are returned; the first in this priority order is `reason`):

`INVALID_PACKET`, `OUT_OF_ORDER_TIMESTAMP`, `BASELINE_UNAVAILABLE`, `SENSOR_WARMUP`, `INSUFFICIENT_HISTORY`,
`MAJOR_TIMESTAMP_GAP`, `PACKET_LOSS`, `BODY_CONTACT_FAILURE`, `TOO_MANY_MISSING_SENSORS`, `SENSOR_UNAVAILABLE`,
`UNSTABLE_HR` (60-s std > 30 bpm, or 6 unconfirmed HR jumps in a row), `GAS_BASELINE_UNAVAILABLE`,
`REQUIRED_FEATURES_UNAVAILABLE`.

```python
{"status": "UNCERTAIN", "model_ready": False, "quality": "UNCERTAIN",
 "reason": "SENSOR_WARMUP", "reasons": ["SENSOR_WARMUP", "GAS_BASELINE_UNAVAILABLE"], ...}

{"status": "READY", "model_ready": True, "quality": "VALID",
 "features": {...38 values...}, "imputed_channels": [], "deferred_features": [...], ...}
```

An out-of-order or duplicate timestamp is answered UNCERTAIN and **does not change state**.

---

## 6. Start-up, warm-up and session reset

### Warm-up (mirrors the offline framework exactly)

| Condition | Rule | Offline evidence |
|---|---|---|
| Cold start (first session of the workday, or > 4 h since the last session) | UNCERTAIN `SENSOR_WARMUP` for the first 180 s (MQ-2 heater) | every first session's first ML-ready row is exactly session start + 180 s |
| Every session | UNCERTAIN `INSUFFICIENT_HISTORY` until 20 samples | afternoon sessions' first ML-ready row is the 20th second |
| Gas baseline | UNCERTAIN `GAS_BASELINE_UNAVAILABLE` until 20 valid gas samples | |
| After a gap > 10 s | UNCERTAIN `MAJOR_TIMESTAMP_GAP` for 20 samples; `PACKET_LOSS` while < 50 % of the last 60 s arrived | |

**No history is fabricated and nothing is zero-filled.** Features whose windows are not yet filled stay NaN and are
listed in `deferred_features`:

| Deferrable feature | Available from |
|---|---|
| 60-s trends (HR, gas, noise) | 50th sample |
| 300-s means (body, ambient, UV) | 60th sample |
| 300-s trends (body, ambient, UV) | 250th sample |

This is exactly the NaN pattern of the training data. The frozen classifier (logistic regression) fills them inside
its own preprocessing with the training-set median, the same treatment the NaN training rows received. A stricter
policy is one switch away: `PreprocessingConfig(allow_deferrable_missing=False)` keeps the result UNCERTAIN until all
38 features exist (250 s into a session).

### Session reset

| Trigger | Windows, counters, gas baseline | Noise dose |
|---|---|---|
| Gap > 30 min (e.g. lunch) | new session (warm start) | kept: same workday |
| New workday (local date; `workday_boundary_hour` for night shifts) | new session (cold start) | reset to 0 |
| Helmet changes wearer | previous wearer's session ended | kept |
| Same worker on a different helmet | new session (new MQ-2, new gas baseline) | kept |
| Manual `reset_session()` | new session | kept |
| Manual `reset_workday()` | new session | reset |
| Gap 10 s - 30 min | same session; counters bridged if <= 120 s, else restarted; short windows re-filled | kept |

Noise dose is a **workday** quantity (NIOSH daily dose), which is why it alone survives session breaks. The training
data shows the same: the dose is unchanged across the lunch break while every counter restarts.

---

## 7. Parity between online and offline features

`tests/test_preprocessing_parity.py` replays the ML-ready rows through `StreamingPreprocessor` and compares every
feature wherever its full look-back window is inside a contiguous run (last report: `archive/old_outputs/preprocessing_parity_development.md`):

| Family | Rows compared (dev) | Exact match |
|---|---|---|
| raw sensors | 167,257 | 100 % |
| deviations | 111,600 | 100 % |
| gas ratio (session baseline injected) | 27,829 | 100 % |
| rolling means / std | 173,740 | 100 % |
| trends | 120,840 | 100 % |
| noise dose (state restored at 59 s) | 24,900 | 100 % |
| exposure counters (state restored at 59 s) | 298,800 | 99.977 % |

Online artifact rejections on the (clean) development data: **0**.

Known, documented differences:

1. **Gas baseline estimator** cannot be parity-tested (offline calibration rows removed; offline used hindsight).
   The un-seeded end-to-end replay shows ratio differences up to 0.02-0.23 inside a session.
2. **Raw value at a missing second:** offline left the raw feature NaN; online holds the last value (IMPUTED, <= 5 s).
   Rolling statistics agree (both skip the missing sample).
3. **Counters during long sensor dropouts (found post-freeze, on W_002):** in a missing-UV run of 8+ s the offline UV
   counter froze, while every dropout in the development data (<= 6 s) kept counting, and so does the online
   engine. The rule was **not** changed: that would let W_002 shape a preprocessing rule. Online, those seconds are
   UNCERTAIN anyway (UV hold limit 5 s), but the counter value afterwards can differ (up to 404 s in that one case).
   Resolve against the offline pipeline's source code.
4. **Threshold-equality ties** in counters (float rounding at exactly 20.000 % etc.).

---

## 8. Configuration reference

All tunables live in `preprocessing.PreprocessingConfig` (frozen dataclass) plus the rule tables `ROLLING_SPECS`,
`TREND_SPECS`, `EXPOSURE_RULES` and the NIOSH constants. Changing any **feature-defining** rule (windows,
thresholds, estimators, min samples) breaks parity with the training data and requires regenerating the training
features and retraining. Gate-only settings (hold limits, gap limits, packet-loss coverage, warm-up policy) can be tuned
without retraining, on development data only.
