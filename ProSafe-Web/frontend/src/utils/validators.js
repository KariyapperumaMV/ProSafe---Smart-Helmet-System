// Mirrors backend/services/userService.js's rules for immediate feedback —
// the backend re-validates everything independently and is the source of
// truth (#19: "Never trust frontend validation alone").
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NIC_RE = /^([0-9]{9}[vVxX]|[0-9]{12})$/;
const PHONE_RE = /^\+?[0-9]{9,15}$/;

export function isValidPassword(password) {
  return typeof password === "string" && password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}

// Same ranges the backend (and ProSafe ML V2's live-channel plausibility
// rules) accept. Both or neither: a single baseline cannot be used.
export const BASELINE_LIMITS = {
  baselineHeartRate: { min: 30, max: 220, label: "Baseline heart rate", unit: "BPM" },
  baselineBodyTemperature: { min: 30, max: 43, label: "Baseline body temperature", unit: "°C" },
};

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

export function validateBaselines(values) {
  const errors = {};
  for (const [field, limits] of Object.entries(BASELINE_LIMITS)) {
    if (isBlank(values[field])) continue;
    const n = Number(values[field]);
    if (!Number.isFinite(n)) errors[field] = `${limits.label} must be a number`;
    else if (n < limits.min || n > limits.max) errors[field] = `Must be between ${limits.min} and ${limits.max} ${limits.unit}`;
  }
  const hr = !isBlank(values.baselineHeartRate);
  const bt = !isBlank(values.baselineBodyTemperature);
  if (!Object.keys(errors).length && hr !== bt) {
    errors[hr ? "baselineBodyTemperature" : "baselineHeartRate"] = "Enter both baselines, or leave both empty";
  }
  return errors;
}

export function validateUserForm(values, { isEdit = false } = {}) {
  const errors = {};

  if (!values.name?.trim()) errors.name = "Name is required";
  if (!values.email || !EMAIL_RE.test(values.email)) errors.email = "Enter a valid email address";
  if (!values.nic || !NIC_RE.test(values.nic)) errors.nic = "NIC must be 9 digits + V/X or 12 digits";
  if (!values.phone || !PHONE_RE.test(values.phone)) errors.phone = "Enter a valid phone number";
  if (!values.role) errors.role = "Select a role";
  if (values.role === "WORKER") Object.assign(errors, validateBaselines(values));

  if (!isEdit) {
    if (!values.password || !isValidPassword(values.password)) {
      errors.password = "At least 8 characters, with a letter and a number";
    }
  } else if (values.password && !isValidPassword(values.password)) {
    errors.password = "At least 8 characters, with a letter and a number";
  }

  return errors;
}
