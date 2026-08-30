const mongoose = require("mongoose");
const { RISK_STATES } = require("../constants/riskStates");

// Stores one processed sensor packet. `raw` is exactly what the helmet sent
// (Stage 5) and is never mutated by later stages; everything derived from it
// lives under `processed`/`prediction` so the original reading is always
// recoverable.
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

  processed: {
    heartRateDeviation: { type: Number, default: null },
    bodyTempDeviation: { type: Number, default: null },
    noiseExposureDuration: { type: Number, default: null },
    heartRateExposureDuration: { type: Number, default: null },
  },

  prediction: {
    ranMl: { type: Boolean, default: false },
    skippedReason: { type: String, default: null }, // e.g. "MISSING_BASELINE", "ML_UNAVAILABLE"
    predictedState: { type: String, enum: [...Object.values(RISK_STATES), null], default: null },
    confidence: { type: Number, default: null },
    probabilities: { type: mongoose.Schema.Types.Mixed, default: null },
    accepted: { type: Boolean, default: false },
    smoothedState: { type: String, enum: [...Object.values(RISK_STATES), null], default: null },
  },
}, { timestamps: true });

helmetDataSchema.index({ workerId: 1, timestamp: -1 });
helmetDataSchema.index({ helmetId: 1, timestamp: -1 });

module.exports = mongoose.model("HelmetData", helmetDataSchema);
