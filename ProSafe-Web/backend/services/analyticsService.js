const Alert = require("../models/Alert");
const HelmetData = require("../models/HelmetData");
const Helmet = require("../models/Helmet");
const User = require("../models/User");
const { USER_ROLES } = require("../constants/roles");
const { RISK_STATES } = require("../constants/riskStates");
const { timezone } = require("../config/appConfig");
const { exposure: exposureConfig } = require("../config/processingConfig");
const analyticsConfig = require("../config/analyticsConfig");
const sensorRanges = require("../config/sensorRanges");
const helmetService = require("./helmetService");
const periodService = require("./analyticsPeriodService");

const ENV_SENSORS = {
  ambientTemperature: "raw.ambientTemp",
  noise: "raw.noise",
  gas: "raw.gas",
  uv: "raw.uv",
};

const TOP_WORKERS_LIMIT = 15;
const TOP_HEALTH_WORKERS_LIMIT = 10;
const TOP_EXPOSURE_WORKERS_LIMIT = 10;
const HIGH_RISK_HOURS_LIMIT = 5;

// ---------- small numeric helpers ----------

function round1(n) {
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}

function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Safe percent-change: previous=0 with current=0 is "no change" (0), but
// previous=0 with current>0 has no defined percentage — null, which the
// frontend renders as "New"/"N/A" rather than Infinity or a fabricated number.
function percentChange(current, previous) {
  if (previous === 0) return current === 0 ? 0 : null;
  return round1(((current - previous) / previous) * 100);
}

// ---------- Alert-based aggregations ----------

// Single-pass Alert grouping — reused for both counts/distribution and the
// severity-first worker ranking's raw counts.
async function getAlertCounts(start, end) {
  const rows = await Alert.aggregate([
    { $match: { timestamp: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: null,
        warningAlerts: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "TRANSITION"] }, { $eq: ["$currentRiskState", RISK_STATES.WARNING] }] }, 1, 0] } },
        criticalAlerts: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "TRANSITION"] }, { $eq: ["$currentRiskState", RISK_STATES.CRITICAL] }] }, 1, 0] } },
        emergencyAlerts: { $sum: { $cond: [{ $eq: ["$type", "EMERGENCY"] }, 1, 0] } },
      },
    },
  ]);
  const row = rows[0] || { warningAlerts: 0, criticalAlerts: 0, emergencyAlerts: 0 };
  return {
    warningAlerts: row.warningAlerts,
    criticalAlerts: row.criticalAlerts,
    emergencyAlerts: row.emergencyAlerts,
    // Total is the sum of the three hazard buckets above (matches
    // alertDistribution exactly) — a rare SAFE-recovery TRANSITION alert
    // isn't a hazard event and isn't counted as one here.
    totalAlerts: row.warningAlerts + row.criticalAlerts + row.emergencyAlerts,
  };
}

async function getWorkerActivityCounts(start, end) {
  const [totalActiveWorkers, hdWorkers, alertWorkers] = await Promise.all([
    User.countDocuments({ role: USER_ROLES.WORKER, active: true }),
    HelmetData.distinct("workerId", { timestamp: { $gte: start, $lt: end } }),
    Alert.distinct("workerId", { timestamp: { $gte: start, $lt: end } }),
  ]);
  const workersWithActivity = new Set([...hdWorkers, ...alertWorkers]).size;
  return { totalActiveWorkers, workersWithActivity };
}

async function resolveWorkerNames(workerIds) {
  if (!workerIds.length) return new Map();
  const users = await User.find({ userId: { $in: workerIds } }, "userId name").lean();
  return new Map(users.map((u) => [u.userId, u.name]));
}

