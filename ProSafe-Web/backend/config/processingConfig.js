// Central place for every tunable used by the normal-condition processing
// pipeline. Values marked "placeholder" are not specified by logic.docx and
// are not medically authoritative — they exist so behavior is tunable via
// env vars instead of being buried inside the processing algorithm.
//
// Feature engineering and data-quality gating are NOT configured here: they
// live in ProSafe ML V2 (ProSafe-ML-V2/src/preprocessing.py), the single
// source of feature truth. The backend only validates packet structure,
// forwards samples, and post-processes the V2 decisions.

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

module.exports = {
  ml: {
    // ProSafe ML V2 service (ProSafe-ML-V2/serve.py, default port 8001).
    serviceUrl: process.env.ML_SERVICE_URL || "",
    timeoutMs: num(process.env.ML_REQUEST_TIMEOUT_MS, 5000),
    // Kept from v1 unchanged (not tuned on any test worker). A READY
    // prediction whose top-class probability is below this is stored but
    // reported as UNCERTAIN / LOW_CONFIDENCE and never enters smoothing.
    confidenceThreshold: num(process.env.ML_CONFIDENCE_THRESHOLD, 0.7),
    // The backend refuses predictions from any other model (checked on
    // /health at start-up and on every /predict/raw response).
    expectedModelName: process.env.ML_EXPECTED_MODEL || "XGBoost",
    expectedFeatureSet: process.env.ML_EXPECTED_FEATURE_SET || "EXTENDED",
    expectedFeatureCount: num(process.env.ML_EXPECTED_FEATURE_COUNT, 38),
  },

  smoothing: {
    // Majority vote over the last N ACCEPTED predictions (UNCERTAIN never
    // votes). At 1 Hz this is ~5 s of history; a state change needs 3 of 5
    // votes, i.e. about 3 s after the classifier starts agreeing.
    windowSize: num(process.env.PREDICTION_WINDOW_SIZE, 5),
  },

  ingest: {
    // Helmet sampling period. Used for "expected samples" in reliability
    // analytics; the backend never resamples or averages.
    sampleIntervalSeconds: num(process.env.HELMET_SAMPLE_INTERVAL_SECONDS, 1),
    // Upper bound on samples per upload (the firmware batches ~5 s of 1 Hz
    // samples and keeps unsent ones while offline, up to its ring buffer).
    maxSamplesPerBatch: num(process.env.HELMET_MAX_SAMPLES_PER_BATCH, 600),
  },

  dataQuality: {
    // A DATA_QUALITY alert is raised when a worker stays UNCERTAIN for at
    // least this long for a reason other than normal session warm-up ...
    alertAfterSeconds: num(process.env.DATA_QUALITY_ALERT_AFTER_SECONDS, 30),
    // ... at most once per UNCERTAIN episode and at most once per worker in
    // this many minutes.
    alertCooldownMinutes: num(process.env.DATA_QUALITY_ALERT_COOLDOWN_MINUTES, 10),
  },

  // Display/analytics only (safety guidance "attention" flag and analytics
  // health metric). Not used to build any model feature.
  exposure: {
    heartRateDeviationThresholdPct: num(process.env.EXPOSURE_HR_DEVIATION_THRESHOLD_PCT, 20),
  },

  // GPS plausibility for the optional location fix. Sensor channels are no
  // longer range-checked here: a reading the helmet could not take is sent as
  // null and ProSafe ML V2 applies its own per-channel plausibility rules.
  sensorLimits: {
    gpsLat: { min: -90, max: 90 },
    gpsLon: { min: -180, max: 180 },
  },
};
