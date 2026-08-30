// Stage 10: deterministic internal feature object. Field names follow
// logic.docx's Stage 10 example. Baselines are included too (not in the
// doc's example) because the trained ML model requires them as raw features
// — see mlService.js, which maps this object onto the model's actual
// FEATURE_COLUMNS contract.
function buildFeatureVector({ raw, deviations, exposure, baseline }) {
  return {
    heartRate: raw.heartRate,
    heartRateDeviation: deviations.heartRateDeviation,
    bodyTemp: raw.bodyTemp,
    bodyTempDeviation: deviations.bodyTempDeviation,
    noise: raw.noise,
    gas: raw.gas,
    ambientTemp: raw.ambientTemp,
    uv: raw.uv,
    noiseExposureDuration: exposure.noiseExposureDuration,
    heartRateExposureDuration: exposure.heartRateExposureDuration,
    baselineHeartRate: baseline.baselineHeartRate,
    baselineBodyTemperature: baseline.baselineBodyTemperature,
  };
}

module.exports = { buildFeatureVector };
