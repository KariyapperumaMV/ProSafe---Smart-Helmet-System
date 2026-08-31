const User = require("../models/User");
const HelmetData = require("../models/HelmetData");
const WorkerProcessingState = require("../models/WorkerProcessingState");
const { USER_ROLES } = require("../constants/roles");
const { RISK_STATES } = require("../constants/riskStates");
const sensorRanges = require("../config/sensorRanges");
const processingConfig = require("../config/processingConfig");
const { calculatePhysiologicalDeviations } = require("./deviationService");
const helmetService = require("./helmetService");
const rules = require("../config/guidanceRules");

const ENV_SENSOR_RAW_FIELD = {
  ambientTemperature: "ambientTemp",
  noise: "noise",
  gas: "gas",
  uv: "uv",
};

const RISK_RANK = { [RISK_STATES.CRITICAL]: 3, [RISK_STATES.WARNING]: 2, [RISK_STATES.SAFE]: 1 };
const ACTION_PRIORITY_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1 };

function round(value, places = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function formatDeviation(pct) {
  const rounded = round(Math.abs(pct), 1);
  return `${rounded}% ${pct >= 0 ? "above" : "below"} personal baseline`;
}

// Only WORKER accounts have guidance; ADMIN targets and unknown/inactive
// ids are rejected here, mirroring userSensorService.authorizeTarget so
// every guarded route shares the same shape of check.
async function authorizeTarget(userId) {
  const user = await User.findOne({ userId, active: true });
  if (!user) {
    return { ok: false, status: 404, message: "User not found" };
  }
  if (user.role !== USER_ROLES.WORKER) {
    return { ok: false, status: 400, message: "Safety guidance is only available for worker accounts" };
  }
  return { ok: true, user };
}

function baseResponse({ operationalState, mlRiskState, emergencyActive, online, lastUpdated, summaryText }) {
  return {
    timestamp: new Date().toISOString(),
    operationalState,
    mlRiskState,
    emergencyActive,
    online,
    lastUpdated,
    summary: summaryText,
    factors: [],
    guidance: [],
  };
}

// Environmental sensors only ever contribute a factor when they're NOT
// SAFE — an individual-sensor WARNING/CRITICAL must always surface even
// if the overall ML risk state is SAFE (#3), and SAFE readings would just
// be noise in a card meant to stay concise (#9).
function buildEnvironmentalFactors(raw) {
  const factors = [];
  for (const [sensorKey, rawField] of Object.entries(ENV_SENSOR_RAW_FIELD)) {
    const value = raw?.[rawField];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const category = sensorRanges.classify(sensorKey, value);
    if (category === RISK_STATES.WARNING || category === RISK_STATES.CRITICAL) {
      const meta = sensorRanges.getRangeMetadata(sensorKey);
      factors.push({
        sensor: sensorKey,
        label: meta.label,
        value: round(value),
        unit: meta.unit,
        severity: category,
        detail: category === RISK_STATES.CRITICAL ? "Configured Critical range" : "Configured Warning range",
      });
    }
  }
  return factors;
}

// Heart rate has exactly one configured threshold
// (processingConfig.exposure.heartRateDeviationThresholdPct) — it flags
// `attention`, never a SAFE/WARNING/CRITICAL severity band, since that
// threshold was built for exposure-duration tracking, not a full clinical
// classification (approved Decision 1).
function buildHeartRateFactor(raw, user) {
  const value = raw?.heartRate;
  const baseline = user.baselineHeartRate;
  if (typeof value !== "number" || !Number.isFinite(value) || typeof baseline !== "number" || baseline <= 0) {
    return null;
  }
  const { heartRateDeviation } = calculatePhysiologicalDeviations({ heartRate: value }, { baselineHeartRate: baseline });
  if (heartRateDeviation === null) return null;

  return {
    sensor: "heartRate",
    label: "Heart Rate",
    value: round(value),
    unit: "BPM",
    severity: "INFO",
    attention: Math.abs(heartRateDeviation) >= processingConfig.exposure.heartRateDeviationThresholdPct,
    detail: formatDeviation(heartRateDeviation),
  };
}

// No configured threshold exists for body temperature anywhere in this
// project (confirmed against ProSafe-ML's own "deviation-based, no fixed
// threshold" design) — this factor is always purely factual: a value and
// a signed % from baseline, never a severity band, never an `attention`
// flag, never a generated action (approved Decision 2).
function buildBodyTempFactor(raw, user) {
  const value = raw?.bodyTemp;
  const baseline = user.baselineBodyTemperature;
  if (typeof value !== "number" || !Number.isFinite(value) || typeof baseline !== "number" || baseline <= 0) {
    return null;
  }
  const { bodyTempDeviation } = calculatePhysiologicalDeviations({ bodyTemp: value }, { baselineBodyTemperature: baseline });
  if (bodyTempDeviation === null) return null;

  return {
    sensor: "bodyTemperature",
    label: "Body Temperature",
    value: round(value),
    unit: "°C",
    severity: "INFO",
    detail: formatDeviation(bodyTempDeviation),
  };
}

function severityRank(factor) {
  if (factor.severity === RISK_STATES.CRITICAL) return 3;
  if (factor.severity === RISK_STATES.WARNING) return 2;
  return 1; // INFO
}

// Overall card severity = the single highest signal among the ML risk
// state AND every individual environmental factor, so neither one can
// silently outrank the other (#3/#15) — e.g. ML SAFE + noise CRITICAL
// still presents as CRITICAL, and ML CRITICAL + all-SAFE environment
// still presents as CRITICAL even though no environmental factor exists
// to explain it.
function computeOperationalState({ emergencyActive, mlRiskState, factors }) {
  if (emergencyActive) return "EMERGENCY";

  let best = mlRiskState ? RISK_RANK[mlRiskState] || 0 : 0;
  for (const factor of factors) {
    if (factor.severity === RISK_STATES.CRITICAL || factor.severity === RISK_STATES.WARNING) {
      best = Math.max(best, RISK_RANK[factor.severity]);
    }
  }
  if (best === 0) return "UNKNOWN";
  if (best === 3) return RISK_STATES.CRITICAL;
  if (best === 2) return RISK_STATES.WARNING;
  return RISK_STATES.SAFE;
}

// Actions are collected as candidates, then deduplicated by `dedupeKey`
// (keeping whichever candidate has the higher priority) so multiple rules
// that boil down to the same real-world instruction never show as
// separate lines (#11) — e.g. an elevated heart-rate deviation and an
// unexplained WARNING/CRITICAL ML state both resolve to "checkWorkerCondition".
function dedupeAndRankActions(candidates) {
  const byKey = new Map();
  for (const candidate of candidates) {
    const existing = byKey.get(candidate.dedupeKey);
    if (!existing || ACTION_PRIORITY_RANK[candidate.priority] > ACTION_PRIORITY_RANK[existing.priority]) {
      byKey.set(candidate.dedupeKey, candidate);
    }
  }
  return [...byKey.values()]
    .sort((a, b) => ACTION_PRIORITY_RANK[b.priority] - ACTION_PRIORITY_RANK[a.priority])
    .slice(0, 5)
    .map(({ priority, text }) => ({ priority, text }));
}

function buildGuidance({ viewerRole, emergencyActive, mlRiskState, factors, online }) {
  if (emergencyActive) {
    return rules.EMERGENCY_ACTIONS[viewerRole].map(({ dedupeKey, priority, text }) => ({ priority, text }));
  }

  const candidates = [];

  for (const factor of factors) {
    if (factor.sensor === "heartRate" || factor.sensor === "bodyTemperature") continue;
    const rule = rules.ENVIRONMENTAL_ACTIONS[factor.sensor]?.[factor.severity];
    if (rule) {
      candidates.push({ dedupeKey: rule.dedupeKey, priority: rule.priority, text: rule[viewerRole] });
    }
  }

  const heartRateFactor = factors.find((f) => f.sensor === "heartRate");
  if (heartRateFactor?.attention) {
    candidates.push({
      dedupeKey: rules.CHECK_CONDITION_ACTION.dedupeKey,
      priority: rules.CHECK_CONDITION_ACTION.priority,
      text: rules.CHECK_CONDITION_ACTION[viewerRole],
    });
  }

  if (online === false) {
    candidates.push({
      dedupeKey: rules.COMMUNICATION_LOST_ACTION.dedupeKey,
      priority: rules.COMMUNICATION_LOST_ACTION.priority,
      text: rules.COMMUNICATION_LOST_ACTION[viewerRole],
    });
  }

  // Fallback: the ML risk state is elevated but nothing above explained
  // why (no environmental factor, no heart-rate attention) — never leave
  // an elevated state with an empty guidance list (#3).
  if (candidates.length === 0 && (mlRiskState === RISK_STATES.CRITICAL || mlRiskState === RISK_STATES.WARNING)) {
    const rule = rules.REVIEW_ML_SIGNAL_ACTION[mlRiskState];
    candidates.push({ dedupeKey: rule.dedupeKey, priority: rule.priority, text: rule[viewerRole] });
  }

  if (candidates.length === 0) {
    candidates.push({
      dedupeKey: rules.SAFE_DEFAULT_ACTION.dedupeKey,
      priority: rules.SAFE_DEFAULT_ACTION.priority,
      text: rules.SAFE_DEFAULT_ACTION[viewerRole],
    });
  }

  return dedupeAndRankActions(candidates);
}

// GET /api/users/:id/safety-guidance
async function getSafetyGuidance(userId, viewerRole) {
  const auth = await authorizeTarget(userId);
  if (!auth.ok) return auth;
  const { user } = auth;

  if (!user.helmetId) {
    return {
      ok: true,
      status: 200,
      body: baseResponse({
        operationalState: "NO_HELMET",
        mlRiskState: null,
        emergencyActive: false,
        online: null,
        lastUpdated: null,
        summaryText: rules.NO_HELMET,
      }),
    };
  }

  const [state, latest, lastSeenMap] = await Promise.all([
    WorkerProcessingState.findOne({ workerId: user.userId }),
    HelmetData.findOne({ workerId: user.userId }).sort({ timestamp: -1 }),
    helmetService.getLastSeenMap([user.helmetId]),
  ]);

  const emergencyActive = state ? state.emergencyActive : false;
  const mlRiskState = state ? state.currentRiskState : null;

  if (!latest) {
    return {
      ok: true,
      status: 200,
      body: baseResponse({
        operationalState: emergencyActive ? "EMERGENCY" : "NO_DATA",
        mlRiskState,
        emergencyActive,
        online: null,
        lastUpdated: null,
        summaryText: emergencyActive ? rules.SUMMARY.EMERGENCY(viewerRole) : rules.NO_DATA,
      }),
    };
  }

  const lastSeenAt = lastSeenMap.get(user.helmetId) || null;
  const online = helmetService.isRecentEnoughToBeOnline(lastSeenAt);
  const raw = latest.raw || {};

  const factors = [
    ...buildEnvironmentalFactors(raw),
    ...[buildHeartRateFactor(raw, user), buildBodyTempFactor(raw, user)].filter(Boolean),
  ];
  if (online === false) {
    factors.push({
      sensor: "helmetCommunication",
      label: "Helmet Communication",
      value: null,
      unit: null,
      severity: RISK_STATES.WARNING,
      detail: "Helmet communication lost",
    });
  }
  // Most severe / most relevant first; the frontend shows only the top of
  // this list (#9 — 1-4 factors), never a paragraph-heavy dump.
  factors.sort((a, b) => severityRank(b) - severityRank(a));

  const operationalState = computeOperationalState({ emergencyActive, mlRiskState, factors });
  const guidance = buildGuidance({ viewerRole, emergencyActive, mlRiskState, factors, online });

  const attentionCount = factors.filter(
    (f) => f.severity === RISK_STATES.CRITICAL || f.severity === RISK_STATES.WARNING || (f.sensor === "heartRate" && f.attention)
  ).length;

  let summaryText;
  if (operationalState === "EMERGENCY") summaryText = rules.SUMMARY.EMERGENCY(viewerRole);
  else if (operationalState === RISK_STATES.CRITICAL) summaryText = rules.SUMMARY.CRITICAL(viewerRole, Math.max(attentionCount, 1));
  else if (operationalState === RISK_STATES.WARNING) summaryText = rules.SUMMARY.WARNING(viewerRole, Math.max(attentionCount, 1));
  else if (operationalState === RISK_STATES.SAFE) summaryText = rules.SUMMARY.SAFE();
  else summaryText = rules.SUMMARY.UNKNOWN();

  return {
    ok: true,
    status: 200,
    body: {
      timestamp: new Date().toISOString(),
      operationalState,
      mlRiskState,
      emergencyActive,
      online,
      lastUpdated: latest.timestamp,
      readingsLabel: online === false ? "Last known readings" : "Current readings",
      summary: summaryText,
      factors: factors.slice(0, 4),
      guidance,
    },
  };
}

module.exports = { getSafetyGuidance, authorizeTarget };
