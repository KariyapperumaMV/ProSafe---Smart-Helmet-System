// Stage 8: percentage deviation from the worker's baseline. Guards against
// divide-by-zero / missing baseline by returning null rather than throwing —
// the caller (sensorProcessingService) decides whether a null deviation
// means "skip ML" or not.
function calculateDeviation(current, baseline) {
  if (typeof baseline !== "number" || baseline <= 0 || !Number.isFinite(current)) {
    return null;
  }
  return ((current - baseline) / baseline) * 100;
}

function calculatePhysiologicalDeviations({ heartRate, bodyTemp }, { baselineHeartRate, baselineBodyTemperature }) {
  return {
    heartRateDeviation: calculateDeviation(heartRate, baselineHeartRate),
    bodyTempDeviation: calculateDeviation(bodyTemp, baselineBodyTemperature),
  };
}

module.exports = { calculatePhysiologicalDeviations };
