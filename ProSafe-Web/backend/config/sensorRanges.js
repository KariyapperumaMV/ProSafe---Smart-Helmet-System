const { RISK_STATES } = require("../constants/riskStates");

// Display-only SAFE/WARNING/CRITICAL classification for the four
// non-personalized environmental sensors, used exclusively by the worker
// sensor-history popups (individual sensor status). This is deliberately
// separate from the ML pipeline's currentRiskState — a WARNING here never
// touches prediction, smoothing, alerts, or the helmet LED command. See
// each classify function below for the exact (project-supplied, sourced)
// boundary semantics — every function is total (covers every finite value,
// no gaps) and each sensor's operators intentionally differ where the
// source table required it (see noise).
//
// Sources as supplied by the project owner's threshold table:
//   ambientTemperature -> OSHA / NIOSH
//   gas                -> NIOSH fire/smoke early warning guidance
//   noise              -> OSHA PEL
//   uv                 -> WHO

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

// value < 27       => SAFE
// value <= 35      => WARNING
// otherwise        => CRITICAL
function classifyAmbientTemperature(value) {
  if (value < 27) return RISK_STATES.SAFE;
  if (value <= 35) return RISK_STATES.WARNING;
  return RISK_STATES.CRITICAL;
}

// value < 150      => SAFE
// value <= 300     => WARNING
// otherwise        => CRITICAL
function classifyGas(value) {
  if (value < 150) return RISK_STATES.SAFE;
  if (value <= 300) return RISK_STATES.WARNING;
  return RISK_STATES.CRITICAL;
}

// value < 80       => SAFE
// value < 85       => WARNING
// otherwise        => CRITICAL
//
// The source table visually shows "Critical: 85-90 dB" (implying a ceiling),
// but the project owner deliberately chose >=85 => CRITICAL with no upper
// bound so every valid reading classifies, rather than leaving readings
// above 90dB unclassified.
function classifyNoise(value) {
  if (value < 80) return RISK_STATES.SAFE;
  if (value < 85) return RISK_STATES.WARNING;
  return RISK_STATES.CRITICAL;
}

// value < 3        => SAFE
// value <= 8       => WARNING
// otherwise        => CRITICAL
function classifyUv(value) {
  if (value < 3) return RISK_STATES.SAFE;
  if (value <= 8) return RISK_STATES.WARNING;
  return RISK_STATES.CRITICAL;
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
  if (!classifier || typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return classifier(value);
}

function getRangeMetadata(sensorKey) {
  return RANGE_META[sensorKey] || null;
}

module.exports = {
  classify,
  getRangeMetadata,
  classifyAmbientTemperature,
  classifyGas,
  classifyNoise,
  classifyUv,
};
