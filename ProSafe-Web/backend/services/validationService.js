const { sensorLimits, ingest } = require("../config/processingConfig");

const SENSOR_FIELDS = ["heartRate", "bodyTemp", "ambientTemp", "noise", "gas", "uv"];

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

// A channel value the helmet could not measure is null. Legacy firmware used
// -1 as its "invalid" sentinel; anything non-numeric is treated the same way.
// Plausibility (out-of-range, no skin contact, artifacts) is NOT judged here:
// ProSafe ML V2 applies its per-channel rules, so one bad channel never
// discards the other five.
function channelValue(value) {
  if (!isFiniteNumber(value) || value === -1) return null;
  return value;
}

function parseGps(gps, errors, prefix) {
  if (gps === undefined || gps === null) return undefined;
  if (typeof gps !== "object" || Array.isArray(gps)) {
    errors.push(`${prefix}gps must be an object with lat and lon`);
    return undefined;
  }
  const { lat, lon } = gps;
  const latOk = isFiniteNumber(lat) && lat >= sensorLimits.gpsLat.min && lat <= sensorLimits.gpsLat.max;
  const lonOk = isFiniteNumber(lon) && lon >= sensorLimits.gpsLon.min && lon <= sensorLimits.gpsLon.max;
  if (!latOk) errors.push(`${prefix}gps.lat is invalid`);
  if (!lonOk) errors.push(`${prefix}gps.lon is invalid`);
  return latOk && lonOk ? { lat, lon } : undefined;
}

// Stage 6: backend validation of IDENTITY and STRUCTURE only. Accepts
//   batch  {helmetId, workerId?, samples: [{timestamp, heartRate, bodyTemp, ambientTemp, noise, gas, uv, gps?}, ...]}
//   legacy {helmetId, workerId?, timestamp, heartRate, bodyTemp, ambientTemp, noise, gas, uv, gps?}  (one sample)
// A structural error (no helmetId, no/invalid timestamp, malformed samples
// array) rejects the request so the helmet keeps and resends the batch.
// Returns { valid, errors, helmetId, workerId, format, samples:[{timestamp: Date, raw}] }
// in the order received -- the backend never reorders samples (ProSafe ML V2
// flags late ones as OUT_OF_ORDER_TIMESTAMP).
function validateHelmetBatch(body) {
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

  const format = body.samples !== undefined ? "batch" : "single";
  let rawSamples;
  if (format === "batch") {
    if (!Array.isArray(body.samples) || body.samples.length === 0) {
      errors.push("samples must be a non-empty array");
      rawSamples = [];
    } else if (body.samples.length > ingest.maxSamplesPerBatch) {
      errors.push(`at most ${ingest.maxSamplesPerBatch} samples per upload`);
      rawSamples = [];
    } else {
      rawSamples = body.samples;
    }
  } else {
    rawSamples = [body];
  }

  const samples = [];
  rawSamples.forEach((sample, index) => {
    const prefix = format === "batch" ? `samples[${index}].` : "";
    if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
      errors.push(`${prefix}sample must be a JSON object`);
      return;
    }
    if (!sample.timestamp) {
      errors.push(`${prefix}timestamp is required`);
      return;
    }
    const timestamp = new Date(sample.timestamp);
    if (Number.isNaN(timestamp.getTime())) {
      errors.push(`${prefix}timestamp is invalid`);
      return;
    }
    const raw = {};
    for (const field of SENSOR_FIELDS) raw[field] = channelValue(sample[field]);
    const gps = parseGps(sample.gps, errors, prefix);
    if (gps) raw.gps = gps;
    samples.push({ timestamp, raw });
  });

  return {
    valid: errors.length === 0,
    errors,
    helmetId: body.helmetId,
    workerId: body.workerId || undefined,
    format,
    samples,
  };
}

// Emergency packets are a completely different, much smaller shape than
// normal sensor packets — no sensor fields at all, so this is deliberately
// not reusing validateHelmetBatch(). helmetId + timestamp are required; the
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

module.exports = { validateHelmetBatch, validateEmergencyPacket, channelValue };
