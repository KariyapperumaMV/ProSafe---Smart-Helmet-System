// Central place for every tunable used by the normal-condition processing
// pipeline. Values marked "placeholder" are not specified by logic.docx and
// are not medically authoritative — they exist so behavior is tunable via
// env vars instead of being buried inside the processing algorithm.

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

module.exports = {
  ml: {
    serviceUrl: process.env.ML_SERVICE_URL || "",
    timeoutMs: num(process.env.ML_REQUEST_TIMEOUT_MS, 5000),
    confidenceThreshold: num(process.env.ML_CONFIDENCE_THRESHOLD, 0.7),
  },

  smoothing: {
    windowSize: num(process.env.PREDICTION_WINDOW_SIZE, 5),
  },

  // Placeholder abnormal-condition thresholds that start exposure-duration
  // accumulation (Stage 9). logic.docx gives illustrative examples (e.g. 90dB)
  // but never states an exact trigger value, so these are configurable
  // placeholders, not authoritative safety limits.
  exposure: {
    noiseThresholdDb: num(process.env.EXPOSURE_NOISE_THRESHOLD_DB, 85),
    heartRateDeviationThresholdPct: num(process.env.EXPOSURE_HR_DEVIATION_THRESHOLD_PCT, 20),
    // Assumed seconds between packets, used when a previous packet timestamp
    // isn't available yet (first packet from a worker).
    defaultPacketIntervalSeconds: num(process.env.EXPOSURE_DEFAULT_INTERVAL_SECONDS, 60),
    // Guards against clock skew / backfilled / out-of-order packets producing
    // a huge single-packet exposure jump.
    maxGapSeconds: num(process.env.EXPOSURE_MAX_GAP_SECONDS, 120),
  },

  // Stage 6 backend validation: plausibility bounds for rejecting corrupt
  // sensor values (e.g. "Body temperature = 120°C"). Placeholder ranges,
  // deliberately wider than the firmware's own validation range.
  sensorLimits: {
    heartRate: { min: 20, max: 220 },
    bodyTemp: { min: 25, max: 45 },
    ambientTemp: { min: -20, max: 70 },
    noise: { min: 0, max: 160 },
    gas: { min: 0, max: 10000 },
    uv: { min: 0, max: 15 },
    gpsLat: { min: -90, max: 90 },
    gpsLon: { min: -180, max: 180 },
  },
};
