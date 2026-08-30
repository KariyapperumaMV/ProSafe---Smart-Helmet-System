const mongoose = require("mongoose");

// Roster of physical helmet IDs. Assignment to a worker is NOT stored here —
// User.helmetId is the one authoritative relationship (see userService); a
// helmet's "assignedTo" is always derived by querying User, never persisted
// redundantly on this side, so the two can never disagree.
const helmetSchema = new mongoose.Schema({
  helmetId: { type: String, required: true, unique: true },
  status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },

  // Soft delete — same pattern as User. HelmetData/HelmetCommand/Alert keep
  // referencing helmetId as a plain string independent of this roster row,
  // so removing a helmet from active management never touches safety
  // history.
  active: { type: Boolean, default: true },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model("Helmet", helmetSchema);
