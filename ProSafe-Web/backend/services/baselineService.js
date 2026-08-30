const Worker = require("../models/Worker");

// Stage 7: retrieve the worker's baseline. Never invents a baseline — a
// worker that exists but has no recorded baseline yet returns
// hasBaseline: false, which downstream stages must handle explicitly.
async function getWorkerBaseline(workerId) {
  const worker = await Worker.findOne({ workerId });

  if (!worker) {
    return { found: false, hasBaseline: false, baselineHeartRate: null, baselineBodyTemperature: null };
  }

  const hasBaseline =
    typeof worker.baselineHeartRate === "number" &&
    worker.baselineHeartRate > 0 &&
    typeof worker.baselineBodyTemperature === "number" &&
    worker.baselineBodyTemperature > 0;

  return {
    found: true,
    hasBaseline,
    baselineHeartRate: worker.baselineHeartRate,
    baselineBodyTemperature: worker.baselineBodyTemperature,
  };
}

// Real helmet packets don't carry workerId, so it has to be resolved from
// helmetId. If a workerId IS supplied, it must actually be the worker
// assigned to that helmet — otherwise a misconfigured/malicious packet could
// attribute readings to the wrong person.
//
// - workerId supplied, no matching Worker: degrade (not reject) — unchanged
//   from the already-tested behavior, so callers using a raw workerId still
//   work exactly as before.
// - workerId supplied, matches a Worker assigned to a DIFFERENT helmet: reject.
// - workerId omitted, no Worker assigned to this helmetId: reject — there is
//   no id left to key HelmetData/WorkerProcessingState on.
async function resolveWorkerId(helmetId, suppliedWorkerId) {
  if (suppliedWorkerId) {
    const worker = await Worker.findOne({ workerId: suppliedWorkerId });
    if (!worker) {
      return { ok: false, reject: false, workerId: suppliedWorkerId, reason: "WORKER_NOT_FOUND" };
    }
    if (worker.helmetId && worker.helmetId !== helmetId) {
      return { ok: false, reject: true, status: 400, reason: "WORKER_HELMET_MISMATCH" };
    }
    return { ok: true, workerId: worker.workerId };
  }

  const worker = await Worker.findOne({ helmetId });
  if (!worker) {
    return { ok: false, reject: true, status: 404, reason: "NO_WORKER_ASSIGNED_TO_HELMET" };
  }
  return { ok: true, workerId: worker.workerId };
}

module.exports = { getWorkerBaseline, resolveWorkerId };
