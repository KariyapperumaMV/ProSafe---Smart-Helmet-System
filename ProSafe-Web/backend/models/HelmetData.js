const mongoose = require("mongoose");
const { RISK_STATES, SYSTEM_STATES } = require("../constants/riskStates");

// Stores one 1 Hz helmet sample (a batch upload becomes one document per
// sample, in the order received). `raw` is what the helmet measured -- a
// channel the helmet could not read is null (legacy firmware's -1 sentinel is
// stored as null too) -- and is never mutated by later stages; everything
// derived from it lives under `processed`/`prediction` so the original
// reading is always recoverable.
const helmetDataSchema = new mongoose.Schema({
  helmetId: { type: String, required: true },
  workerId: { type: String, required: true },
  timestamp: { type: Date, required: true },

  raw: {
    heartRate: Number,
    bodyTemp: Number,
    ambientTemp: Number,
    noise: Number,
    gas: Number,
    uv: Number,
    gps: {
      lat: Number,
      lon: Number,
    },
  },

  // Audit copies of features computed by ProSafe ML V2 (the single source of
  // feature truth) for READY samples; null when the sample was UNCERTAIN.
  // The backend never recomputes them. Field names are kept from v1 so
  // analytics keep working; their V2 meaning:
  //   heartRateDeviation        hr_deviation_pct (% vs. personal baseline)
  //   bodyTempDeviation         body_temp_deviation_pct
  //   noiseExposureDuration     noise_critical_exposure_sec (10-s Leq >= 85 dB streak)
  //   heartRateExposureDuration hr_warning_exposure_sec (30-s mean HR deviation >= 20 % streak)
  processed: {
    heartRateDeviation: { type: Number, default: null },
    bodyTempDeviation: { type: Number, default: null },
    noiseExposureDuration: { type: Number, default: null },
    heartRateExposureDuration: { type: Number, default: null },
    gasRatioToBaseline: { type: Number, default: null },
    noiseDosePct: { type: Number, default: null },
  },

  prediction: {
    // True only when the classifier actually ran (V2 quality gate READY).
    ranMl: { type: Boolean, default: false },
    // Legacy field: same value as uncertainReason (kept for older readers).
    skippedReason: { type: String, default: null },
    // Classifier output (only when ranMl). Never filled in for UNCERTAIN samples.
    predictedState: { type: String, enum: [...Object.values(RISK_STATES), null], default: null },
    confidence: { type: Number, default: null },
    // Real classifier probabilities, or null -- never invented for UNCERTAIN.
    probabilities: { type: mongoose.Schema.Types.Mixed, default: null },
    // Prediction passed the confidence rule and entered smoothing.
    accepted: { type: Boolean, default: false },
    smoothedState: { type: String, enum: [...Object.values(RISK_STATES), null], default: null },
    // What the system reported for this sample: SAFE/WARNING/CRITICAL (accepted
    // prediction) or UNCERTAIN (quality gate, low confidence, ML unavailable).
    systemState: { type: String, enum: [...Object.values(SYSTEM_STATES), null], default: null },
    dataQuality: { type: String, enum: ["VALID", "IMPUTED", "UNCERTAIN", null], default: null },
    uncertainReason: { type: String, default: null },
    uncertainReasons: { type: [String], default: undefined },
    modelReady: { type: Boolean, default: false },
    // Set when the deterministic backstop (criticalBackstopService) raised this
    // sample's state; null otherwise (the default: no backstop rules exist).
    backstopState: { type: String, enum: [...Object.values(RISK_STATES), null], default: null },
    modelName: { type: String, default: null },
    modelVersion: { type: String, default: null },
    featureSet: { type: String, default: null },
    sessionId: { type: String, default: null },
  },
}, { timestamps: true });

helmetDataSchema.index({ workerId: 1, timestamp: -1 });
helmetDataSchema.index({ helmetId: 1, timestamp: -1 });
// Admin-wide (no workerId/helmetId filter) date-range aggregations — same
// reasoning as Alert's {timestamp:-1} index. Analytics scans every worker's
// packets within a period, which neither index above covers efficiently.
helmetDataSchema.index({ timestamp: -1 });

module.exports = mongoose.model("HelmetData", helmetDataSchema);
