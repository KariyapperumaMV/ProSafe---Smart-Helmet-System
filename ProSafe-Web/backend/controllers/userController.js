const bcrypt = require("bcryptjs");
const User = require("../models/User");
const WorkerProcessingState = require("../models/WorkerProcessingState");
const HelmetData = require("../models/HelmetData");
const { USER_ROLES } = require("../constants/roles");
const userService = require("../services/userService");
const notificationService = require("../services/notificationService");

const PROFILE_IMAGE_BASE = "/uploads/profile-images";

// Settings > Account is self-service only — never a route to privilege
// escalation. Anything not in this list is REJECTED outright (400), not
// silently dropped, so an attempt like {"role":"ADMIN"} is visible in the
// response rather than quietly ignored (#2).
const DISALLOWED_SELF_UPDATE_FIELDS = [
  "userId", "email", "nic", "role", "helmetId",
  "baselineHeartRate", "baselineBodyTemperature", "passwordHash",
  "active", "deletedAt", "createdBy", "updatedBy", "deletedBy",
];
const ALLOWED_NOTIFICATION_PREF_KEYS = [
  "safetyAlerts", "emergencyAlerts", "emergencyResetUpdates", "accountNotifications", "reportNotifications",
];

// For a WORKER with a helmet, pull the operational snapshot (#15) from the
// processing pipeline's own collections instead of duplicating any of it on
// User. Returns null fields when the pipeline hasn't produced anything yet
// (new worker, helmet never sent a packet) rather than guessing.
async function buildWorkerOperationalData(user) {
  if (user.role !== USER_ROLES.WORKER || !user.helmetId) {
    return null;
  }

  const [state, latestData] = await Promise.all([
    WorkerProcessingState.findOne({ workerId: user.userId }),
    HelmetData.findOne({ workerId: user.userId }).sort({ timestamp: -1 }),
  ]);

  return {
    helmet: { helmetId: user.helmetId },
    currentRiskState: state ? state.currentRiskState : null,
    emergencyActive: state ? state.emergencyActive : false,
    latestSensorData: latestData
      ? { timestamp: latestData.timestamp, sensors: latestData.raw, prediction: latestData.prediction }
      : null,
  };
}

// GET /api/users — ADMIN only
exports.listUsers = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const { search, role, helmetAssigned } = req.query;

    const filter = { active: true };

    if (role && Object.values(USER_ROLES).includes(role)) {
      filter.role = role;
    }

    if (helmetAssigned === "true") {
      filter.helmetId = { $ne: null };
    } else if (helmetAssigned === "false") {
      filter.helmetId = null;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: regex }, { email: regex }, { userId: regex }, { nic: regex }];
    }

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      users: users.map(userService.toPublicUser),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/users/me — any authenticated user
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findOne({ userId: req.user.id, active: true });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const operational = await buildWorkerOperationalData(user);
    res.status(200).json({ user: userService.toPublicUser(user), ...(operational || {}) });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/users/me — any authenticated user, self-scoped via req.user.id
