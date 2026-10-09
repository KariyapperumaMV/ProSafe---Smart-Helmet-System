const User = require("../models/User");
const Helmet = require("../models/Helmet");
const { USER_ROLES } = require("../constants/roles");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Sri Lankan NIC: old 9 digits + V/X, or new 12 digits.
const NIC_RE = /^([0-9]{9}[vVxX]|[0-9]{12})$/;
const PHONE_RE = /^\+?[0-9]{9,15}$/;

// Deliberately not exhaustive (upper/lower/symbol requirements) — "reasonable
// minimum" per the spec, not a password-policy subsystem.
function isValidPassword(password) {
  return typeof password === "string" && password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}

// role-prefixed sequential id: W-001, ADM-001, ... Not concurrency-safe under
// heavy parallel writes (a dev-scale admin tool, not a high-throughput
// system) — good enough here, same class of tradeoff as the rest of the
// pipeline's simple counters.
async function generateUserId(role) {
  const prefix = role === USER_ROLES.ADMIN ? "ADM" : "W";
  const last = await User.findOne({ userId: new RegExp(`^${prefix}-\\d+$`) })
    .sort({ userId: -1 })
    .collation({ locale: "en_US", numericOrdering: true });

  const nextNum = last ? parseInt(last.userId.split("-")[1], 10) + 1 : 1;
  return `${prefix}-${String(nextNum).padStart(3, "0")}`;
}

