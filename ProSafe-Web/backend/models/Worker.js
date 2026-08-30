const mongoose = require("mongoose");

// Minimal worker identity + physiological baseline needed by the processing
// pipeline. Baselines are nullable on purpose: a worker without a recorded
// baseline yet must be handled safely (see baselineService), never defaulted
// to an invented value.
const workerSchema = new mongoose.Schema({
  workerId: { type: String, required: true, unique: true },
  name: { type: String, default: null },
  helmetId: { type: String, default: null },

  baselineHeartRate: { type: Number, default: null },
  baselineBodyTemperature: { type: Number, default: null },
});

module.exports = mongoose.model("Worker", workerSchema);
