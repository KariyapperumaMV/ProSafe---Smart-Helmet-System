// Apply a live WORKER_UPDATE event to data already loaded over REST. Pure
// functions: they return a new object (or the same one when the event does
// not apply), never mutate, and ignore events for other workers.

const STATUS_KEYS = [
  "operationalState",
  "currentRiskState",
  "emergencyActive",
  "dataQualityState",
  "dataUncertain",
  "uncertainReason",
  "uncertainSince",
];

function pickStatus(status) {
  const out = {};
  if (!status) return out;
  for (const key of STATUS_KEYS) if (key in status) out[key] = status[key];
  return out;
}

const isNewer = (ts, prevTs) => !prevTs || new Date(ts) >= new Date(prevTs);

// GET /api/users/:id and /api/users/me -> { user, operationalState, ..., latestSensorData, online, lastSeenAt }
export function applyLiveUpdateToUserDetail(data, event) {
  if (!data || !event || event.workerId !== data.user?.userId) return data;
  const next = { ...data, ...pickStatus(event.status) };
  const latest = event.latest;
  if (latest && isNewer(latest.timestamp, data.latestSensorData?.timestamp)) {
    const prevSensors = data.latestSensorData?.sensors || {};
    next.latestSensorData = {
      ...(data.latestSensorData || {}),
      timestamp: latest.timestamp,
      // keep the last GPS fix: live events carry sensor channels only
      sensors: { ...(prevSensors.gps ? { gps: prevSensors.gps } : {}), ...latest.sensors },
      prediction: {
        systemState: latest.systemState,
        predictedState: latest.predictedState,
        smoothedState: latest.smoothedState,
        confidence: latest.confidence,
        accepted: latest.accepted,
        dataQuality: latest.dataQuality,
        uncertainReason: latest.uncertainReason,
      },
    };
    next.online = true;
    next.lastSeenAt = latest.timestamp;
  }
  return next;
}

// GET /api/dashboard/worker -> { user: { userId }, status: {...}, latestSensors: { timestamp, heartRate, ... }, ... }
export function applyLiveUpdateToWorkerDashboard(data, event) {
  if (!data || !event || event.workerId !== data.user?.userId) return data;
  const next = { ...data, status: { ...data.status, ...pickStatus(event.status) } };
  const latest = event.latest;
  if (latest && isNewer(latest.timestamp, data.latestSensors?.timestamp)) {
    next.latestSensors = { timestamp: latest.timestamp, ...latest.sensors };
    if (data.helmet) next.helmet = { ...data.helmet, online: true, lastSeenAt: latest.timestamp };
  }
  return next;
}

// Safety Prediction modal header: status + latest ACCEPTED prediction (the
// same thing the REST endpoint reports from the smoothing history).
export function applyLiveUpdateToPredictionSummary(data, event) {
  if (!data || !event) return data;
  const next = { ...data, ...pickStatus(event.status) };
  const accepted = [...(event.points || [])].reverse().find((p) => p.state && p.state !== "UNCERTAIN");
  if (accepted && isNewer(accepted.timestamp, data.latestPrediction?.timestamp)) {
    next.latestPrediction = { state: accepted.systemState || accepted.state, confidence: accepted.confidence, timestamp: accepted.timestamp };
  }
  return next;
}
