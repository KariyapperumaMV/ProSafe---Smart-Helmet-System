const HelmetCommand = require("../models/HelmetCommand");
const { RISK_STATES } = require("../constants/riskStates");

// Stage 17: the helmet never decides its own LED color — this is the single
// place that maps a backend risk state to a helmet command. Upserts one
// "current command" document per helmet so a missed poll just picks up the
// same command next time (see models/HelmetCommand.js).
const RISK_TO_LED = {
  [RISK_STATES.SAFE]: "SAFE",
  [RISK_STATES.WARNING]: "WARNING",
  [RISK_STATES.CRITICAL]: "CRITICAL",
};

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

module.exports = { sendRiskCommand };
