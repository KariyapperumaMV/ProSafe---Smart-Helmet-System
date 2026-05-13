// src/admin/components/SensorUtils.js

export const classify = {
  gas: (v) => (v < 150 ? "safe" : v <= 300 ? "warning" : "critical"),

  ambient: (v) => (v < 27 ? "safe" : v <= 35 ? "warning" : "critical"),

  uv: (v) => (v < 3 ? "safe" : v <= 8 ? "warning" : "critical"),

  sound: (v) => (v < 85 ? "safe" : v <= 95 ? "warning" : "critical"),
  
  heart: (v) =>
    v >= 88 && v <= 149
      ? "safe"
      : (v > 149 && v <= 175) || (v < 88 && v >= 85)
      ? "warning"
      : "critical",
  body: (v) =>
    v >= 35 && v <= 38
      ? "safe"
      : (v > 38 && v <= 39) || (v < 35 && v >= 30)
      ? "warning"
      : "critical"
};

/**
 * Convert value to needle angle (-90° to +90°)
 */
export const valueToAngle = (value, min, max) => {
  if (value === undefined || value === null) return -90;
  const clamped = Math.min(Math.max(value, min), max);
  return ((clamped - min) / (max - min)) * 180 - 90;
};