const mongoose = require("mongoose");
const { SYSTEM_STATES } = require("../constants/riskStates");

// One document per helmet holding the *current* desired command. The helmet
// polls GET /api/helmet/command/:helmetId (existing communication mechanism)
// and always receives the latest state — deliberately not a PENDING/COMPLETED
// queue, so a missed poll is never lost: the next poll just gets the same
// current command again.
const helmetCommandSchema = new mongoose.Schema({
  helmetId: { type: String, required: true, unique: true },

  command: {
    type: String,
    enum: ["SET_RISK", "RESET_EMERGENCY"],
    required: true,
  },

  // Populated when command === "SET_RISK". Centralizes the risk -> LED
  // mapping's output; the mapping itself lives in helmetCommandService.
  // UNCERTAIN = "no trustworthy risk decision" (blue LED on the helmet), never SAFE.
  risk: { type: String, enum: [...Object.values(SYSTEM_STATES), null], default: null },
}, { timestamps: true });

module.exports = mongoose.model("HelmetCommand", helmetCommandSchema);
