const mongoose = require("mongoose");

// Minimal roster of physical helmet IDs — just enough for the Users module's
// "assign helmet" dropdown to load real options instead of a hardcoded list.
// Full helmet management (add/edit/delete helmet, Figures 17-20) is a
// separate future phase; this model deliberately carries nothing else.
const helmetSchema = new mongoose.Schema({
  helmetId: { type: String, required: true, unique: true },
  status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
}, { timestamps: true });

module.exports = mongoose.model("Helmet", helmetSchema);
