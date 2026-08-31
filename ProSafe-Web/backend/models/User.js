const mongoose = require("mongoose");
const { USER_ROLES } = require("../constants/roles");

// Controls TOAST/interruption behavior only — never whether a Notification
// document is created. Inbox delivery (notificationService.safeCreate) is
// unconditional for every recipient regardless of these flags; see
// frontend/src/hooks/useNotifications.js's shouldToast(), the only place
// these are read. `default: () => ({})` at every level (matching the
// existing WorkerProcessingState.exposureTrackerSchema convention) means an
// old User document saved before this field existed still hydrates with
// every flag defaulting to true — no migration needed.
const notificationPreferencesSchema = new mongoose.Schema({
  safetyAlerts: { type: Boolean, default: true },
  emergencyAlerts: { type: Boolean, default: true },
  emergencyResetUpdates: { type: Boolean, default: true },
  accountNotifications: { type: Boolean, default: true },
  // Reserved for future scheduled DAILY/WEEKLY/MONTHLY_REPORT_READY
  // notifications (not generated yet — see Notification model) so the
  // Settings toggle isn't wired to nothing once that ships.
  reportNotifications: { type: Boolean, default: true },
}, { _id: false });

const preferencesSchema = new mongoose.Schema({
  notifications: { type: notificationPreferencesSchema, default: () => ({}) },
}, { _id: false });

// Single collection for both ADMIN and WORKER accounts. `userId` is the same
// business key the processing pipeline already calls `workerId` on
// WorkerProcessingState/HelmetData/Alert/HelmetCommand — those models are
// intentionally left untouched (still plain strings, no $ref) so this model
// can evolve without risking the existing helmet data flow.
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  nic: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  address: { type: String, default: null },
  role: { type: String, enum: Object.values(USER_ROLES), required: true },
  profileImageUrl: { type: String, default: null },

  // WORKER only — must stay null for ADMIN (enforced in userService, not here,
  // so the one invariant lives in one place alongside the rest of the
  // create/update validation).
  helmetId: { type: String, default: null },

  // WORKER only — same fields baselineService already reads off the old
  // Worker model, carried over unchanged.
  baselineHeartRate: { type: Number, default: null },
  baselineBodyTemperature: { type: Number, default: null },

  active: { type: Boolean, default: true },
  deletedAt: { type: Date, default: null },

  preferences: { type: preferencesSchema, default: () => ({}) },

  createdBy: { type: String, default: null },
  updatedBy: { type: String, default: null },
  deletedBy: { type: String, default: null },
}, { timestamps: true });

userSchema.index({ role: 1, active: 1 });

module.exports = mongoose.model("User", userSchema);
