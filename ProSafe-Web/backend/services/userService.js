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

module.exports = {
  generateUserId,
  validateUserFields,
  findConflicts,
  validateHelmetAssignment,
  toPublicUser,
};