// Risk trend — bucketed by hour (daily) or calendar day (weekly/monthly),
// zero-filled so a no-activity bucket still appears as 0 rather than being
// silently missing from the chart.
async function getRiskTrend(periodType, start, end, dateStr) {
  const { granularity, labels } = periodService.enumerateBuckets(periodType, dateStr, timezone);
  const bucketExpr =
    granularity === "hour"
      ? { $dateToString: { format: "%H:00", date: "$timestamp", timezone } }
      : { $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone } };

  const rows = await Alert.aggregate([
    { $match: { timestamp: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: bucketExpr,
        warning: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "TRANSITION"] }, { $eq: ["$currentRiskState", RISK_STATES.WARNING] }] }, 1, 0] } },
        critical: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "TRANSITION"] }, { $eq: ["$currentRiskState", RISK_STATES.CRITICAL] }] }, 1, 0] } },
        emergency: { $sum: { $cond: [{ $eq: ["$type", "EMERGENCY"] }, 1, 0] } },
      },
    },
  ]);
  const byBucket = new Map(rows.map((r) => [r._id, r]));

  return labels.map((bucket) => {
    const row = byBucket.get(bucket);
    return { bucket, warning: row?.warning || 0, critical: row?.critical || 0, emergency: row?.emergency || 0 };
  });
}

// Workers Requiring Attention — transparent counts only, no hidden weighted
// score. Sort order: emergency desc, critical desc, warning desc, total desc,
// workerId asc (deterministic tie-break) — documented explicitly rather than
// presented as an opaque ranking.
async function getWorkerRiskRanking(start, end) {
  const rows = await Alert.aggregate([
    { $match: { timestamp: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: "$workerId",
        warning: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "TRANSITION"] }, { $eq: ["$currentRiskState", RISK_STATES.WARNING] }] }, 1, 0] } },
        critical: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "TRANSITION"] }, { $eq: ["$currentRiskState", RISK_STATES.CRITICAL] }] }, 1, 0] } },
        emergency: { $sum: { $cond: [{ $eq: ["$type", "EMERGENCY"] }, 1, 0] } },
        totalAlerts: { $sum: 1 },
      },
    },
    { $sort: { emergency: -1, critical: -1, warning: -1, totalAlerts: -1, _id: 1 } },
    { $limit: TOP_WORKERS_LIMIT },
  ]);

  const nameMap = await resolveWorkerNames(rows.map((r) => r._id));

  // latestRiskState is the period-scoped smoothed ML state from the latest
  // HelmetData packet *within this period* — never
  // WorkerProcessingState.currentRiskState, which is today's live state and
  // would be meaningless (and misleading) when looking at a past period
  // (#7). Omitted entirely if no smoothed state was ever recorded in-period.
  const latestStates = await Promise.all(
    rows.map((r) =>
      HelmetData.findOne(
        { workerId: r._id, timestamp: { $gte: start, $lt: end }, "prediction.smoothedState": { $ne: null } },
        "prediction.smoothedState"
      )
        .sort({ timestamp: -1 })
        .lean()
    )
  );

  return rows.map((r, i) => ({
    workerId: r._id,
    workerName: nameMap.get(r._id) || r._id,
    warning: r.warning,
    critical: r.critical,
    emergency: r.emergency,
    totalAlerts: r.totalAlerts,
    latestRiskState: latestStates[i]?.prediction?.smoothedState || null,
  }));
}

// ---------- Environmental (HelmetData) aggregations ----------

