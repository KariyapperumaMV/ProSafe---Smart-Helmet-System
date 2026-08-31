// Analytics/Reports-specific configuration. Kept separate from
// processingConfig.js (ML pipeline) and appConfig.js (general app-wide),
// since these knobs exist purely to tune the Analytics feature.
const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

module.exports = {
  // No project-wide intended value exists for a "significant body
  // temperature deviation" — unlike heart rate (EXPOSURE_HR_DEVIATION_THRESHOLD_PCT,
  // processingConfig.js), nothing in logic.docx, the processing pipeline, or
  // the ProSafe-ML training code (whose README explicitly states the model
  // "learns from deviation rather than fixed thresholds") defines one.
  // Left unconfigured (null) rather than reusing the heart-rate threshold —
  // the two sensors have very different natural deviation scales, so a
  // shared percentage cutoff would be misleading. analyticsService reports
  // significantEvents:null, thresholdConfigured:false for body temperature
  // until an operator explicitly sets this env var.
  bodyTempDeviationThresholdPct:
    process.env.ANALYTICS_BODY_TEMP_DEVIATION_THRESHOLD_PCT !== undefined
      ? num(process.env.ANALYTICS_BODY_TEMP_DEVIATION_THRESHOLD_PCT, null)
      : null,

  // In-process cache TTL for GET /api/analytics results, keyed by
  // period+date(+filters). Single-instance only — a multi-instance
  // deployment would need a distributed cache (e.g. Redis) instead, since
  // each Node process would otherwise serve its own stale copy independently.
  // Not introduced now per the approved Phase A scope.
  cacheTtlMs: num(process.env.ANALYTICS_CACHE_TTL_MS, 3 * 60 * 1000),
};
