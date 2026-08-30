const { RISK_STATES } = require("../constants/riskStates");
const { ml: mlConfig } = require("../config/processingConfig");

// Stage 11: the only place that knows how to talk to the ProSafe ML service.
// Everything else in the pipeline only ever sees { ok, predictedState,
// confidence, probabilities, reason } — if the ML deployment changes (model
// swap, different framework, different host), only this file changes.

// Translates the internal feature vector (logic.docx field names) onto the
// exact contract the trained model expects (see ProSafe-ML/src/utils.py
// FEATURE_COLUMNS) — different names, different set (raw baselines instead
// of exposure durations), fixed order.
function toMlRequestPayload(featureVector) {
  return {
    ambient_temp_c: featureVector.ambientTemp,
    uv_index: featureVector.uv,
    gas_ppm: featureVector.gas,
    noise_db: featureVector.noise,
    body_temp_c: featureVector.bodyTemp,
    heart_rate_bpm: featureVector.heartRate,
    baseline_hr_bpm: featureVector.baselineHeartRate,
    baseline_body_temp_c: featureVector.baselineBodyTemperature,
    hr_deviation_pct: featureVector.heartRateDeviation,
    body_temp_deviation_pct: featureVector.bodyTempDeviation,
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
    if (label && typeof value === "number" && Number.isFinite(value)) {
      normalized[label] = value;
    }
  }
  return Object.keys(normalized).length ? normalized : null;
}

async function runPrediction(featureVector) {
  if (!mlConfig.serviceUrl) {
    return { ok: false, reason: "ML_SERVICE_URL not configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), mlConfig.timeoutMs);

  let response;
  try {
    response = await fetch(`${mlConfig.serviceUrl.replace(/\/+$/, "")}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toMlRequestPayload(featureVector)),
      signal: controller.signal,
    });
  } catch (err) {
    return {
      ok: false,
      reason: err.name === "AbortError" ? "ML service request timed out" : `ML service unreachable: ${err.message}`,
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return { ok: false, reason: `ML service returned HTTP ${response.status}` };
  }

  let body;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: "ML service returned malformed JSON" };
  }

  const predictedState = normalizeRiskLabel(body.predicted_class ?? body.risk_level);
  const probabilities = normalizeProbabilities(body.probabilities);

  if (!predictedState) {
    return { ok: false, reason: "ML service response missing a valid predicted class" };
  }

  const confidence = probabilities ? probabilities[predictedState] ?? null : null;

  return { ok: true, predictedState, confidence, probabilities };
}

module.exports = { runPrediction };