// One aggregation pass over HelmetData computes summary (avg/min/max/counts)
// AND trend (bucketed avg) for all four sensors at once via $facet — avoids
// four separate collection scans, and lets the frontend's sensor selector
// switch instantly without a refetch (#9) since every sensor's trend is
// already in the response.
async function getEnvironmentalAnalytics(periodType, start, end, dateStr) {
  const { granularity, labels } = periodService.enumerateBuckets(periodType, dateStr, timezone);
  const bucketExpr =
    granularity === "hour"
      ? { $dateToString: { format: "%H:00", date: "$timestamp", timezone } }
      : { $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone } };
  const dayExpr = { $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone } };

  const facet = {};
  for (const [key, path] of Object.entries(ENV_SENSORS)) {
    const fieldPath = `$${path}`;
    const classifyExpr = sensorRanges.getMongoClassifyExpr(key, fieldPath);
    facet[key] = [
      { $match: { [path]: { $type: "number" } } },
      {
        $group: {
          _id: null,
          avg: { $avg: fieldPath },
          min: { $min: fieldPath },
          max: { $max: fieldPath },
          total: { $sum: 1 },
          warning: { $sum: { $cond: [{ $eq: [classifyExpr, RISK_STATES.WARNING] }, 1, 0] } },
          critical: { $sum: { $cond: [{ $eq: [classifyExpr, RISK_STATES.CRITICAL] }, 1, 0] } },
        },
      },
    ];
    facet[`${key}Trend`] = [
      { $match: { [path]: { $type: "number" } } },
      { $group: { _id: bucketExpr, avg: { $avg: fieldPath } } },
    ];
    facet[`${key}CriticalDays`] = [
      { $match: { [path]: { $type: "number" } } },
      { $match: { $expr: { $eq: [classifyExpr, RISK_STATES.CRITICAL] } } },
      { $group: { _id: dayExpr } },
      { $count: "days" },
    ];
  }

  const [result = {}] = await HelmetData.aggregate([{ $match: { timestamp: { $gte: start, $lt: end } } }, { $facet: facet }]);

  const summary = {};
  const trends = {};
  const criticalDaysBySensor = {};

  for (const key of Object.keys(ENV_SENSORS)) {
    const row = (result[key] || [])[0];
    if (!row || row.total === 0) {
      summary[key] = { avg: null, min: null, max: null, totalReadings: 0, warningReadings: 0, criticalReadings: 0, warningPercent: null, criticalPercent: null };
    } else {
      summary[key] = {
        avg: round1(row.avg),
        min: round1(row.min),
        max: round1(row.max),
        totalReadings: row.total,
        warningReadings: row.warning,
        criticalReadings: row.critical,
        warningPercent: round1((row.warning / row.total) * 100),
        criticalPercent: round1((row.critical / row.total) * 100),
      };
    }

    const trendRows = result[`${key}Trend`] || [];
    const byBucket = new Map(trendRows.map((r) => [r._id, r.avg]));
    trends[key] = labels.map((bucket) => ({ bucket, avg: byBucket.has(bucket) ? round1(byBucket.get(bucket)) : null }));

    criticalDaysBySensor[key] = (result[`${key}CriticalDays`] || [])[0]?.days || 0;
  }

  return { summary, trends, criticalDaysBySensor, periodDays: labels.length };
}

// ---------- Health deviation (personalized) aggregations ----------

async function getHealthDeviations(start, end) {
  const [heartRate, bodyTemperature] = await Promise.all([
    getSingleHealthMetric(start, end, "processed.heartRateDeviation", exposureConfig.heartRateDeviationThresholdPct),
    getSingleHealthMetric(start, end, "processed.bodyTempDeviation", analyticsConfig.bodyTempDeviationThresholdPct),
  ]);
  return { heartRate, bodyTemperature };
}

async function getSingleHealthMetric(start, end, fieldPath, thresholdPct) {
  const mongoPath = `$${fieldPath}`;

  const [aggRow] = await HelmetData.aggregate([
    { $match: { timestamp: { $gte: start, $lt: end }, [fieldPath]: { $type: "number" } } },
    {
      $group: {
        _id: null,
        avgAbs: { $avg: { $abs: mongoPath } },
        // Compares {abs, signed} objects field-by-field — gives the doc with
        // the largest magnitude deviation, preserving its original sign so
        // we can report whether it was above or below baseline.
        maxAbsWithSign: { $max: { $let: { vars: { d: mongoPath }, in: { abs: { $abs: "$$d" }, signed: "$$d" } } } },
        total: { $sum: 1 },
        significantEvents:
          thresholdPct === null
            ? { $sum: 0 }
            : { $sum: { $cond: [{ $gte: [{ $abs: mongoPath }, thresholdPct] }, 1, 0] } },
      },
    },
  ]);

  const topWorkersRows = await HelmetData.aggregate([
    { $match: { timestamp: { $gte: start, $lt: end }, [fieldPath]: { $type: "number" } } },
    {
      $group: {
        _id: "$workerId",
        avgAbsDeviationPct: { $avg: { $abs: mongoPath } },
        maxAbsDeviationPct: { $max: { $abs: mongoPath } },
      },
    },
    { $sort: { maxAbsDeviationPct: -1 } },
    { $limit: TOP_HEALTH_WORKERS_LIMIT },
  ]);
  const nameMap = await resolveWorkerNames(topWorkersRows.map((r) => r._id));

  if (!aggRow || aggRow.total === 0) {
    return {
      avgAbsDeviationPct: null,
      maxAbsDeviationPct: null,
      maxDeviationDirection: null,
      significantEvents: thresholdPct === null ? null : 0,
      thresholdConfigured: thresholdPct !== null,
      thresholdPct: thresholdPct,
      topWorkers: [],
    };
  }

  return {
    avgAbsDeviationPct: round1(aggRow.avgAbs),
    maxAbsDeviationPct: round1(aggRow.maxAbsWithSign.abs),
    maxDeviationDirection: aggRow.maxAbsWithSign.signed >= 0 ? "above" : "below",
    significantEvents: thresholdPct === null ? null : aggRow.significantEvents,
    thresholdConfigured: thresholdPct !== null,
    thresholdPct,
    topWorkers: topWorkersRows.map((r) => ({
      workerId: r._id,
      workerName: nameMap.get(r._id) || r._id,
      avgAbsDeviationPct: round1(r.avgAbsDeviationPct),
      maxAbsDeviationPct: round1(r.maxAbsDeviationPct),
    })),
  };
}

