const { RISK_STATES } = require("../constants/riskStates");

// Display-only SAFE/WARNING/CRITICAL classification for the four
// non-personalized environmental sensors, used exclusively by the worker
// sensor-history popups (individual sensor status) and by Analytics'
// environmental breach counts. This is deliberately separate from the ML
// pipeline's currentRiskState — a WARNING here never touches prediction,
// smoothing, alerts, or the helmet LED command. Every classify function
// below is total (covers every finite value, no gaps) and each sensor's
// operators intentionally differ where the source table required it (see
// noise).
//
// Sources as supplied by the project owner's threshold table:
//   ambientTemperature -> OSHA / NIOSH
//   gas                -> NIOSH fire/smoke early warning guidance
//   noise              -> OSHA PEL
//   uv                 -> WHO
//
// THRESHOLDS is the single source of truth for the actual boundary numbers —
// both the JS classify functions below AND getMongoClassifyExpr() (used by
// analyticsService to count warning/critical readings server-side, without
// redefining these numbers a second time) read from this one object.
//   safeBelow        -> value < safeBelow is always SAFE (every sensor uses
//                        a strict "<" at the low end)
//   warningMax        -> the upper WARNING boundary
//   warningInclusive  -> whether `value === warningMax` is still WARNING
//                        (true for ambientTemperature/gas/uv) or already
//                        CRITICAL (false for noise — see note below)
const THRESHOLDS = {
  ambientTemperature: { safeBelow: 27, warningMax: 35, warningInclusive: true }, // <27 safe; <=35 warning; >35 critical
  gas: { safeBelow: 150, warningMax: 300, warningInclusive: true }, // <150 safe; <=300 warning; >300 critical
  // The source table visually shows "Critical: 85-90 dB" (implying a
  // ceiling), but the project owner deliberately chose >=85 => CRITICAL with
  // no upper bound so every valid reading classifies, rather than leaving
  // readings above 90dB unclassified.
  noise: { safeBelow: 80, warningMax: 85, warningInclusive: false }, // <80 safe; <85 warning; >=85 critical
  uv: { safeBelow: 3, warningMax: 8, warningInclusive: true }, // <3 safe; <=8 warning; >8 critical
};

const RANGE_META = {
  ambientTemperature: {
    label: "Ambient Temperature",
    unit: "°C",
    standard: "OSHA / NIOSH",
    displayRanges: {
      safe: { label: "< 27 °C" },
      warning: { label: "27–35 °C" },
      critical: { label: "> 35 °C" },
    },
  },
  gas: {
    label: "Gas (PPM)",
    unit: "ppm",
    standard: "NIOSH fire/smoke early warning guidance",
    displayRanges: {
      safe: { label: "< 150 ppm" },
      warning: { label: "150–300 ppm" },
      critical: { label: "> 300 ppm" },
    },
  },
  noise: {
    label: "Sound Level",
    unit: "dB",
    standard: "OSHA PEL",
    displayRanges: {
      safe: { label: "< 80 dB" },
      warning: { label: "80–85 dB" },
      critical: { label: "≥ 85 dB" },
    },
  },
  uv: {
    label: "UV Light Level",
    unit: "",
    standard: "WHO",
    displayRanges: {
      safe: { label: "< 3" },
      warning: { label: "3–8" },
      critical: { label: "> 8" },
    },
  },
};

function classifyFromThresholds(sensorKey, value) {
  const t = THRESHOLDS[sensorKey];
  if (!t || typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < t.safeBelow) return RISK_STATES.SAFE;
  const stillWarning = t.warningInclusive ? value <= t.warningMax : value < t.warningMax;
  return stillWarning ? RISK_STATES.WARNING : RISK_STATES.CRITICAL;
}

// value < 27       => SAFE
// value <= 35      => WARNING
// otherwise        => CRITICAL
function classifyAmbientTemperature(value) {
  return classifyFromThresholds("ambientTemperature", value);
}

// value < 150      => SAFE
// value <= 300     => WARNING
// otherwise        => CRITICAL
function classifyGas(value) {
  return classifyFromThresholds("gas", value);
}

// value < 80       => SAFE
// value < 85       => WARNING
// otherwise        => CRITICAL
function classifyNoise(value) {
  return classifyFromThresholds("noise", value);
}

// value < 3        => SAFE
// value <= 8       => WARNING
// otherwise        => CRITICAL
function classifyUv(value) {
  return classifyFromThresholds("uv", value);
}

const CLASSIFIERS = {
  ambientTemperature: classifyAmbientTemperature,
  gas: classifyGas,
  noise: classifyNoise,
  uv: classifyUv,
};

// Returns null (not a category) for a missing/non-finite reading rather
// than guessing — "current reading unavailable" is a distinct state from
// any of SAFE/WARNING/CRITICAL.
function classify(sensorKey, value) {
  const classifier = CLASSIFIERS[sensorKey];
  if (!classifier) return null;
  return classifier(value);
}

function getRangeMetadata(sensorKey) {
  return RANGE_META[sensorKey] || null;
}

// Builds a MongoDB aggregation $switch expression classifying `fieldPath`
// (e.g. "$raw.noise") into the same SAFE/WARNING/CRITICAL boundaries as
// classify() above, so Analytics can count warning/critical readings across
// a whole period server-side (no pulling raw packets into Node just to
// classify them) without ever duplicating the threshold numbers. Caller is
// responsible for pre-filtering to numeric values (see analyticsService's
// `{ $type: "number" }` match, same pattern userSensorService already uses)
// — this expression assumes `fieldPath` is already a finite number.
function getMongoClassifyExpr(sensorKey, fieldPath) {
  const t = THRESHOLDS[sensorKey];
  if (!t) return null;
  const warnOperator = t.warningInclusive ? "$lte" : "$lt";
  return {
    $switch: {
      branches: [
        { case: { $lt: [fieldPath, t.safeBelow] }, then: RISK_STATES.SAFE },
        { case: { [warnOperator]: [fieldPath, t.warningMax] }, then: RISK_STATES.WARNING },
      ],
      default: RISK_STATES.CRITICAL,
    },
  };
}

module.exports = {
  classify,
  getRangeMetadata,
  getMongoClassifyExpr,
  classifyAmbientTemperature,
  classifyGas,
  classifyNoise,
  classifyUv,
};
