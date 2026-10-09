// Human-readable text for backend / ProSafe ML V2 data-quality reason codes
// (same wording as the backend's alert labels). Unknown codes are shown as-is
// rather than guessed.
export const UNCERTAIN_REASON_TEXT = {
  BASELINE_UNAVAILABLE: "Worker baseline not set",
  ML_SERVICE_UNAVAILABLE: "ML service unavailable",
  LOW_CONFIDENCE: "Low prediction confidence",
  WORKER_NOT_FOUND: "Worker not found",
  BODY_CONTACT_FAILURE: "Sensor skin contact lost",
  SENSOR_UNAVAILABLE: "Sensor reading unavailable",
  TOO_MANY_MISSING_SENSORS: "Several sensors unavailable",
  PACKET_LOSS: "Samples missing",
  MAJOR_TIMESTAMP_GAP: "Gap in sensor data",
  OUT_OF_ORDER_TIMESTAMP: "Out-of-order samples",
  UNSTABLE_HR: "Unstable heart-rate signal",
  INVALID_PACKET: "Invalid sample",
  REQUIRED_FEATURES_UNAVAILABLE: "Required data unavailable",
  SENSOR_WARMUP: "Sensor warm-up",
  INSUFFICIENT_HISTORY: "Collecting initial data",
  GAS_BASELINE_UNAVAILABLE: "Gas baseline calibrating",
};

export function describeUncertainReason(reason) {
  if (!reason) return null;
  return UNCERTAIN_REASON_TEXT[reason] || reason;
}
