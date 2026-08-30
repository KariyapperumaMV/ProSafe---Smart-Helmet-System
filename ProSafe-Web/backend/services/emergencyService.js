const WorkerProcessingState = require("../models/WorkerProcessingState");
const Alert = require("../models/Alert");
const { resolveWorkerId } = require("./baselineService");

// Emergency is a request for help, not an ML decision — this file never
// calls baselineService.getWorkerBaseline, deviationService, exposureService,
// featureVectorService, mlService, or predictionService. It reuses
// resolveWorkerId() from Phase 1 (the same helmetId -> workerId resolution
// the normal pipeline uses), but treats ANY resolution failure as a hard
// rejection — unlike normal telemetry, there's no value in recording an
// EMERGENCY alert against an unverified worker identity.
async function resolveWorkerStrict(helmetId, workerId) {
  const resolution = await resolveWorkerId(helmetId, workerId);
  if (!resolution.ok) {
    return { ok: false, status: resolution.status || 404, reason: resolution.reason };
  }
  return { ok: true, workerId: resolution.workerId };
}

// Stage: receive emergency. Idempotent — a retried/duplicate packet while
// emergencyActive is already true never creates a second alert.
async function activateEmergency({ helmetId, workerId: suppliedWorkerId, timestamp, gps }) {
  const resolution = await resolveWorkerStrict(helmetId, suppliedWorkerId);
  if (!resolution.ok) {
    return { ok: false, status: resolution.status, reason: resolution.reason };
  }
  const { workerId } = resolution;
  const location = gps ? { lat: gps.lat, lon: gps.lon } : null;

  let state = await WorkerProcessingState.findOne({ workerId });
  if (!state) {
    state = new WorkerProcessingState({ workerId });
  }

  if (state.emergencyActive) {
    // Duplicate — network retry or a second button press while still active.
    if (location) {
      state.emergencyLocation = location;
      await state.save();
    }
    const existingAlert = await Alert.findOne({ workerId, type: "EMERGENCY", resolved: false }).sort({ timestamp: -1 });
    console.log(`Duplicate emergency packet for worker ${workerId} (helmet ${helmetId}) — emergency already active`);
    return { ok: true, created: false, workerId, alert: existingAlert };
  }

  state.emergencyActive = true;
  state.emergencyStartedAt = timestamp;
  state.emergencyEndedAt = null;
  state.emergencyLocation = location;
  state.resetRequested = false;
  state.resetRequestedAt = null;
  await state.save();

  const alert = await Alert.create({
    type: "EMERGENCY",
    workerId,
    helmetId,
    timestamp,
    location: location || undefined,
    acknowledged: false,
    resolved: false,
  });

  console.log(`Emergency activated for worker ${workerId} (helmet ${helmetId})`);
  return { ok: true, created: true, workerId, alert };
}

// Stage: supervisor requests reset. Never flips emergencyActive off directly
// — the physical helmet still has to receive and confirm it.
async function requestReset(helmetId) {
  const resolution = await resolveWorkerStrict(helmetId, undefined);
  if (!resolution.ok) {
    return { ok: false, status: resolution.status, reason: resolution.reason };
  }

  const state = await WorkerProcessingState.findOne({ workerId: resolution.workerId });
  if (!state || !state.emergencyActive) {
    return { ok: false, status: 409, reason: "NO_ACTIVE_EMERGENCY" };
  }

  if (state.resetRequested) {
    // Supervisor pressed reset twice — idempotent, no duplicate state.
    return { ok: true, alreadyRequested: true, workerId: resolution.workerId };
  }

  state.resetRequested = true;
  state.resetRequestedAt = new Date();
  await state.save();
  console.log(`Reset requested for worker ${resolution.workerId} (helmet ${helmetId})`);
  return { ok: true, alreadyRequested: false, workerId: resolution.workerId };
}

// Stage: helmet polls for reset. Always 200, minimal body — an unknown
// helmet or one with no active emergency both safely report reset: false.
async function getResetStatus(helmetId) {
  const resolution = await resolveWorkerStrict(helmetId, undefined);
  if (!resolution.ok) {
    return { reset: false };
  }
  const state = await WorkerProcessingState.findOne({ workerId: resolution.workerId });
  if (!state) {
    return { reset: false };
  }
  return { reset: Boolean(state.emergencyActive && state.resetRequested) };
}

// Stage: helmet confirms it has locally cleared emergency. Only this call
// finalizes backend state — never a guess based on how long ago reset was
// requested. A duplicate/stale ack (nothing left to clear) is a no-op, not
// an error, since the firmware retries acks until one succeeds.
async function acknowledgeReset(helmetId) {
  const resolution = await resolveWorkerStrict(helmetId, undefined);
  if (!resolution.ok) {
    return { ok: false, status: resolution.status, reason: resolution.reason };
  }

  const state = await WorkerProcessingState.findOne({ workerId: resolution.workerId });
  if (!state || !(state.emergencyActive && state.resetRequested)) {
    return { ok: true, alreadyCleared: true, workerId: resolution.workerId };
  }

  state.emergencyActive = false;
  state.resetRequested = false;
  state.emergencyEndedAt = new Date();
  await state.save();

  await Alert.updateMany(
    { workerId: resolution.workerId, type: "EMERGENCY", resolved: false },
    { resolved: true, acknowledged: true }
  );

  console.log(`Emergency cleared for worker ${resolution.workerId} (helmet ${helmetId})`);
  return { ok: true, alreadyCleared: false, workerId: resolution.workerId };
}

module.exports = { activateEmergency, requestReset, getResetStatus, acknowledgeReset };
