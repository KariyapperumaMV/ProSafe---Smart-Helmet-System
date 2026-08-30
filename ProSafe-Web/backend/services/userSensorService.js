const User = require("../models/User");
const HelmetData = require("../models/HelmetData");
const WorkerProcessingState = require("../models/WorkerProcessingState");
const { USER_ROLES } = require("../constants/roles");
const { calculatePhysiologicalDeviations } = require("./deviationService");
const sensorRanges = require("../config/sensorRanges");
const { timezone } = require("../config/appConfig");

const DAYS = 7;

const PERSONALIZED_SENSORS = {
  heartRate: {
    rawField: "heartRate",
    baselineField: "baselineHeartRate",
    label: "Heart Rate",
    unit: "BPM",
  },
  bodyTemperature: {
    rawField: "bodyTemp",
    baselineField: "baselineBodyTemperature",
    label: "Body Temperature",
    unit: "°C",
  },
};

const ENVIRONMENTAL_SENSORS = {
  noise: { rawField: "noise" },
  gas: { rawField: "gas" },
  uv: { rawField: "uv" },
  ambientTemperature: { rawField: "ambientTemp" },
};

function round(value, places = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// Only WORKER accounts have sensor history; ADMIN targets and unknown/
// inactive ids are rejected here so every route handler shares one check
// instead of repeating it.
async function authorizeTarget(userId) {
  const user = await User.findOne({ userId, active: true });
  if (!user) {
    return { ok: false, status: 404, message: "User not found" };
  }
  if (user.role !== USER_ROLES.WORKER) {
    return { ok: false, status: 400, message: "Sensor history is only available for worker accounts" };
  }
  return { ok: true, user };
}

async function getLatestPacket(workerId) {
  return HelmetData.findOne({ workerId }).sort({ timestamp: -1 });
}

// 7-day daily average for one raw.<field> path, grouped by local calendar
// day (appConfig.timezone) via Mongo's own timezone-aware date operators —
// no raw packets are pulled into Node just to average them (a worker can
// have ~10,000 packets across 7 days; this returns at most 7 rows).
// `$type: "number"` doubles as the null/missing/non-numeric guard — Stage 6
// packet validation already rejects non-finite sensor values before they're
// ever persisted, so this is a defensive filter, not evidence such values
// exist today.
async function getDailyAverages(workerId, rawField) {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  const path = `raw.${rawField}`;

  const rows = await HelmetData.aggregate([
    { $match: { workerId, timestamp: { $gte: since }, [path]: { $type: "number" } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone } },
        average: { $avg: `$${path}` },
        sampleCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return rows.map((row) => ({ date: row._id, average: round(row.average), sampleCount: row.sampleCount }));
}

// GET /api/users/:id/sensors/heart-rate | body-temperature
async function getPersonalizedSensorHistory(userId, sensorKey) {
  const auth = await authorizeTarget(userId);
  if (!auth.ok) return auth;

  const def = PERSONALIZED_SENSORS[sensorKey];
  const { user } = auth;

  const [latest, dailyAverages] = await Promise.all([
    getLatestPacket(user.userId),
    getDailyAverages(user.userId, def.rawField),
  ]);

  const currentValue = latest ? latest.raw?.[def.rawField] : null;
  const baseline = typeof user[def.baselineField] === "number" ? user[def.baselineField] : null;

  let deviationPercent = null;
  if (baseline !== null && typeof currentValue === "number" && Number.isFinite(currentValue)) {
    const deviations = calculatePhysiologicalDeviations(
      { [def.rawField]: currentValue },
      { [def.rawField === "heartRate" ? "baselineHeartRate" : "baselineBodyTemperature"]: baseline }
    );
    const deviationValue = def.rawField === "heartRate" ? deviations.heartRateDeviation : deviations.bodyTempDeviation;
    deviationPercent = round(deviationValue);
  }

  return {
    ok: true,
    status: 200,
    body: {
      sensor: sensorKey,
      label: def.label,
      unit: def.unit,
      current:
        latest && typeof currentValue === "number" && Number.isFinite(currentValue)
          ? { value: currentValue, timestamp: latest.timestamp }
          : null,
      baseline,
      deviationPercent,
      dailyAverages,
    },
  };
}

// GET /api/users/:id/sensors/noise | gas | uv | ambient-temperature
async function getEnvironmentalSensorHistory(userId, sensorKey) {
  const auth = await authorizeTarget(userId);
  if (!auth.ok) return auth;

  const def = ENVIRONMENTAL_SENSORS[sensorKey];
  const meta = sensorRanges.getRangeMetadata(sensorKey);
  const { user } = auth;

  const [latest, dailyAverages] = await Promise.all([
    getLatestPacket(user.userId),
    getDailyAverages(user.userId, def.rawField),
  ]);

  const currentValue = latest ? latest.raw?.[def.rawField] : null;
  const hasCurrentValue = typeof currentValue === "number" && Number.isFinite(currentValue);

  return {
    ok: true,
    status: 200,
    body: {
      sensor: sensorKey,
      label: meta.label,
      unit: meta.unit,
      current: hasCurrentValue ? { value: currentValue, timestamp: latest.timestamp } : null,
      category: hasCurrentValue ? sensorRanges.classify(sensorKey, currentValue) : null,
      ranges: meta.displayRanges,
      standard: meta.standard,
      configurable: true,
      dailyAverages,
    },
  };
}

// Consecutive accepted predictions with the same smoothed state collapse
// into one timeline segment instead of sending up to ~1440 points/day to
// the browser, while still preserving every state transition (#30).
function compressPredictionTimeline(points) {
  const segments = [];

  for (const point of points) {
    const last = segments[segments.length - 1];
    if (last && last.state === point.state) {
      last.to = point.timestamp;
      last._confidenceSum += point.confidence ?? 0;
      last._confidenceCount += point.confidence != null ? 1 : 0;
      last.pointCount += 1;
    } else {
      segments.push({
        state: point.state,
        from: point.timestamp,
        to: point.timestamp,
        pointCount: 1,
        _confidenceSum: point.confidence ?? 0,
        _confidenceCount: point.confidence != null ? 1 : 0,
      });
    }
  }

  return segments.map(({ _confidenceSum, _confidenceCount, ...segment }) => ({
    ...segment,
    avgConfidence: _confidenceCount ? round(_confidenceSum / _confidenceCount, 4) : null,
  }));
}

// GET /api/users/:id/safety-predictions
async function getSafetyPredictionHistory(userId) {
  const auth = await authorizeTarget(userId);
  if (!auth.ok) return auth;

  const { user } = auth;

  const [state, todayPackets] = await Promise.all([
    WorkerProcessingState.findOne({ workerId: user.userId }),
    // WorkerProcessingState.predictionHistory is a rolling window capped at
    // PREDICTION_WINDOW_SIZE (default 5, used only for majority-vote
    // smoothing) — it cannot answer "today's history", so today's timeline
    // comes from HelmetData directly. Pre-filtered to the last 2 days on
    // the existing {workerId,timestamp} index before the exact local-day
    // match, so no new index is needed.
    HelmetData.aggregate([
      {
        $match: {
          workerId: user.userId,
          timestamp: { $gte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
          "prediction.accepted": true,
          "prediction.smoothedState": { $ne: null },
        },
      },
      {
        $addFields: {
          localDate: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone } },
        },
      },
      { $match: { localDate: new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date()) } },
      { $sort: { timestamp: 1 } },
      { $project: { _id: 0, timestamp: 1, state: "$prediction.smoothedState", confidence: "$prediction.confidence" } },
    ]),
  ]);

  const predictionHistory = state?.predictionHistory || [];
  const latestAccepted = predictionHistory[predictionHistory.length - 1] || null;

  return {
    ok: true,
    status: 200,
    body: {
      currentRiskState: state ? state.currentRiskState : null,
      emergencyActive: state ? state.emergencyActive : false,
      latestPrediction: latestAccepted
        ? { state: latestAccepted.riskLevel, confidence: latestAccepted.confidence, timestamp: latestAccepted.at }
        : null,
      todayHistory: compressPredictionTimeline(todayPackets),
    },
  };
}

module.exports = {
  authorizeTarget,
  getPersonalizedSensorHistory,
  getEnvironmentalSensorHistory,
  getSafetyPredictionHistory,
  PERSONALIZED_SENSORS,
  ENVIRONMENTAL_SENSORS,
};