// only (never a client-supplied id, so there's nothing to spoof). Settings'
// Account/Notification cards both post here with a partial body.
exports.updateMe = async (req, res, next) => {
  try {
    const disallowedSent = DISALLOWED_SELF_UPDATE_FIELDS.filter((f) => req.body[f] !== undefined);
    if (disallowedSent.length) {
      return res.status(400).json({
        message: "One or more fields cannot be changed from Settings.",
        errors: Object.fromEntries(disallowedSent.map((f) => [f, "Not editable from Settings"])),
      });
    }

    const user = await User.findOne({ userId: req.user.id, active: true });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { name, phone, address } = req.body;
    const { valid, errors } = userService.validateUserFields({ name, phone }, { isUpdate: true });
    if (!valid) {
      return res.status(400).json({ message: "Validation failed", errors });
    }

    let notificationPreferences = req.body.notificationPreferences;
    if (typeof notificationPreferences === "string") {
      try {
        notificationPreferences = JSON.parse(notificationPreferences);
      } catch {
        return res.status(400).json({ message: "Validation failed", errors: { notificationPreferences: "Must be a valid object" } });
      }
    }

    if (name !== undefined) user.name = name.trim();
    if (phone !== undefined) user.phone = phone;
    if (address !== undefined) user.address = address || null;

    if (notificationPreferences !== undefined && notificationPreferences !== null && typeof notificationPreferences === "object") {
      for (const key of ALLOWED_NOTIFICATION_PREF_KEYS) {
        if (typeof notificationPreferences[key] === "boolean") {
          user.preferences.notifications[key] = notificationPreferences[key];
        }
      }
    }

    if (req.file) {
      user.profileImageUrl = `${PROFILE_IMAGE_BASE}/${req.file.filename}`;
    }

    await user.save();
    res.status(200).json({ user: userService.toPublicUser(user) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Duplicate field", errors: err.keyValue });
    }
    next(err);
  }
};

// GET /api/users/:id — ADMIN only
exports.getUserById = async (req, res, next) => {
  try {
    const user = await User.findOne({ userId: req.params.id, active: true });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const operational = await buildWorkerOperationalData(user);
    res.status(200).json({ user: userService.toPublicUser(user), ...(operational || {}) });
  } catch (err) {
    next(err);
  }
};

// POST /api/users — ADMIN only
exports.createUser = async (req, res, next) => {
  try {
    const { name, email, nic, phone, address, role, password, helmetId } = req.body;

    const { valid, errors } = userService.validateUserFields({ name, email, nic, phone, role, password });
    if (!valid) {
      return res.status(400).json({ message: "Validation failed", errors });
    }

    const conflicts = await userService.findConflicts({ email, nic });
    if (Object.keys(conflicts).length) {
      return res.status(409).json({ message: "Duplicate field", errors: conflicts });
    }

    const helmetCheck = await userService.validateHelmetAssignment({ role, helmetId: helmetId || null });
    if (!helmetCheck.valid) {
      return res.status(409).json({ message: helmetCheck.error });
    }

    const userId = await userService.generateUserId(role);
    const passwordHash = await bcrypt.hash(password, 10);
    const profileImageUrl = req.file ? `${PROFILE_IMAGE_BASE}/${req.file.filename}` : null;

    const user = await User.create({
      userId,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      nic,
      phone,
      address: address || null,
      role,
      profileImageUrl,
      helmetId: role === USER_ROLES.WORKER ? (helmetId || null) : null,
      createdBy: req.user.id,
    });

    // Fired only after the User document is actually persisted (#31) — a
    // notification failure here can never roll back or fail the response,
    // since notificationService itself never throws (it logs and swallows).
    await notificationService.notifyAdmins({
      type: "USER_CREATED",
      title: "User created",
      message: `${user.name} was added as ${user.role === USER_ROLES.ADMIN ? "an ADMIN" : "a WORKER"}.`,
      relatedEntityType: "USER",
      relatedEntityId: user.userId,
      metadata: { role: user.role },
      excludeUserId: req.user.id,
    });

    res.status(201).json({ user: userService.toPublicUser(user) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Duplicate field", errors: err.keyValue });
    }
    next(err);
  }
};

// PUT /api/users/:id — ADMIN only
exports.updateUser = async (req, res, next) => {
  try {
    const user = await User.findOne({ userId: req.params.id, active: true });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { name, email, nic, phone, address, role, password, helmetId } = req.body;
    const nextRole = role !== undefined ? role : user.role;

    const { valid, errors } = userService.validateUserFields(
      { name, email, nic, phone, role, password },
      { isUpdate: true }
    );
    if (!valid) {
      return res.status(400).json({ message: "Validation failed", errors });
    }

    const conflicts = await userService.findConflicts({ email, nic, excludeUserId: user.userId });
    if (Object.keys(conflicts).length) {
      return res.status(409).json({ message: "Duplicate field", errors: conflicts });
    }

    // Role change WORKER -> ADMIN (or ADMIN staying ADMIN) always clears the
    // helmet; only a WORKER can end this update holding one (#22).
    let nextHelmetId = user.helmetId;
    if (nextRole === USER_ROLES.ADMIN) {
      nextHelmetId = null;
    } else if (helmetId !== undefined) {
      nextHelmetId = helmetId || null;
    }

    const helmetCheck = await userService.validateHelmetAssignment({
      role: nextRole,
      helmetId: nextHelmetId,
      excludeUserId: user.userId,
    });
    if (!helmetCheck.valid) {
      return res.status(409).json({ message: helmetCheck.error });
    }

    if (name !== undefined) user.name = name.trim();
    if (email !== undefined) user.email = email.toLowerCase().trim();
    if (nic !== undefined) user.nic = nic;
    if (phone !== undefined) user.phone = phone;
    if (address !== undefined) user.address = address || null;
    if (role !== undefined) user.role = role;
    user.helmetId = nextHelmetId;

    if (password) {
      user.passwordHash = await bcrypt.hash(password, 10);
    }
    if (req.file) {
      user.profileImageUrl = `${PROFILE_IMAGE_BASE}/${req.file.filename}`;
    }
    user.updatedBy = req.user.id;

    await user.save();
    res.status(200).json({ user: userService.toPublicUser(user) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Duplicate field", errors: err.keyValue });
    }
    next(err);
  }
};

// DELETE /api/users/:id — ADMIN only. Soft delete: preserves HelmetData/Alert/
// WorkerProcessingState history for auditability (#25) and frees the helmet
// immediately (#26) so it's assignable to someone else right away.
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findOne({ userId: req.params.id, active: true });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.userId === req.user.id) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    user.active = false;
    user.deletedAt = new Date();
    user.deletedBy = req.user.id;
    user.helmetId = null;
    await user.save();

    res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    next(err);
  }
};
