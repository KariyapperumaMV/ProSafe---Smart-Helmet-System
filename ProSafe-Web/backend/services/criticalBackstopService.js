// Integration point for a deterministic Critical backstop next to the ML
// classifier. The promoted model (XGBoost EXTENDED, Experiment 2) detected
// only 23 of 260 Critical seconds of the external test worker W_002 (the
// missed seconds were predicted Warning, none Safe), so an independent,
// validated rule set may be needed alongside it.
//
// Intentionally a no-op: NO thresholds are defined here. Any rule added later
// must be validated on its own (not tuned on W_002) and documented.
//
// evaluate() is called once per sample by sensorProcessingService, after the
// V2 decision and the confidence rule. Return null (no opinion) or a risk
// state (e.g. "CRITICAL"). A non-null result that is more severe than the
// sample's own decision is stored as that sample's system state (flagged
// prediction.backstopState) and enters smoothing like an accepted prediction.
// `sample` is { timestamp, raw }; `decision` is the normalized V2 result, whose
// `derived` field carries the V2 exposure counters when the gate was READY.
function evaluate(/* sample, decision */) {
  return null;
}

module.exports = { evaluate };