// ---------- Exposure aggregations ----------

// "Longest continuous abnormal exposure streak" = MAX(processed.*ExposureDuration)
// per worker. These fields are cumulative-within-a-streak and reset to 0
// when the abnormal condition clears (see exposureService.js), so the max
// value observed IS that streak's true duration — correct by construction,
// with no risk of double-counting. This is deliberately NOT a sum (that
// would multiply-count every streak) and is labeled as a streak length, not
// "total exposure" (see analyticsService header decision #11).
async function getExposureAnalytics(start, end) {
  const [noiseTop, heartRateTop] = await Promise.all([
    getTopExposureStreaks(start, end, "processed.noiseExposureDuration"),
    getTopExposureStreaks(start, end, "processed.heartRateExposureDuration"),
  ]);
  return { noise: { topWorkers: noiseTop }, heartRate: { topWorkers: heartRateTop } };
}

async function getTopExposureStreaks(start, end, fieldPath) {
  const mongoPath = `$${fieldPath}`;
  const rows = await HelmetData.aggregate([
    { $match: { timestamp: { $gte: start, $lt: end }, [fieldPath]: { $type: "number" } } },
    { $group: { _id: "$workerId", longestStreakSeconds: { $max: mongoPath } } },
    { $match: { longestStreakSeconds: { $gt: 0 } } },
    { $sort: { longestStreakSeconds: -1 } },
    { $limit: TOP_EXPOSURE_WORKERS_LIMIT },
  ]);
  const nameMap = await resolveWorkerNames(rows.map((r) => r._id));
  return rows.map((r) => ({ workerId: r._id, workerName: nameMap.get(r._id) || r._id, longestStreakSeconds: r.longestStreakSeconds }));
}

// ---------- Helmet reliability ----------

async function getHelmetReliability(start, end) {
  const activeHelmets = await Helmet.find({ active: true }, "helmetId createdAt deletedAt").lean();
  const activeHelmetIds = activeHelmets.map((h) => h.helmetId);

  const [reportingIds, packetCountRows, lastSeenMap] = await Promise.all([
    HelmetData.distinct("helmetId", { helmetId: { $in: activeHelmetIds }, timestamp: { $gte: start, $lt: end } }),
    HelmetData.aggregate([
      { $match: { helmetId: { $in: activeHelmetIds }, timestamp: { $gte: start, $lt: end } } },
      { $group: { _id: "$helmetId", count: { $sum: 1 } } },
    ]),
    helmetService.getLastSeenMap(activeHelmetIds),
  ]);

  const reportingSet = new Set(reportingIds);
  const noDataHelmetIds = activeHelmetIds.filter((id) => !reportingSet.has(id));
  const packetCountMap = new Map(packetCountRows.map((r) => [r._id, r.count]));

  const now = new Date();
  const expectedIntervalSeconds = exposureConfig.defaultPacketIntervalSeconds; // 60s — same constant the pipeline itself uses

  const coverage = activeHelmets.map((h) => {
    const windowStart = h.createdAt && h.createdAt > start ? h.createdAt : start;
    const windowEndCandidate = h.deletedAt && h.deletedAt < end ? h.deletedAt : end;
    const windowEnd = windowEndCandidate > now ? now : windowEndCandidate;

    if (windowEnd <= windowStart) {
      return { helmetId: h.helmetId, expectedPackets: 0, actualPackets: packetCountMap.get(h.helmetId) || 0, coveragePercent: null };
    }

    const expectedPackets = Math.floor((windowEnd.getTime() - windowStart.getTime()) / (expectedIntervalSeconds * 1000));
    const actualPackets = packetCountMap.get(h.helmetId) || 0;
    const coveragePercent = expectedPackets > 0 ? Math.min(100, Math.round((actualPackets / expectedPackets) * 100)) : null;

    return { helmetId: h.helmetId, expectedPackets, actualPackets, coveragePercent };
  });

  // Current Helmet Status — a present-time snapshot, not a claim about
  // online/offline status throughout the historical period (#14).
  let currentlyOnline = 0;
  let currentlyOffline = 0;
  for (const id of activeHelmetIds) {
    const online = helmetService.isRecentEnoughToBeOnline(lastSeenMap.get(id) || null);
    if (online) currentlyOnline += 1;
    else currentlyOffline += 1;
  }

  return {
    registeredActiveHelmets: activeHelmetIds.length,
    reportingDuringPeriod: reportingSet.size,
    noDataDuringPeriod: noDataHelmetIds,
    currentlyOnline,
    currentlyOffline,
    reportingCoverage: coverage,
  };
}

