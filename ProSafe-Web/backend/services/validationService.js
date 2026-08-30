const { sensorLimits } = require("../config/processingConfig");

const REQUIRED_SENSOR_FIELDS = ["heartRate", "bodyTemp", "ambientTemp", "noise", "gas", "uv"];

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

// Stage 6: backend validation, independent of the helmet's own on-device
// validation. Returns { valid, errors } instead of throwing so the caller
// (sensorProcessingService) decides how to respond — this function only
// judges the packet, it never touches the DB or HTTP layer.
function validatePacket(body) {
  const errors = [];

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, errors: ["Request body must be a JSON object"] };
  }

  if (!body.helmetId || typeof body.helmetId !== "string") {
    errors.push("helmetId is required and must be a string");
  }

  // Real firmware doesn't know its assigned workerId — the backend resolves
  // it from helmetId (see baselineService.resolveWorkerId). Still type-check
  // it when a caller does supply one (e.g. a test harness or future firmware).
  if (body.workerId !== undefined && body.workerId !== null && typeof body.workerId !== "string") {
    errors.push("workerId, if provided, must be a string");
  }

  if (!body.timestamp) {
    errors.push("timestamp is required");
  } else {
    const parsed = new Date(body.timestamp);
    if (Number.isNaN(parsed.getTime())) {
      errors.push("timestamp is invalid");
    }
  }

  for (const field of REQUIRED_SENSOR_FIELDS) {
    const value = body[field];
    if (value === undefined || value === null) {
      errors.push(`${field} is required`);
      continue;
    }
    if (!isFiniteNumber(value)) {
      errors.push(`${field} must be a number`);
      continue;
    }
    const limits = sensorLimits[field];
    if (limits && (value < limits.min || value > limits.max)) {
      errors.push(`${field} value ${value} is outside the plausible range [${limits.min}, ${limits.max}]`);
    }
  }

  if (body.gps !== undefined && body.gps !== null) {
    if (typeof body.gps !== "object" || Array.isArray(body.gps)) {
      errors.push("gps must be an object with lat and lon");
    } else {
      const { lat, lon } = body.gps;
      if (!isFiniteNumber(lat) || lat < sensorLimits.gpsLat.min || lat > sensorLimits.gpsLat.max) {
        errors.push("gps.lat is invalid");
      }
      if (!isFiniteNumber(lon) || lon < sensorLimits.gpsLon.min || lon > sensorLimits.gpsLon.max) {
        errors.push("gps.lon is invalid");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// Emergency packets are a completely different, much smaller shape than
// normal sensor packets — no sensor fields at all, so this is deliberately
// not reusing validatePacket(). helmetId + timestamp are required; the
// emergency indicator accepts either the flat `emergency: true` shape
// (the actual firmware's packet, per logic.docx) or a nested
// `status.overall === "EMERGENCY"` for robustness with other callers.
function validateEmergencyPacket(body) {
  const errors = [];

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, errors: ["Request body must be a JSON object"] };
  }

  if (!body.helmetId || typeof body.helmetId !== "string") {
    errors.push("helmetId is required and must be a string");
  }

  if (!body.timestamp) {
    errors.push("timestamp is required");
  } else if (Number.isNaN(new Date(body.timestamp).getTime())) {
    errors.push("timestamp is invalid");
  }

  const isEmergency = body.emergency === true || body.status?.overall === "EMERGENCY";
  if (!isEmergency) {
    errors.push("Packet does not indicate an emergency (expected emergency: true)");
  }

  if (body.gps !== undefined && body.gps !== null) {
    if (typeof body.gps !== "object" || Array.isArray(body.gps)) {
      errors.push("gps must be an object with lat and lon");
    } else {
      const { lat, lon } = body.gps;
      if (!isFiniteNumber(lat) || lat < sensorLimits.gpsLat.min || lat > sensorLimits.gpsLat.max) {
        errors.push("gps.lat is invalid");
      }
      if (!isFiniteNumber(lon) || lon < sensorLimits.gpsLon.min || lon > sensorLimits.gpsLon.max) {
        errors.push("gps.lon is invalid");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validatePacket, validateEmergencyPacket };
