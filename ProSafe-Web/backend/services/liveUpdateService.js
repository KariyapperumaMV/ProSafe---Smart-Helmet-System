const WorkerProcessingState = require("../models/WorkerProcessingState");
const notificationStream = require("./notificationStream");
const { statusFields } = require("./operationalStateService");

// Live "something changed for this worker" events over the existing SSE
// stream (GET /api/notifications/stream). Sent after every processed helmet
// upload (one event per batch, carrying every sample of the batch) and on
// emergency activation/resolution. Delivered to the worker and to admins
// only (notificationStream.publishWorkerUpdate).
//
// Contents are operational data only — worker/helmet IDs, status, sensor
// values, per-sample decisions. No name, email, NIC, phone or baselines.
//
// Clients treat these events as hints on top of REST: they still load
// history/current state over REST and refetch after a reconnect, so a
// missed event is never permanent (see frontend hooks/useLiveWorkerUpdates).

function sensorsOf(raw) {
  if (!raw) return null;
  return {
    heartRate: raw.heartRate ?? null,
    bodyTemp: raw.bodyTemp ?? null,
    ambientTemp: raw.ambientTemp ?? null,
    noise: raw.noise ?? null,
    gas: raw.gas ?? null,
    uv: raw.uv ?? null,
  };
}

// Same per-sample state the prediction timeline uses: the confirmed
// (smoothed) state for an accepted prediction, UNCERTAIN otherwise.
function trendPoint(doc) {
  const p = doc.prediction || {};
  const uncertain = !p.accepted;
  return {
    timestamp: doc.timestamp,
    state: uncertain ? "UNCERTAIN" : p.smoothedState,
    systemState: p.systemState ?? null,
    confidence: uncertain ? null : p.confidence ?? null,
    dataQuality: p.dataQuality ?? null,
    uncertainReason: uncertain ? p.uncertainReason ?? null : null,
  };
}

function buildWorkerUpdate({ workerId, helmetId, state, docs = [], ledState = null }) {
  const latestDoc = docs.length ? docs[docs.length - 1] : null;
  const latestPrediction = latestDoc ? latestDoc.prediction || {} : null;
  return {
    kind: "WORKER_UPDATE",
    workerId,
    helmetId: helmetId || null,
    sentAt: new Date().toISOString(),
    status: statusFields(state),
    ledState,
    latest: latestDoc
      ? {
          timestamp: latestDoc.timestamp,
          systemState: latestPrediction.systemState ?? null,
          predictedState: latestPrediction.predictedState ?? null,
          smoothedState: latestPrediction.smoothedState ?? null,
          confidence: latestPrediction.confidence ?? null,
          accepted: Boolean(latestPrediction.accepted),
          dataQuality: latestPrediction.dataQuality ?? null,
          uncertainReason: latestPrediction.uncertainReason ?? null,
          sensors: sensorsOf(latestDoc.raw),
        }
      : null,
    points: docs.map(trendPoint),
  };
}

// Never throws: a live update is a convenience on top of persisted data and
// must not be able to fail packet processing.
function publishWorkerUpdate(args) {
  try {
    return notificationStream.publishWorkerUpdate(args.workerId, buildWorkerUpdate(args));
  } catch (err) {
    console.error("Live worker update failed (non-fatal):", { workerId: args.workerId, error: err.message });
    return 0;
  }
}

// Status-only update (e.g. emergency activated/resolved), read from the
// persisted processing state.
async function publishWorkerStatus(workerId, helmetId) {
  try {
    const state = await WorkerProcessingState.findOne({ workerId }).lean();
    return publishWorkerUpdate({ workerId, helmetId, state });
  } catch (err) {
    console.error("Live worker status update failed (non-fatal):", { workerId, error: err.message });
    return 0;
  }
}

module.exports = { buildWorkerUpdate, publishWorkerUpdate, publishWorkerStatus, trendPoint };
