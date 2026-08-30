const userSensorService = require("../services/userSensorService");

// Thin: every route here just picks the right service call and translates
// its { ok, status, body|message } result into a response. No aggregation
// logic lives in route declarations or here.
function respond(res, result) {
  if (!result.ok) {
    return res.status(result.status).json({ message: result.message });
  }
  return res.status(result.status).json(result.body);
}

function makePersonalizedHandler(sensorKey) {
  return async (req, res, next) => {
    try {
      const result = await userSensorService.getPersonalizedSensorHistory(req.params.id, sensorKey);
      respond(res, result);
    } catch (err) {
      next(err);
    }
  };
}

function makeEnvironmentalHandler(sensorKey) {
  return async (req, res, next) => {
    try {
      const result = await userSensorService.getEnvironmentalSensorHistory(req.params.id, sensorKey);
      respond(res, result);
    } catch (err) {
      next(err);
    }
  };
}

exports.getHeartRate = makePersonalizedHandler("heartRate");
exports.getBodyTemperature = makePersonalizedHandler("bodyTemperature");

exports.getNoise = makeEnvironmentalHandler("noise");
exports.getGas = makeEnvironmentalHandler("gas");
exports.getUv = makeEnvironmentalHandler("uv");
exports.getAmbientTemperature = makeEnvironmentalHandler("ambientTemperature");

exports.getSafetyPredictions = async (req, res, next) => {
  try {
    const result = await userSensorService.getSafetyPredictionHistory(req.params.id);
    respond(res, result);
  } catch (err) {
    next(err);
  }
};
