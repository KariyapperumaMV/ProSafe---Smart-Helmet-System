const User = require("../models/User");
const Helmet = require("../models/Helmet");
const HelmetData = require("../models/HelmetData");
const Alert = require("../models/Alert");
const WorkerProcessingState = require("../models/WorkerProcessingState");
const { USER_ROLES } = require("../constants/roles");
const { timezone, dashboardAlertWindowDays } = require("../config/appConfig");
const { computeOperationalState, statusFields, STATUS_PROJECTION } = require("./operationalStateService");
const helmetService = require("./helmetService");
const weatherService = require("./weatherService");
const alertService = require("./alertService");

const RECENT_ALERTS_LIMIT = 10;
const WORKER_RECENT_ALERTS_LIMIT = 5;

// Mutually exclusive by construction: every active worker lands in exactly
// one bucket of operationalStateService.computeOperationalState (#7) —
// EMERGENCY first, a confirmed WARNING/CRITICAL is never hidden by uncertain
// data, UNCERTAIN when the latest data can't support a decision, UNKNOWN when
// there is no processing state at all (never defaulted to SAFE).
const OPERATIONAL_TO_BUCKET = {
  EMERGENCY: "emergency",
  SAFE: "safe",
  WARNING: "warning",
  CRITICAL: "critical",
  UNCERTAIN: "uncertain",
  UNKNOWN: "unknown",
};

async function getWorkerStatusCounts() {
  const workers = await User.find({ role: USER_ROLES.WORKER, active: true }, "userId").lean();
  const workerIds = workers.map((w) => w.userId);
  const counts = { total: workerIds.length, safe: 0, warning: 0, critical: 0, emergency: 0, uncertain: 0, unknown: 0 };

  if (!workerIds.length) return counts;

  const states = await WorkerProcessingState.find({ workerId: { $in: workerIds } }, STATUS_PROJECTION).lean();
  const stateMap = new Map(states.map((s) => [s.workerId, s]));

  for (const workerId of workerIds) {
    counts[OPERATIONAL_TO_BUCKET[computeOperationalState(stateMap.get(workerId))] || "unknown"] += 1;
  }

  return counts;
}

// Reuses helmetService's assignment map and online-threshold helper (#17) —
// this never computes online/offline or assigned/unassigned a second way.
async function getHelmetStatusSummary() {
  const [helmets, assignedMap] = await Promise.all([
    Helmet.find({ active: true }, "helmetId").lean(),
    helmetService.getAssignedWorkerMap(),
  ]);
  const helmetIds = helmets.map((h) => h.helmetId);
  const registered = helmetIds.length;

  if (!registered) {
    return { registered: 0, online: 0, offline: 0, assigned: 0, unassigned: 0, onlinePercent: null };
  }

  const lastSeenMap = await helmetService.getLastSeenMap(helmetIds);
  let online = 0;
  for (const helmetId of helmetIds) {
    if (helmetService.isRecentEnoughToBeOnline(lastSeenMap.get(helmetId) || null)) online += 1;
  }
  const assigned = helmetIds.filter((id) => assignedMap.has(id)).length;

  return {
    registered,
    online,
    offline: registered - online,
    assigned,
    unassigned: registered - assigned,
    onlinePercent: Math.round((online / registered) * 100),
  };
}

// Alerts created during the current Asia/Colombo calendar day — same
// "$dateToString + local match" technique already used for the 7-day
// sensor-history aggregations, applied to Alert instead of HelmetData.
async function getAlertsTodayCount() {
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());

  const rows = await Alert.aggregate([
    { $match: { timestamp: { $gte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } } },
    { $addFields: { localDate: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone } } } },
    { $match: { localDate: todayStr } },
    { $count: "count" },
  ]);

  return rows[0]?.count || 0;
}

// Admin gets every worker's alerts; a worker gets only their own — enforced
// inside alertService.listAlerts (the one place this scoping happens, also
// shared with the standalone GET /api/alerts endpoint). Bounded to the last
// dashboardAlertWindowDays (7) per the approved plan — the full Alert
// history is never deleted, only this *view* is time-boxed.
async function getRecentAlerts({ workerId, limit } = {}) {
  const sinceDate = new Date(Date.now() - dashboardAlertWindowDays * 24 * 60 * 60 * 1000);
  const { alerts } = await alertService.listAlerts({
    requesterRole: workerId ? USER_ROLES.WORKER : USER_ROLES.ADMIN,
    requesterId: workerId,
    sinceDate,
    limit,
  });
  return alerts;
}

// Bulk "latest packet WITH genuine valid GPS, per helmet" — deliberately
// separate from helmetService.getLastSeenMap (which finds the latest packet
// regardless of GPS presence, used for online/offline). The two can
// legitimately disagree: a helmet's most recent packet might carry no GPS
// at all while an earlier one did, and per #23 that earlier valid fix must
// still be used as the location rather than being discarded.
async function getLastValidLocationMap(helmetIds) {
  if (!helmetIds.length) return new Map();

  const rows = await HelmetData.aggregate([
    {
      $match: {
        helmetId: { $in: helmetIds },
        "raw.gps.lat": { $type: "number" },
        "raw.gps.lon": { $type: "number" },
      },
    },
    { $sort: { helmetId: 1, timestamp: -1 } },
    {
      $group: {
        _id: "$helmetId",
        lat: { $first: "$raw.gps.lat" },
        lon: { $first: "$raw.gps.lon" },
        locationTimestamp: { $first: "$timestamp" },
      },
    },
  ]);

  return new Map(rows.map((row) => [row._id, { lat: row.lat, lon: row.lon, locationTimestamp: row.locationTimestamp }]));
}

