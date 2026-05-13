const mongoose = require("mongoose");

const helmetDataSchema = new mongoose.Schema({
  helmetId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },

  sensors: {
    gas_ppm: Number,
    ambient_temp: Number,
    body_temp: Number,
    heart_rate: Number,
    uv_index: Number,
    noise_db: Number,
    gps: {
      lat: Number,
      lng: Number
    }
  },

  status: {
    overall: {
      type: String,
      enum: ["SAFE", "WARNING", "CRITICAL", "EMERGENCY"],
      required: true
    },
    critical_sensors: [String],
    warning_sensors: [String]
  }
});

helmetDataSchema.index({ helmetId: 1, timestamp: -1 });

module.exports = mongoose.model("HelmetData", helmetDataSchema);
