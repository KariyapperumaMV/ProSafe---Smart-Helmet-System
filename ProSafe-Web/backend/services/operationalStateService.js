const { RISK_STATES, SYSTEM_STATES } = require("../constants/riskStates");

// The one rule every view (dashboard counts, worker dashboard, location map,
// user detail, helmet details, safety guidance) and the helmet LED use to turn
// a WorkerProcessingState into what is shown:
//
//   EMERGENCY                       emergency button state always wins
//   WARNING / CRITICAL              a confirmed elevated risk is never downgraded by
//                                   missing/uncertain data: it stays shown (flagged
//                                   dataUncertain) until a valid prediction replaces it
//   UNCERTAIN                       latest samples are UNCERTAIN and no elevated risk is
//                                   confirmed -> never SAFE without trustworthy data
//   SAFE / WARNING / CRITICAL       confirmed (smoothed) risk state of the current session
//   UNKNOWN                         no processing state / nothing established yet
function computeOperationalState(state) {
  if (!state) return "UNKNOWN";
  if (state.emergencyActive) return "EMERGENCY";
  const risk = state.currentRiskState || null;
  const uncertain = state.dataQualityState === SYSTEM_STATES.UNCERTAIN;
  if (uncertain) {
    return risk === RISK_STATES.WARNING || risk === RISK_STATES.CRITICAL ? risk : SYSTEM_STATES.UNCERTAIN;
  }
  return risk || "UNKNOWN";
}

// The risk state that may be acted on / displayed as a risk (null when the
// current data cannot support one) — used where a view needs "the ML risk
// state" rather than the combined operational state.
function effectiveRiskState(state) {
  const op = computeOperationalState(state);
  return op === RISK_STATES.SAFE || op === RISK_STATES.WARNING || op === RISK_STATES.CRITICAL ? op : null;
}

// Fields every status payload carries alongside the operational state, so the
// frontend can show "Uncertain - <reason>" without re-deriving anything.
function statusFields(state) {
  return {
    operationalState: computeOperationalState(state),
    currentRiskState: state ? state.currentRiskState || null : null,
    emergencyActive: state ? Boolean(state.emergencyActive) : false,
    dataQualityState: state ? state.dataQualityState || null : null,
    dataUncertain: Boolean(state && state.dataQualityState === SYSTEM_STATES.UNCERTAIN),
    uncertainReason: state && state.dataQualityState === SYSTEM_STATES.UNCERTAIN ? state.uncertainReason || null : null,
    uncertainSince: state && state.dataQualityState === SYSTEM_STATES.UNCERTAIN ? state.uncertainSince || null : null,
  };
}

// Projection of the WorkerProcessingState fields the rule above needs.
const STATUS_PROJECTION = "workerId currentRiskState emergencyActive dataQualityState uncertainReason uncertainSince";

module.exports = { computeOperationalState, effectiveRiskState, statusFields, STATUS_PROJECTION };