// ---------- Alert response / resolution ----------

async function getAlertResponse(start, end) {
  const [row] = await Alert.aggregate([
    { $match: { timestamp: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        acknowledged: { $sum: { $cond: ["$acknowledged", 1, 0] } },
        ackTimesMinutes: {
          $push: {
            $cond: [
              { $and: ["$acknowledged", { $ne: ["$acknowledgedAt", null] }] },
              { $divide: [{ $subtract: ["$acknowledgedAt", "$timestamp"] }, 60000] },
              "$$REMOVE",
            ],
          },
        },
        emergencyTotal: { $sum: { $cond: [{ $eq: ["$type", "EMERGENCY"] }, 1, 0] } },
        emergencyResolved: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "EMERGENCY"] }, "$resolved"] }, 1, 0] } },
        resolutionTimesMinutes: {
          $push: {
            $cond: [
              { $and: [{ $eq: ["$type", "EMERGENCY"] }, { $ne: ["$resolvedAt", null] }] },
              { $divide: [{ $subtract: ["$resolvedAt", "$timestamp"] }, 60000] },
              "$$REMOVE",
            ],
          },
        },
      },
    },
  ]);

  if (!row) {
    return {
      total: 0, acknowledged: 0, unacknowledged: 0, acknowledgementRate: null,
      avgAcknowledgementMinutes: null, medianAcknowledgementMinutes: null,
      resolvedEmergencies: 0, unresolvedEmergencies: 0,
      avgResolutionMinutes: null, resolutionSamples: 0,
    };
  }

  return {
    total: row.total,
    acknowledged: row.acknowledged,
    unacknowledged: row.total - row.acknowledged,
    acknowledgementRate: row.total > 0 ? round1((row.acknowledged / row.total) * 100) : null,
    avgAcknowledgementMinutes: round1(mean(row.ackTimesMinutes)),
    medianAcknowledgementMinutes: round1(median(row.ackTimesMinutes)),
    resolvedEmergencies: row.emergencyResolved,
    unresolvedEmergencies: row.emergencyTotal - row.emergencyResolved,
    // Only ever computed over alerts that actually have resolvedAt — legacy
    // resolved:true rows predating that field are correctly excluded, not
    // backfilled with a guess (#13). resolutionSamples tells the UI/report
    // how many emergencies the average is based on, so a tiny sample never
    // looks more authoritative than it is.
    avgResolutionMinutes: row.resolutionTimesMinutes.length ? round1(mean(row.resolutionTimesMinutes)) : null,
    resolutionSamples: row.resolutionTimesMinutes.length,
  };
}

// ---------- High-risk time-of-day ----------

