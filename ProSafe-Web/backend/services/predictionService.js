const WorkerProcessingState = require("../models/WorkerProcessingState");
const { RISK_SEVERITY_ORDER } = require("../constants/riskStates");
const { ml: mlConfig, smoothing: smoothingConfig } = require("../config/processingConfig");

// Stage 12: a low-confidence prediction never touches history or state.
function checkPredictionConfidence(mlResult) {
  const confidence = typeof mlResult.confidence === "number" ? mlResult.confidence : 0;
  const accepted = confidence >= mlConfig.confidenceThreshold;
  return { accepted, predictedState: mlResult.predictedState, confidence };
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

// Stage 13: only ever called with an accepted (high-confidence) prediction.
// Maintains a per-worker history, bounded to PREDICTION_WINDOW_SIZE.
async function updatePredictionHistory(workerId, { predictedState, confidence }) {
  let state = await WorkerProcessingState.findOne({ workerId });
  if (!state) {
    state = new WorkerProcessingState({ workerId });
  }

  state.predictionHistory.push({ riskLevel: predictedState, confidence, at: new Date() });
  if (state.predictionHistory.length > smoothingConfig.windowSize) {
    state.predictionHistory = state.predictionHistory.slice(-smoothingConfig.windowSize);
  }

  const smoothedState = majorityVote(state.predictionHistory);
  await state.save();

  return smoothedState;
}

// Stage 14: compares the smoothed state against the worker's last saved
// state and persists the new one. Only a real change is reported as a
// transition — WARNING -> WARNING never generates one.
async function compareAndUpdateRiskState(workerId, smoothedState) {
  let state = await WorkerProcessingState.findOne({ workerId });
  if (!state) {
    state = new WorkerProcessingState({ workerId });
  }

  const previousRiskState = state.currentRiskState;
  const changed = previousRiskState !== smoothedState;

  state.currentRiskState = smoothedState;
  await state.save();

  return { changed, previousRiskState, currentRiskState: smoothedState };
}

module.exports = { checkPredictionConfidence, updatePredictionHistory, compareAndUpdateRiskState };
