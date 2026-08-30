const RISK_STATES = Object.freeze({
  SAFE: "SAFE",
  WARNING: "WARNING",
  CRITICAL: "CRITICAL",
});

// Severity order, least to most severe. Used for tie-breaking during
// prediction smoothing (majority vote ties resolve toward the more severe state).
const RISK_SEVERITY_ORDER = [RISK_STATES.SAFE, RISK_STATES.WARNING, RISK_STATES.CRITICAL];

module.exports = { RISK_STATES, RISK_SEVERITY_ORDER };