async function getHighRiskTimes(start, end) {
  const rows = await Alert.aggregate([
    { $match: { timestamp: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: { $hour: { date: "$timestamp", timezone } },
        totalAlerts: { $sum: 1 },
        warning: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "TRANSITION"] }, { $eq: ["$currentRiskState", RISK_STATES.WARNING] }] }, 1, 0] } },
        critical: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "TRANSITION"] }, { $eq: ["$currentRiskState", RISK_STATES.CRITICAL] }] }, 1, 0] } },
        emergency: { $sum: { $cond: [{ $eq: ["$type", "EMERGENCY"] }, 1, 0] } },
      },
    },
    // Severity-first, deterministic: emergencies matter most, then
    // criticals, then raw volume, then hour ascending as a final tie-break.
    { $sort: { emergency: -1, critical: -1, totalAlerts: -1, _id: 1 } },
    { $limit: HIGH_RISK_HOURS_LIMIT },
  ]);

  return rows.map((r) => ({
    hour: r._id,
    label: `${String(r._id).padStart(2, "0")}:00–${String((r._id + 1) % 24).padStart(2, "0")}:00`,
    totalAlerts: r.totalAlerts,
    warning: r.warning,
    critical: r.critical,
    emergency: r.emergency,
  }));
}

// ---------- Deterministic key insights ----------

function buildInsights({ periodType, highRiskTimes, workersRequiringAttention, helmetReliability, environment, summary, alertResponse }) {
  const insights = [];

  if (highRiskTimes.length && highRiskTimes[0].totalAlerts > 0) {
    const top = highRiskTimes[0];
    insights.push(`Most alerts occurred between ${top.label} (${top.totalAlerts} alert${top.totalAlerts === 1 ? "" : "s"}, ${top.critical} critical).`);
  }

  const topWorker = workersRequiringAttention[0];
  if (topWorker && topWorker.totalAlerts > 0) {
    insights.push(
      `${topWorker.workerName} recorded the most alerts this period (${topWorker.warning} Warning / ${topWorker.critical} Critical / ${topWorker.emergency} Emergency).`
    );
  }

  if (helmetReliability.noDataDuringPeriod.length > 0) {
    insights.push(
      `${helmetReliability.noDataDuringPeriod.length} registered helmet(s) did not report data during this period: ${helmetReliability.noDataDuringPeriod.join(", ")}.`
    );
  }

  if (periodType !== "daily") {
    for (const key of Object.keys(ENV_SENSORS)) {
      const days = environment.criticalDaysBySensor[key];
      if (days > 0) {
        const label = sensorRanges.getRangeMetadata(key)?.label || key;
        insights.push(`${label} exceeded the configured Critical threshold on ${days} of the ${environment.periodDays} days in this period.`);
      }
    }
  }

  if (summary.emergencyAlerts > 0) {
    insights.push(`${summary.emergencyAlerts} emergency event(s) were recorded this period.`);
  }

  if (alertResponse.unacknowledged > 0) {
    insights.push(`${alertResponse.unacknowledged} alert(s) from this period remain unacknowledged.`);
  }

  return insights;
}

// ---------- In-process cache (single-instance only) ----------
// A multi-instance deployment would need a distributed cache (e.g. Redis)
// instead, since each Node process would otherwise serve its own stale copy
// independently — not introduced here per the approved Phase A scope.
const cache = new Map(); // key -> { value, expiresAt }

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + analyticsConfig.cacheTtlMs });
}

// ---------- Comparison ----------

async function getComparisonSnapshot(start, end) {
  const [alertCounts, workerCounts, environment] = await Promise.all([
    getAlertCounts(start, end),
    getWorkerActivityCounts(start, end),
    getEnvironmentalSnapshotAverages(start, end),
  ]);
  return { alertCounts, workerCounts, environment };
}

// Lightweight — averages only, no min/max/trend/breach-days — since
// comparison only ever needs the headline numbers.
async function getEnvironmentalSnapshotAverages(start, end) {
  const facet = {};
  for (const [key, path] of Object.entries(ENV_SENSORS)) {
    facet[key] = [{ $match: { [path]: { $type: "number" } } }, { $group: { _id: null, avg: { $avg: `$${path}` } } }];
  }
  const [result = {}] = await HelmetData.aggregate([{ $match: { timestamp: { $gte: start, $lt: end } } }, { $facet: facet }]);
  const out = {};
  for (const key of Object.keys(ENV_SENSORS)) {
    out[key] = (result[key] || [])[0]?.avg ?? null;
  }
  return out;
}

