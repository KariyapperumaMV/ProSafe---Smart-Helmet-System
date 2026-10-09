const RISK_STATES = Object.freeze({
  SAFE: "SAFE",
  WARNING: "WARNING",
  CRITICAL: "CRITICAL",
});

// Severity order, least to most severe. Used for tie-breaking during
// prediction smoothing (majority vote ties resolve toward the more severe state).
const RISK_SEVERITY_ORDER = [RISK_STATES.SAFE, RISK_STATES.WARNING, RISK_STATES.CRITICAL];

// What the system reports per sample. UNCERTAIN is NOT a fourth risk class:
// it means "no trustworthy risk decision for this sample" (data-quality gate
// in ProSafe ML V2, low classifier confidence, or the ML service being down).
// It is never translated to SAFE anywhere in the backend.
const SYSTEM_STATES = Object.freeze({
  ...RISK_STATES,
  UNCERTAIN: "UNCERTAIN",
});

// Reasons produced by the backend itself. ProSafe ML V2 adds its own
// data-quality reasons (SENSOR_WARMUP, BASELINE_UNAVAILABLE, PACKET_LOSS, ...),
// which are stored verbatim.
const BACKEND_UNCERTAIN_REASONS = Object.freeze({
  ML_SERVICE_UNAVAILABLE: "ML_SERVICE_UNAVAILABLE",
  LOW_CONFIDENCE: "LOW_CONFIDENCE",
  WORKER_NOT_FOUND: "WORKER_NOT_FOUND",
});

// Expected start-of-session UNCERTAIN reasons: a fresh session always passes
// through them, so they never raise a DATA_QUALITY alert on their own.
const WARMUP_UNCERTAIN_REASONS = Object.freeze([
  "SENSOR_WARMUP",
  "INSUFFICIENT_HISTORY",
  "GAS_BASELINE_UNAVAILABLE",
]);

module.exports = {
  RISK_STATES,
  RISK_SEVERITY_ORDER,
  SYSTEM_STATES,
  BACKEND_UNCERTAIN_REASONS,
  WARMUP_UNCERTAIN_REASONS,
};
