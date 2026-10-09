const { RISK_STATES, SYSTEM_STATES } = require("../constants/riskStates");
const { ml: mlConfig } = require("../config/processingConfig");
const { timezone } = require("../config/appConfig");

// Stage 11: the only place that knows how to talk to the ProSafe ML V2
// service (ProSafe-ML-V2/serve.py). The backend sends RAW 1 Hz samples plus
// the worker's stored baselines; V2 is the single source of feature truth
// (validation, missing-data hold, deviations, session gas baseline, rolling
// stats, trends, exposure counters, noise dose, data-quality gate) and runs
// the classifier only when its gate says READY. The v1 path (backend-built
// 10-feature vector with raw baselines as features, POST /predict) is retired.

// Site-local ISO-8601 with an explicit offset (e.g. 2026-10-09T14:30:05.000+05:30):
// V2 derives the workday (noise-dose day) from the local calendar date and
// the absolute time from the offset.
function toSiteIsoString(date, timeZone = timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const wholeSecondMs = Math.floor(date.getTime() / 1000) * 1000;
  const localAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  const offsetMin = Math.round((localAsUtc - wholeSecondMs) / 60000);
  const local = new Date(date.getTime() + offsetMin * 60000).toISOString().replace("Z", "");
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

// One backend sample -> one V2 raw reading. Baselines are context, not features.
function toV2Reading({ workerId, helmetId, timestamp, raw, baseline }) {
  return {
    worker_id: workerId,
    helmet_id: helmetId,
    timestamp: toSiteIsoString(timestamp),
    heart_rate: raw.heartRate,
    body_temperature: raw.bodyTemp,
    ambient_temperature: raw.ambientTemp,
    uv_index: raw.uv,
    gas: raw.gas,
    noise: raw.noise,
    baseline_hr: baseline.hasBaseline ? baseline.baselineHeartRate : null,
    baseline_body_temperature: baseline.hasBaseline ? baseline.baselineBodyTemperature : null,
  };
}

function normalizeRiskLabel(label) {
  if (typeof label !== "string") return null;
  const upper = label.toUpperCase();
  return Object.values(RISK_STATES).includes(upper) ? upper : null;
}

function normalizeProbabilities(raw) {
  if (!raw || typeof raw !== "object") return null;
  const normalized = {};
  for (const [key, value] of Object.entries(raw)) {
    const label = normalizeRiskLabel(key);
    if (label && typeof value === "number" && Number.isFinite(value)) normalized[label] = value;
  }
  return Object.keys(normalized).length ? normalized : null;
}

const numOrNull = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function identityProblems(body) {
  const problems = [];
  if (body.model_name !== mlConfig.expectedModelName) {
    problems.push(`model_name ${JSON.stringify(body.model_name)} != ${mlConfig.expectedModelName}`);
  }
  if (body.feature_set !== mlConfig.expectedFeatureSet) {
    problems.push(`feature_set ${JSON.stringify(body.feature_set)} != ${mlConfig.expectedFeatureSet}`);
  }
  return problems;
}

// One V2 result -> the backend's per-sample decision. Returns null for a
// malformed result (treated like an unavailable ML service for that batch).
function normalizeResult(r) {
  if (!r || typeof r !== "object") return null;
  const cls = typeof r.predicted_class === "string" ? r.predicted_class.toUpperCase() : null;
  const common = {
    modelName: r.model_name ?? null,
    modelVersion: r.model_version ?? null,
    featureSet: r.feature_set ?? null,
    sessionId: r.session_id ?? null,
  };
  if (cls === SYSTEM_STATES.UNCERTAIN) {
    const reasons = Array.isArray(r.uncertain_reasons) ? r.uncertain_reasons.filter((x) => typeof x === "string") : [];
    const reason = typeof r.uncertain_reason === "string" ? r.uncertain_reason : reasons[0] || "UNSPECIFIED";
    return {
      ...common,
      systemState: SYSTEM_STATES.UNCERTAIN,
      modelReady: false,
      predictedState: null,
      probabilities: null,
      confidence: null,
      dataQuality: "UNCERTAIN",
      uncertainReason: reason,
      uncertainReasons: reasons.length ? reasons : [reason],
      derived: null,
    };
  }
  const predictedState = normalizeRiskLabel(cls);
  const probabilities = normalizeProbabilities(r.probabilities);
  if (!predictedState || !probabilities || r.model_ready !== true) return null;
  if (identityProblems(r).length) return null;
  const d = r.derived && typeof r.derived === "object" ? r.derived : {};
  return {
    ...common,
    systemState: predictedState,
    modelReady: true,
    predictedState,
    probabilities,
    confidence: numOrNull(probabilities[predictedState]),
    dataQuality: r.data_quality === "IMPUTED" ? "IMPUTED" : "VALID",
    uncertainReason: null,
    uncertainReasons: undefined,
    derived: {
      heartRateDeviation: numOrNull(d.hr_deviation_pct),
      bodyTempDeviation: numOrNull(d.body_temp_deviation_pct),
      noiseExposureDuration: numOrNull(d.noise_critical_exposure_sec),
      heartRateExposureDuration: numOrNull(d.hr_warning_exposure_sec),
      gasRatioToBaseline: numOrNull(d.gas_ratio_to_baseline),
      noiseDosePct: numOrNull(d.noise_dose_pct),
    },
  };
}

function baseUrl() {
  return mlConfig.serviceUrl.replace(/\/+$/, "");
}

async function fetchJson(path, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), mlConfig.timeoutMs);
  try {
    const response = await fetch(`${baseUrl()}${path}`, { ...options, signal: controller.signal });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

// Sends the samples of ONE worker, in the order received, as one V2 batch.
// -> { ok: true, results: [decision per sample, same order] } or { ok: false, reason }.
// Any failure (not configured, unreachable, timeout, non-200, malformed body,
// wrong model, result count mismatch) is { ok: false } -- the caller reports
// UNCERTAIN / ML_SERVICE_UNAVAILABLE, never SAFE.
async function runRawBatch(readings) {
  if (!mlConfig.serviceUrl) return { ok: false, reason: "ML_SERVICE_URL not configured" };

  let response;
  let body;
  try {
    ({ response, body } = await fetchJson("/predict/raw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readings }),
    }));
  } catch (err) {
    return {
      ok: false,
      reason: err.name === "AbortError" ? "ML service request timed out" : `ML service unreachable: ${err.message}`,
    };
  }

  if (!response.ok) return { ok: false, reason: `ML service returned HTTP ${response.status}` };
  if (!body || !Array.isArray(body.results)) return { ok: false, reason: "ML service returned a malformed response" };
  const problems = identityProblems(body);
  if (problems.length) return { ok: false, reason: `ML service is serving the wrong model: ${problems.join("; ")}` };
  if (body.results.length !== readings.length) {
    return { ok: false, reason: `ML service returned ${body.results.length} results for ${readings.length} readings` };
  }
  const results = body.results.map(normalizeResult);
  if (results.some((r) => r === null)) return { ok: false, reason: "ML service returned a malformed result" };
  return { ok: true, results };
}

// GET /health -> { ok, status, problems }. ok only when V2 reports itself
// healthy AND serves the expected model (name, feature set, feature count).
async function checkHealth() {
  if (!mlConfig.serviceUrl) return { ok: false, problems: ["ML_SERVICE_URL not configured"], health: null };
  try {
    const { response, body } = await fetchJson("/health", { method: "GET" });
    if (!body) return { ok: false, problems: [`/health returned HTTP ${response.status} without JSON`], health: null };
    const problems = [...identityProblems(body)];
    if (body.feature_count !== mlConfig.expectedFeatureCount) {
      problems.push(`feature_count ${body.feature_count} != ${mlConfig.expectedFeatureCount}`);
    }
    if (!response.ok || body.status !== "ok") problems.push(`status ${body.status} (HTTP ${response.status})`);
    if (body.raw_endpoint_enabled === false) problems.push("/predict/raw is disabled");
    return { ok: problems.length === 0, problems, health: body };
  } catch (err) {
    return { ok: false, problems: [`unreachable: ${err.message}`], health: null };
  }
}

module.exports = { runRawBatch, checkHealth, toV2Reading, toSiteIsoString, normalizeResult };
