const mongoose = require("mongoose");
const { RISK_STATES } = require("../constants/riskStates");

// One alert per accepted risk-state transition (Stage 15), or per emergency
// activation. Carries enough of a snapshot to reconstruct the event without
// joining back to HelmetData/WorkerProcessingState.
const alertSchema = new mongoose.Schema({
  type: { type: String, enum: ["TRANSITION", "EMERGENCY"], default: "TRANSITION" },

  workerId: { type: String, required: true },
  helmetId: { type: String, required: true },
  timestamp: { type: Date, required: true },

  // Only meaningful for type: "TRANSITION" — an EMERGENCY alert has no risk
  // transition, so these aren't required.
  previousRiskState: { type: String, enum: Object.values(RISK_STATES), default: null },
  currentRiskState: { type: String, enum: Object.values(RISK_STATES), default: null },
  confidence: { type: Number, default: null },

  sensorSnapshot: {
    heartRate: Number,
    bodyTemp: Number,
    ambientTemp: Number,
    noise: Number,
    gas: Number,
    uv: Number,
  },

  location: {
    lat: Number,
    lon: Number,
  },

  acknowledged: { type: Boolean, default: false },
  // First-acknowledgement-wins audit trail — set only the first time
  // acknowledged flips false->true, never overwritten by a later idempotent
  // call (see alertService.acknowledgeAlert).
  acknowledgedAt: { type: Date, default: null },
  acknowledgedBy: { type: String, default: null },
  resolved: { type: Boolean, default: false },
}, { timestamps: true });

alertSchema.index({ workerId: 1, timestamp: -1 });
alertSchema.index({ resolved: 1, acknowledged: 1 });
// Admin-wide (no workerId filter) recent/filtered alert queries — new access
// pattern introduced by the dashboard's Recent Alerts filtering/pagination.
alertSchema.index({ timestamp: -1 });

module.exports = mongoose.model("Alert", alertSchema);
