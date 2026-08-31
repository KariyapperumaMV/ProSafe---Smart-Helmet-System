const mongoose = require("mongoose");
const Alert = require("../models/Alert");
const User = require("../models/User");
const WorkerProcessingState = require("../models/WorkerProcessingState");
const { USER_ROLES } = require("../constants/roles");

// Stage 15: called only on an actual state transition (sensorProcessingService
// enforces that), so this never has to de-duplicate identical WARNING ->
// WARNING packets itself.
async function generateAlert({ workerId, helmetId, timestamp, previousRiskState, currentRiskState, confidence, raw }) {
  return Alert.create({
    workerId,
    helmetId,
    timestamp,
    previousRiskState,
    currentRiskState,
    confidence,
    sensorSnapshot: {
      heartRate: raw.heartRate,
      bodyTemp: raw.bodyTemp,
      ambientTemp: raw.ambientTemp,
      noise: raw.noise,
      gas: raw.gas,
      uv: raw.uv,
    },
    location: raw.gps ? { lat: raw.gps.lat, lon: raw.gps.lon } : undefined,
  });
}

// The one place a stored Alert becomes a display object — used by the
// dashboard's embedded summary and the standalone filtered/paginated list,
// so the two can never describe the same alert differently. `workerName`
// falls back to the raw workerId when no User (active or soft-deleted)
// matches at all — a genuinely orphaned historical record stays readable.
async function shapeAlerts(alerts) {
  if (!alerts.length) return [];

  const referencedIds = [...new Set(alerts.map((a) => a.workerId))];
  const users = await User.find({ userId: { $in: referencedIds } }, "userId name").lean();
  const nameMap = new Map(users.map((u) => [u.userId, u.name]));

  // Only EMERGENCY alerts ever have a meaningful "reset requested" interim
  // state (see emergencyService.requestReset) — resolved alerts don't need
  // it looked up at all, since the UI only shows it while unresolved.
  const emergencyWorkerIds = [
    ...new Set(alerts.filter((a) => a.type === "EMERGENCY" && !a.resolved).map((a) => a.workerId)),
  ];
  const states = emergencyWorkerIds.length
    ? await WorkerProcessingState.find({ workerId: { $in: emergencyWorkerIds } }, "workerId resetRequested").lean()
    : [];
  const resetRequestedMap = new Map(states.map((s) => [s.workerId, s.resetRequested]));

  return alerts.map((alert) => ({
    id: String(alert._id),
    type: alert.type,
    workerId: alert.workerId,
    workerName: nameMap.get(alert.workerId) || alert.workerId,
    helmetId: alert.helmetId,
    timestamp: alert.timestamp,
    previousRiskState: alert.previousRiskState,
    currentRiskState: alert.currentRiskState,
    confidence: alert.confidence,
    sensorSnapshot: alert.sensorSnapshot || null,
    location: alert.location && typeof alert.location.lat === "number" ? alert.location : null,
    acknowledged: alert.acknowledged,
    acknowledgedAt: alert.acknowledgedAt || null,
    acknowledgedBy: alert.acknowledgedBy || null,
    resolved: alert.resolved,
    resolvedAt: alert.resolvedAt || null,
    resetRequested:
      alert.type === "EMERGENCY" && !alert.resolved ? Boolean(resetRequestedMap.get(alert.workerId)) : false,
    // A factual label, not a fabricated cause — Alert has no free-text
    // "trigger reason" field, only the transition itself or the fact of an
    // emergency.
    label:
      alert.type === "EMERGENCY"
        ? "Emergency button pressed"
        : `Risk changed: ${alert.previousRiskState} → ${alert.currentRiskState}`,
  }));
}

// GET /api/alerts and the dashboard's embedded Recent Alerts both go
// through this. ADMIN sees the organization; WORKER is always forcibly
// scoped to their own workerId, regardless of anything the client sends —
// the caller passes requesterRole/requesterId from the verified token, this
// function ignores any client-supplied workerId entirely.
async function listAlerts({ requesterRole, requesterId, type, risk, acknowledged, resolved, sinceDate, page, limit } = {}) {
  const filter = {};

  if (requesterRole !== USER_ROLES.ADMIN) {
    filter.workerId = requesterId;
  }
  if (type === "EMERGENCY" || type === "TRANSITION") {
    filter.type = type;
  }
  if (risk === "SAFE" || risk === "WARNING" || risk === "CRITICAL") {
    filter.currentRiskState = risk;
  }
  if (acknowledged === "true" || acknowledged === true) {
    filter.acknowledged = true;
  } else if (acknowledged === "false" || acknowledged === false) {
    filter.acknowledged = false;
  }
  if (resolved === "true" || resolved === true) {
    filter.resolved = true;
  } else if (resolved === "false" || resolved === false) {
    filter.resolved = false;
  }
  if (sinceDate) {
    filter.timestamp = { $gte: sinceDate };
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

  const [alerts, total] = await Promise.all([
    Alert.find(filter).sort({ timestamp: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
    Alert.countDocuments(filter),
  ]);

  return {
    alerts: await shapeAlerts(alerts),
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) || 1 },
  };
}

// PATCH /api/alerts/:alertId/acknowledge — ADMIN only (enforced by the
// route). Idempotent: first acknowledgement wins — acknowledgedAt/By are
// never overwritten by a later call once already set.
async function acknowledgeAlert(alertId, adminUserId) {
  if (!mongoose.Types.ObjectId.isValid(alertId)) {
    return { ok: false, status: 404, message: "Alert not found" };
  }

  const alert = await Alert.findById(alertId);
  if (!alert) {
    return { ok: false, status: 404, message: "Alert not found" };
  }

  if (!alert.acknowledged) {
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = adminUserId;
    await alert.save();
  }

  const [shaped] = await shapeAlerts([alert.toObject()]);
  return { ok: true, status: 200, body: shaped };
}

module.exports = { generateAlert, listAlerts, acknowledgeAlert, shapeAlerts };
