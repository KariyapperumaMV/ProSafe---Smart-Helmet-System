const mongoose = require("mongoose");
const { USER_ROLES } = require("../constants/roles");

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

  createdBy: { type: String, default: null },
  updatedBy: { type: String, default: null },
  deletedBy: { type: String, default: null },
}, { timestamps: true });

userSchema.index({ role: 1, active: 1 });

module.exports = mongoose.model("User", userSchema);
