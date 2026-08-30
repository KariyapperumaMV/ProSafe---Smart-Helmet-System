const mongoose = require("mongoose");
const { RISK_STATES } = require("../constants/riskStates");

// One document per worker. This is the durable replacement for "a local
// variable in the controller" — exposure accumulators, accepted-prediction
// history, and the current risk state all have to survive across requests
// and server restarts, so they live here instead of in memory.
const exposureTrackerSchema = new mongoose.Schema({
  accumulatedSeconds: { type: Number, default: 0 },
  active: { type: Boolean, default: false },
}, { _id: false });

const workerProcessingStateSchema = new mongoose.Schema({
  workerId: { type: String, required: true, unique: true },

  currentRiskState: {
    type: String,
    enum: Object.values(RISK_STATES),
    default: RISK_STATES.SAFE,
  },

  noiseExposure: { type: exposureTrackerSchema, default: () => ({}) },
  heartRateExposure: { type: exposureTrackerSchema, default: () => ({}) },

  // Bounded to processingConfig.smoothing.windowSize by predictionService
  // whenever it pushes a new accepted prediction (oldest entries drop off).
  predictionHistory: [{
    riskLevel: { type: String, enum: Object.values(RISK_STATES) },
    confidence: Number,
    at: { type: Date, default: Date.now },
    _id: false,
  }],

  lastPacketAt: { type: Date, default: null },

  // Emergency state — deliberately separate from currentRiskState (never
  // "EMERGENCY" as a risk value). The normal ML pipeline (sensorProcessingService,
  // predictionService) never reads or writes any of these fields, so an
  // accepted ML prediction can update currentRiskState in the background
  // without ever touching emergencyActive.
  emergencyActive: { type: Boolean, default: false },
  emergencyStartedAt: { type: Date, default: null },
  emergencyEndedAt: { type: Date, default: null },
  emergencyLocation: {
    lat: { type: Number, default: null },
    lon: { type: Number, default: null },
  },
  // Supervisor's request to end the emergency. Kept false->true->false rather
  // than deleting the emergency fields outright, so the reset-poll/ack
  // endpoints have something durable to check across requests.
  resetRequested: { type: Boolean, default: false },
  resetRequestedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model("WorkerProcessingState", workerProcessingStateSchema);
