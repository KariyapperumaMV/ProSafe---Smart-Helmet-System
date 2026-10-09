const HelmetCommand = require("../models/HelmetCommand");
const { SYSTEM_STATES } = require("../constants/riskStates");
const { computeOperationalState } = require("./operationalStateService");

// Stage 17: the helmet never decides its own LED color — this is the single
// place that maps a backend state to a helmet command. Upserts one
// "current command" document per helmet so a missed poll just picks up the
// same command next time (see models/HelmetCommand.js).
//
// UNCERTAIN (blue on the helmet) means "no trustworthy risk decision right
// now" — warm-up, missing baseline, sensor contact lost, ML service down.
// It is never mapped to SAFE (green).
const RISK_TO_LED = {
  [SYSTEM_STATES.SAFE]: "SAFE",
  [SYSTEM_STATES.WARNING]: "WARNING",
  [SYSTEM_STATES.CRITICAL]: "CRITICAL",
  [SYSTEM_STATES.UNCERTAIN]: "UNCERTAIN",
};

// LED state for a worker's processing state. Emergency is handled on the
// helmet itself (button latch, red), so the SET_RISK command keeps carrying
// the background risk display; "nothing established yet" is UNCERTAIN.
function ledStateFor(state) {
  const op = computeOperationalState(state ? { ...(state.toObject ? state.toObject() : state), emergencyActive: false } : null);
  return RISK_TO_LED[op] ? op : SYSTEM_STATES.UNCERTAIN;
}

async function sendRiskCommand(helmetId, riskState) {
  const led = RISK_TO_LED[riskState];
  if (!led) {
    throw new Error(`Unknown risk state for LED mapping: ${riskState}`);
  }

  return HelmetCommand.findOneAndUpdate(
    { helmetId },
    { command: "SET_RISK", risk: riskState },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

module.exports = { sendRiskCommand, ledStateFor };