// Validates the fields the client actually sent. `isUpdate` relaxes
// required-ness for fields the frontend omits on purpose (password, role
// unchanged, etc.) — the caller decides what "sent" means for its endpoint.
function validateUserFields(data, { isUpdate = false } = {}) {
  const errors = {};

  if (!isUpdate || data.name !== undefined) {
    if (!data.name || typeof data.name !== "string" || !data.name.trim()) {
      errors.name = "Name is required";
    }
  }

  if (!isUpdate || data.email !== undefined) {
    if (!data.email || !EMAIL_RE.test(data.email)) {
      errors.email = "A valid email is required";
    }
  }

  if (!isUpdate || data.nic !== undefined) {
    if (!data.nic || !NIC_RE.test(data.nic)) {
      errors.nic = "NIC must be 9 digits + V/X or 12 digits";
    }
  }

  if (!isUpdate || data.phone !== undefined) {
    if (!data.phone || !PHONE_RE.test(data.phone)) {
      errors.phone = "A valid phone number is required";
    }
  }

  if (!isUpdate || data.role !== undefined) {
    if (!data.role || !Object.values(USER_ROLES).includes(data.role)) {
      errors.role = "Role must be ADMIN or WORKER";
    }
  }

  if (!isUpdate) {
    if (!data.password || !isValidPassword(data.password)) {
      errors.password = "Password must be at least 8 characters and include a letter and a number";
    }
  } else if (data.password !== undefined && data.password !== "" && !isValidPassword(data.password)) {
    errors.password = "Password must be at least 8 characters and include a letter and a number";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// 409-worthy conflicts, checked explicitly instead of letting the unique
// index throw a raw MongoServerError up to the client.
async function findConflicts({ email, nic, excludeUserId = null }) {
  const conflicts = {};
  const filter = (field, value) => {
    const q = { [field]: value };
    if (excludeUserId) q.userId = { $ne: excludeUserId };
    return q;
  };

  if (email) {
    const existing = await User.findOne(filter("email", email.toLowerCase()));
    if (existing) conflicts.email = "Email already exists";
  }
  if (nic) {
    const existing = await User.findOne(filter("nic", nic));
    if (existing) conflicts.nic = "NIC already exists";
  }

  return conflicts;
}

// Only a WORKER may hold a helmetId; ADMIN must always be null. Also rejects
// assigning a helmet already held by a different active worker.
async function validateHelmetAssignment({ role, helmetId, excludeUserId = null }) {
  if (role === USER_ROLES.ADMIN) {
    return helmetId ? { valid: false, error: "Admin users cannot be assigned a helmet" } : { valid: true };
  }

  if (!helmetId) {
    return { valid: true };
  }

  const helmet = await Helmet.findOne({ helmetId });
  if (!helmet) {
    return { valid: false, error: "Helmet does not exist" };
  }

  const filter = { helmetId, active: true };
  if (excludeUserId) filter.userId = { $ne: excludeUserId };
  const holder = await User.findOne(filter);
  if (holder) {
    return { valid: false, error: "Helmet is already assigned to another worker" };
  }

  return { valid: true };
}

// Strips fields that must never leave the backend, regardless of caller.
function toPublicUser(userDoc) {
  const user = userDoc.toObject ? userDoc.toObject() : userDoc;
  const { passwordHash, __v, ...rest } = user;
  return rest;
}

// Personal physiological baselines (WORKER only). They are worker CONTEXT
// for ProSafe ML V2 (deviation features are computed from them), never model
// features, and never defaulted: a worker without both values is reported
// UNCERTAIN / BASELINE_UNAVAILABLE until an admin sets them. The accepted
// ranges are the same plausibility ranges ProSafe ML V2 applies to the live
// heart-rate and body-temperature channels (PreprocessingConfig.channels).
const BASELINE_FIELDS = {
  baselineHeartRate: { min: 30, max: 220, label: "Baseline heart rate", unit: "bpm" },
  baselineBodyTemperature: { min: 30, max: 43, label: "Baseline body temperature", unit: "°C" },
};

// undefined -> not provided; null / "" / "null" -> explicitly cleared;
// a number or numeric string (multipart forms send strings) -> that number.
function parseBaselineInput(value) {
  if (value === undefined) return { provided: false, value: undefined, invalid: false };
  if (value === null || value === "" || value === "null") return { provided: true, value: null, invalid: false };
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value.trim()) : NaN;
  return Number.isFinite(n) ? { provided: true, value: n, invalid: false } : { provided: true, value: undefined, invalid: true };
}

// -> { valid, errors, values: { baselineHeartRate, baselineBodyTemperature } }
// `values` is what the user document must hold after this create/update:
//  - non-WORKER: always null (a role change to ADMIN clears them);
//  - WORKER: provided values, else (update) the current ones; both or neither.
function validateBaselines(body, { role, isUpdate = false, current = {} } = {}) {
  const errors = {};
  const parsed = {};
  for (const field of Object.keys(BASELINE_FIELDS)) parsed[field] = parseBaselineInput(body[field]);

  if (role !== USER_ROLES.WORKER) {
    for (const field of Object.keys(BASELINE_FIELDS)) {
      if (parsed[field].invalid || (parsed[field].provided && parsed[field].value !== null)) {
        errors[field] = "Physiological baselines apply to worker accounts only";
      }
    }
    return { valid: Object.keys(errors).length === 0, errors, values: { baselineHeartRate: null, baselineBodyTemperature: null } };
  }

  const values = {};
  for (const [field, limits] of Object.entries(BASELINE_FIELDS)) {
    const p = parsed[field];
    if (p.invalid) {
      errors[field] = `${limits.label} must be a number`;
    } else if (p.provided && p.value !== null && (p.value < limits.min || p.value > limits.max)) {
      errors[field] = `${limits.label} must be between ${limits.min} and ${limits.max} ${limits.unit}`;
    }
    values[field] = p.provided ? p.value : isUpdate ? current[field] ?? null : null;
  }

  const hasHr = typeof values.baselineHeartRate === "number";
  const hasBt = typeof values.baselineBodyTemperature === "number";
  if (!Object.keys(errors).length && hasHr !== hasBt) {
    errors[hasHr ? "baselineBodyTemperature" : "baselineHeartRate"] =
      "Set both baselines (heart rate and body temperature), or leave both empty";
  }

  return { valid: Object.keys(errors).length === 0, errors, values };
}

module.exports = {
  generateUserId,
  validateUserFields,
  validateBaselines,
  BASELINE_FIELDS,
  findConflicts,
  validateHelmetAssignment,
  toPublicUser,
  // Shared with authController.changePassword so Admin Create/Edit User and
  // Settings > Change Password enforce the exact same rule from one place.
  isValidPassword,
};