function buildComparison(current, previous) {
  const cmp = {
    totalAlerts: percentChange(current.alertCounts.totalAlerts, previous.alertCounts.totalAlerts),
    warningAlerts: percentChange(current.alertCounts.warningAlerts, previous.alertCounts.warningAlerts),
    criticalAlerts: percentChange(current.alertCounts.criticalAlerts, previous.alertCounts.criticalAlerts),
    emergencyAlerts: percentChange(current.alertCounts.emergencyAlerts, previous.alertCounts.emergencyAlerts),
    workersWithActivity: percentChange(current.workerCounts.workersWithActivity, previous.workerCounts.workersWithActivity),
    environment: {},
  };
  for (const key of Object.keys(ENV_SENSORS)) {
    cmp.environment[key] =
      current.environment[key] === null || previous.environment[key] === null
        ? null
        : percentChange(current.environment[key], previous.environment[key]);
  }
  return cmp;
}

// ---------- Main entry point ----------

async function computeAnalytics(periodType, dateStr) {
  const boundaries = periodService.getPeriodBoundaries(periodType, dateStr, timezone);
  const { start, end, previous } = boundaries;

  const [summaryAlertCounts, workerCounts, riskTrend, workersRequiringAttention, environment, health, exposureAnalytics, helmetReliability, alertResponse, highRiskTimes, previousSnapshot] =
    await Promise.all([
      getAlertCounts(start, end),
      getWorkerActivityCounts(start, end),
      getRiskTrend(periodType, start, end, dateStr),
      getWorkerRiskRanking(start, end),
      getEnvironmentalAnalytics(periodType, start, end, dateStr),
      getHealthDeviations(start, end),
      getExposureAnalytics(start, end),
      getHelmetReliability(start, end),
      getAlertResponse(start, end),
      getHighRiskTimes(start, end),
      getComparisonSnapshot(previous.start, previous.end),
    ]);

  const summary = {
    totalActiveWorkers: workerCounts.totalActiveWorkers,
    workersWithActivity: workerCounts.workersWithActivity,
    totalAlerts: summaryAlertCounts.totalAlerts,
    warningAlerts: summaryAlertCounts.warningAlerts,
    criticalAlerts: summaryAlertCounts.criticalAlerts,
    emergencyAlerts: summaryAlertCounts.emergencyAlerts,
    avgAcknowledgementMinutes: alertResponse.avgAcknowledgementMinutes,
    helmetReportingRate:
      helmetReliability.registeredActiveHelmets > 0
        ? round1((helmetReliability.reportingDuringPeriod / helmetReliability.registeredActiveHelmets) * 100)
        : null,
  };

  const currentSnapshot = { alertCounts: summaryAlertCounts, workerCounts, environment: {
    ambientTemperature: environment.summary.ambientTemperature.avg,
    noise: environment.summary.noise.avg,
    gas: environment.summary.gas.avg,
    uv: environment.summary.uv.avg,
  } };
  const comparison = buildComparison(currentSnapshot, previousSnapshot);

  const insights = buildInsights({
    periodType,
    highRiskTimes,
    workersRequiringAttention,
    helmetReliability,
    environment,
    summary,
    alertResponse,
  });

  return {
    period: {
      type: periodType,
      date: dateStr,
      start: start.toISOString(),
      end: end.toISOString(),
      label: boundaries.label,
      weekStart: boundaries.weekStart || null,
      weekEnd: boundaries.weekEnd || null,
      timezone,
      previous: { start: previous.start.toISOString(), end: previous.end.toISOString(), label: previous.label },
    },
    summary,
    comparison,
    riskTrend,
    alertDistribution: { warning: summaryAlertCounts.warningAlerts, critical: summaryAlertCounts.criticalAlerts, emergency: summaryAlertCounts.emergencyAlerts },
    workersRequiringAttention,
    environment,
    health,
    exposure: exposureAnalytics,
    helmetReliability,
    alertResponse,
    highRiskTimes,
    insights,
  };
}

// GET /api/analytics — validates in the controller, this just computes
// (with caching). `fresh=true` bypasses and repopulates the cache.
async function getAnalytics(periodType, dateStr, { fresh = false } = {}) {
  const cacheKey = `${periodType}:${dateStr}`;
  if (!fresh) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }
  const result = await computeAnalytics(periodType, dateStr);
  setCached(cacheKey, result);
  return result;
}

module.exports = {
  getAnalytics,
  computeAnalytics,
  ENV_SENSORS,
};
