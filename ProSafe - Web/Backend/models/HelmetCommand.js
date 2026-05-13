const mongoose = require("mongoose");

const helmetCommandSchema = new mongoose.Schema(
  {
    helmetId: {
      type: String,
      required: true
    },
    command: {
      type: String,
      enum: ["RESET_EMERGENCY"],
      required: true
    },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED"],
      default: "PENDING"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("HelmetCommand", helmetCommandSchema);
