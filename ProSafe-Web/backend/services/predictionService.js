const { RISK_SEVERITY_ORDER, SYSTEM_STATES, BACKEND_UNCERTAIN_REASONS } = require("../constants/riskStates");
const { ml: mlConfig, smoothing: smoothingConfig } = require("../config/processingConfig");

// Post-processing of ProSafe ML V2 decisions. Pure functions over an
// in-memory WorkerProcessingState document: sensorProcessingService loads the
// state once per batch, applies these per sample in order, and saves once.

// Stage 12: the 0.70 rule (unchanged from v1, not tuned on any test worker).
// A READY prediction below the threshold is reported UNCERTAIN /
// LOW_CONFIDENCE: it is stored with its real probabilities but never enters
// smoothing and never changes the risk state. UNCERTAIN decisions from V2
// (classifier not called) pass through unchanged.
function applyConfidenceRule(decision) {
  if (decision.systemState === SYSTEM_STATES.UNCERTAIN) {
    return { accepted: false, systemState: SYSTEM_STATES.UNCERTAIN, uncertainReason: decision.uncertainReason };
  }
  const confidence = typeof decision.confidence === "number" ? decision.confidence : 0;
  if (confidence < mlConfig.confidenceThreshold) {
    return { accepted: false, systemState: SYSTEM_STATES.UNCERTAIN, uncertainReason: BACKEND_UNCERTAIN_REASONS.LOW_CONFIDENCE };
  }
  return { accepted: true, systemState: decision.predictedState, uncertainReason: null };
}

// Majority vote over the accepted-prediction window. Ties (e.g. 2 SAFE / 2
// WARNING) resolve toward the more severe state — not specified by
// logic.docx, chosen deliberately for a safety system: prefer a false alarm
// over silently staying at a lower risk state.
function majorityVote(history) {
  const counts = new Map();
  for (const entry of history) {
    counts.set(entry.riskLevel, (counts.get(entry.riskLevel) || 0) + 1);
  }

  let winners = [];
  let maxCount = 0;
  for (const [state, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      winners = [state];
    } else if (count === maxCount) {
      winners.push(state);
    }
  }

  return winners.sort(
    (a, b) => RISK_SEVERITY_ORDER.indexOf(b) - RISK_SEVERITY_ORDER.indexOf(a)
  )[0];
}

// A new ProSafe ML V2 session (gap > 30 min, new workday, helmet or baseline
// change, V2 restart) invalidates the previous session's votes and confirmed
// risk state: they were computed on different windows/baselines. Returns true
// when the session changed.
function syncSession(state, sessionId) {
  if (!sessionId || sessionId === state.lastSessionId) return false;
  state.lastSessionId = sessionId;
  state.predictionHistory = [];
  state.currentRiskState = null;
  return true;
}

// Stage 13: only ever called with an accepted (high-confidence) prediction.
// Maintains a per-worker history, bounded to PREDICTION_WINDOW_SIZE. At 1 Hz
// a 5-vote window is ~5 s; a change needs 3 of 5 votes (~3 s).
function pushAcceptedPrediction(state, { predictedState, confidence, at }) {
  state.predictionHistory.push({ riskLevel: predictedState, confidence, at });
  if (state.predictionHistory.length > smoothingConfig.windowSize) {
    state.predictionHistory = state.predictionHistory.slice(-smoothingConfig.windowSize);
  }
  return majorityVote(state.predictionHistory);
}

// Stage 14: compares the smoothed state against the confirmed state. Only a
// real change is reported as a transition — WARNING -> WARNING never is.
function updateRiskState(state, smoothedState) {
  const previousRiskState = state.currentRiskState || null;
  const changed = previousRiskState !== smoothedState;
  state.currentRiskState = smoothedState;
  return { changed, previousRiskState, currentRiskState: smoothedState };
}

module.exports = { applyConfidenceRule, majorityVote, syncSession, pushAcceptedPrediction, updateRiskState };
