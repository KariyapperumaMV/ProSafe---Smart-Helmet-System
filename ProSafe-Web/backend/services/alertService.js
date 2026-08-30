const Alert = require("../models/Alert");

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

module.exports = { generateAlert };
