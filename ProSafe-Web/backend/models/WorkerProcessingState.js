const mongoose = require("mongoose");
const { RISK_STATES, SYSTEM_STATES } = require("../constants/riskStates");

// One document per worker: the backend's post-processing state (smoothing
// history, confirmed risk state, data-quality episode, emergency) that has to
// survive across requests and server restarts. Feature state (rolling windows,
// exposure counters, session gas baseline) lives in ProSafe ML V2's per-worker
// WorkerState, not here. (Documents written by the v1 pipeline may still carry
// its old noiseExposure/heartRateExposure accumulators; they are left in place
// and simply no longer read.)
const workerProcessingStateSchema = new mongoose.Schema({
  workerId: { type: String, required: true, unique: true },

  // Confirmed (smoothed) risk state of the current ProSafe ML V2 session.
  // null = not established yet (new worker, new session, warm-up) -- never
  // defaulted to SAFE. Cleared whenever V2 starts a new session.
  currentRiskState: {
    type: String,
    enum: [...Object.values(RISK_STATES), null],
    default: null,
  },

  // Latest sample's quality: "READY" (a prediction was accepted) or
  // "UNCERTAIN" (no trustworthy decision for the latest sample).
  dataQualityState: { type: String, enum: ["READY", SYSTEM_STATES.UNCERTAIN, null], default: null },
  uncertainReason: { type: String, default: null },
  uncertainReasons: { type: [String], default: undefined },
  uncertainSince: { type: Date, default: null }, // start of the current UNCERTAIN episode
  // First sample of the episode with a non-warm-up reason (DATA_QUALITY alert timing).
  dataQualityIssueSince: { type: Date, default: null },
  dataQualityAlertedForEpisode: { type: Boolean, default: false },
  lastDataQualityAlertAt: { type: Date, default: null },

  // ProSafe ML V2 session the prediction history belongs to; a new session
  // (gap > 30 min, new workday, helmet/baseline change, V2 restart) clears
  // the history and the confirmed risk state.
  lastSessionId: { type: String, default: null },
  lastModelVersion: { type: String, default: null },

  // Bounded to processingConfig.smoothing.windowSize by predictionService
  // whenever it pushes a new accepted prediction (oldest entries drop off).
  // Only accepted SAFE/WARNING/CRITICAL predictions enter -- never UNCERTAIN.
  predictionHistory: [{
    riskLevel: { type: String, enum: Object.values(RISK_STATES) },
    confidence: Number,
    at: { type: Date, default: Date.now },
    _id: false,
  }],

  // Timestamp of the latest sample processed for this worker.
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