// Map-ready location data — ADMIN dashboard only. Only active WORKER users
// with an assigned, currently-registered (active) Helmet, and only when a
// genuine valid GPS fix has ever been recorded for that helmet — no
// fabricated fallback coordinates, ever (#26/#34).
async function getWorkerLocationMap() {
  const workers = await User.find({ role: USER_ROLES.WORKER, active: true, helmetId: { $ne: null } }, "userId name helmetId").lean();
  if (!workers.length) return [];

  const candidateHelmetIds = [...new Set(workers.map((w) => w.helmetId))];
  const registeredHelmets = await Helmet.find({ helmetId: { $in: candidateHelmetIds }, active: true }, "helmetId").lean();
  const registeredSet = new Set(registeredHelmets.map((h) => h.helmetId));
  const relevantWorkers = workers.filter((w) => registeredSet.has(w.helmetId));
  if (!relevantWorkers.length) return [];

  const relevantHelmetIds = relevantWorkers.map((w) => w.helmetId);
  const relevantWorkerIds = relevantWorkers.map((w) => w.userId);

  const [lastSeenMap, lastLocationMap, states] = await Promise.all([
    helmetService.getLastSeenMap(relevantHelmetIds),
    getLastValidLocationMap(relevantHelmetIds),
    WorkerProcessingState.find({ workerId: { $in: relevantWorkerIds } }, STATUS_PROJECTION).lean(),
  ]);
  const stateMap = new Map(states.map((s) => [s.workerId, s]));

  const locations = [];
  for (const worker of relevantWorkers) {
    const location = lastLocationMap.get(worker.helmetId);
    if (!location) continue; // never sent a valid GPS fix — excluded, not fabricated

    const lastSeenAt = lastSeenMap.get(worker.helmetId) || null;
    const state = stateMap.get(worker.userId);
    // Same rule as every other view (operationalStateService) — emergency
    // always overrides, never defaulted to SAFE.
    const { operationalState, uncertainReason } = statusFields(state);

    locations.push({
      userId: worker.userId,
      workerName: worker.name,
      helmetId: worker.helmetId,
      lat: location.lat,
      lon: location.lon,
      online: helmetService.isRecentEnoughToBeOnline(lastSeenAt),
      lastSeenAt,
      locationTimestamp: location.locationTimestamp,
      operationalState,
      uncertainReason,
    });
  }

  return locations;
}

// GET /api/dashboard/admin — ADMIN only. One aggregated response instead of
// the frontend firing ~6 unrelated requests (#14 in the analysis).
async function getAdminDashboard() {
  const [workerStatus, helmetStatus, alertsToday, recentAlerts, weather, locations] = await Promise.all([
    getWorkerStatusCounts(),
    getHelmetStatusSummary(),
    getAlertsTodayCount(),
    getRecentAlerts({ limit: RECENT_ALERTS_LIMIT }),
    weatherService.getWeather(),
    getWorkerLocationMap(),
  ]);

  return {
    summary: {
      totalWorkers: workerStatus.total,
      helmetsOnline: helmetStatus.online,
      alertsToday,
      safeWorkers: workerStatus.safe,
    },
    workerStatus,
    helmetStatus,
    recentAlerts,
    weather,
    locations,
  };
}

// GET /api/dashboard/worker — WORKER only. Identity comes from req.user.id
// (verifyToken), never a client-supplied id (#12) — the controller passes
// only that.
async function getWorkerDashboard(userId) {
  const user = await User.findOne({ userId, role: USER_ROLES.WORKER, active: true });
  if (!user) {
    return { ok: false, status: 404, message: "User not found" };
  }

  const [state, latestPacket, recentAlerts, weather] = await Promise.all([
    WorkerProcessingState.findOne({ workerId: user.userId }),
    HelmetData.findOne({ workerId: user.userId }).sort({ timestamp: -1 }),
    getRecentAlerts({ workerId: user.userId, limit: WORKER_RECENT_ALERTS_LIMIT }),
    weatherService.getWeather(),
  ]);

  // Never defaults to SAFE — same rule as the admin worker-status counts (#18).
  const status = statusFields(state);

  let helmet = null;
  if (user.helmetId) {
    const lastSeenMap = await helmetService.getLastSeenMap([user.helmetId]);
    const lastSeenAt = lastSeenMap.get(user.helmetId) || null;
    helmet = { helmetId: user.helmetId, online: helmetService.isRecentEnoughToBeOnline(lastSeenAt), lastSeenAt };
  }

  return {
    ok: true,
    status: 200,
    body: {
      user: { userId: user.userId, name: user.name },
      status,
      helmet,
      latestSensors: latestPacket
        ? {
            timestamp: latestPacket.timestamp,
            heartRate: latestPacket.raw.heartRate,
            bodyTemp: latestPacket.raw.bodyTemp,
            ambientTemp: latestPacket.raw.ambientTemp,
            noise: latestPacket.raw.noise,
            gas: latestPacket.raw.gas,
            uv: latestPacket.raw.uv,
          }
        : null,
      recentAlerts,
      weather,
    },
  };
}

module.exports = {
  getAdminDashboard,
  getWorkerDashboard,
  getWorkerStatusCounts,
  getHelmetStatusSummary,
  getAlertsTodayCount,
  getRecentAlerts,
  getWorkerLocationMap,
  // Exported so userController's single-worker detail view can reuse the
  // exact same "latest packet WITH valid GPS" aggregation for one helmetId
  // (the compact Location card) instead of duplicating it or going through
  // getWorkerLocationMap's all-workers scan.
  getLastValidLocationMap,
};
