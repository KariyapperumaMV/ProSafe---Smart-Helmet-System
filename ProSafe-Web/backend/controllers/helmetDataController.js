const { processPacket } = require("../services/sensorProcessingService");
const HelmetCommand = require("../models/HelmetCommand");
const { validateEmergencyPacket } = require("../services/validationService");
const emergencyService = require("../services/emergencyService");

// Stays thin: no processing logic here, only request/response translation.
exports.receiveHelmetData = async (req, res, next) => {
  try {
    const { httpStatus, responseBody } = await processPacket(req.body);
    res.status(httpStatus).json(responseBody);
  } catch (err) {
    next(err);
  }
};

// Existing helmet communication mechanism is polling (see the old
// controllers/helmetController.js precedent). Always returns the current
// command, not a one-shot queue entry, so a missed poll is never lost.
exports.getHelmetCommand = async (req, res, next) => {
  try {
    const { helmetId } = req.params;
    const command = await HelmetCommand.findOne({ helmetId });

    if (!command) {
      return res.status(200).json({ command: null });
    }

    res.status(200).json({ command: command.command, risk: command.risk });
  } catch (err) {
    next(err);
  }
};

// Helmet reports the emergency button was pressed. Bypasses the entire
// normal pipeline — no baseline/deviation/exposure/featureVector/ML/prediction
// calls, per the emergency workflow being independent of the ML decision.
exports.receiveEmergency = async (req, res, next) => {
  try {
    const validation = validateEmergencyPacket(req.body);
    if (!validation.valid) {
      return res.status(400).json({ message: "Invalid emergency packet", errors: validation.errors });
    }

    const result = await emergencyService.activateEmergency({
      helmetId: req.body.helmetId,
      workerId: req.body.workerId,
      timestamp: new Date(req.body.timestamp),
      gps: req.body.gps,
    });

    if (!result.ok) {
      return res.status(result.status).json({ message: "Cannot identify worker for this emergency", reason: result.reason });
    }

    res.status(result.created ? 201 : 200).json({
      message: result.created ? "Emergency recorded" : "Emergency already active",
      workerId: result.workerId,
      emergencyActive: true,
      alertId: result.alert ? result.alert._id : null,
    });
  } catch (err) {
    next(err);
  }
};

// Supervisor-facing: requests that an active emergency be reset. Does not
// itself clear emergencyActive — the physical helmet still has to receive
// and acknowledge the reset (see getEmergencyResetStatus / acknowledgeEmergencyReset).
// TODO: protect with supervisor/admin auth middleware once one exists —
// no authentication layer is implemented anywhere in this backend yet.
exports.requestEmergencyReset = async (req, res, next) => {
  try {
    const result = await emergencyService.requestReset(req.params.helmetId);
    if (!result.ok) {
      return res.status(result.status).json({ message: "Cannot request reset", reason: result.reason });
    }
    res.status(200).json({ resetRequested: true, alreadyRequested: result.alreadyRequested });
  } catch (err) {
    next(err);
  }
};

// Helmet-facing: dedicated emergency reset poll, separate from the normal
// SET_RISK command endpoint. Always 200 with a minimal body — safe for an
// unknown helmet or one with no active emergency (both just report false).
exports.getEmergencyResetStatus = async (req, res, next) => {
  try {
    const status = await emergencyService.getResetStatus(req.params.helmetId);
    res.status(200).json(status);
  } catch (err) {
    next(err);
  }
};

// Helmet confirms it has locally cleared emergency after seeing reset:true.
// Only this call finalizes backend state — never a delivery-window guess.
exports.acknowledgeEmergencyReset = async (req, res, next) => {
  try {
    const result = await emergencyService.acknowledgeReset(req.params.helmetId);
    if (!result.ok) {
      return res.status(result.status).json({ message: "Cannot acknowledge reset", reason: result.reason });
    }
    res.status(200).json({ acknowledged: true, alreadyCleared: result.alreadyCleared });
  } catch (err) {
    next(err);
  }
};
