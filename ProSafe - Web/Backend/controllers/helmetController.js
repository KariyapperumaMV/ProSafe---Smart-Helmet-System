const HelmetData = require("../models/HelmetData");
const HelmetCommand = require("../models/HelmetCommand");

/* =====================================================
   NORMAL HELMET DATA (SAFE / WARNING / CRITICAL)
   ===================================================== */
exports.receiveHelmetData = async (req, res) => {
  try {
    const data = req.body;

    // Basic validation
    if (!data.helmetId || !data.status?.overall) {
      return res.status(400).json({
        message: "Invalid helmet data packet"
      });
    }

    // ---- REAL-TIME ALERTS (NO DB DEPENDENCY) ----
    if (data.status.overall === "CRITICAL") {
      console.log("CRITICAL ALERT:", data.helmetId);
      console.log("Critical sensors:", data.status.critical_sensors || []);
      console.log("Warning sensors:", data.status.warning_sensors || []);
      // TODO:
      // notify admin dashboard
    }

    if (data.status.overall === "WARNING") {
      console.log("WARNING ALERT:", data.helmetId);
      console.log("Warning sensors:", data.status.warning_sensors || []);
      // TODO:
      // notify admin dashboard
    }

    // ---- STORE DATA ----
    await HelmetData.create(data);

    res.status(201).json({
      message: "Helmet data stored"
    });

  } catch (err) {
    console.error("Helmet data error:", err);
    res.status(500).json({
      message: "Server error"
    });
  }
};

/* =====================================================
   EMERGENCY DATA (IMMEDIATE)
   ===================================================== */
exports.receiveHelmetEmergencyData = async (req, res) => {
  try {
    const { helmetId, timestamp, status } = req.body;

    // Validation
    if (!helmetId) {
      return res.status(400).json({ message: "Helmet ID missing" });
    }

    if (!timestamp) {
      return res.status(400).json({ message: "Timestamp missing" });
    }

    if (!status || status.overall !== "EMERGENCY") {
      return res.status(400).json({ message: "Invalid emergency packet" });
    }

    // ---- EMERGENCY ALERT ----
    console.log("🚨 EMERGENCY ALERT:", helmetId);

    // TODO:
    // notify admin dashboard

    // ---- STORE EMERGENCY RECORD ----
    await HelmetData.create({
      helmetId,
      timestamp,
      status: {
        overall: "EMERGENCY"
      }
    });

    res.status(201).json({
      message: "Emergency received"
    });

  } catch (err) {
    console.error("Emergency error:", err);
    res.status(500).json({
      message: "Server error"
    });
  }
};

/* =====================================================
   ADMIN → SEND RESET COMMAND
   ===================================================== */
exports.sendHelmetResetCommand = async (req, res) => {
  try {
    const { helmetId } = req.body;

    if (!helmetId) {
      return res.status(400).json({
        message: "Helmet ID required"
      });
    }

    await HelmetCommand.create({
      helmetId,
      command: "RESET_EMERGENCY",
      status: "PENDING"
    });

    res.status(200).json({
      message: "Reset command queued"
    });

  } catch (err) {
    console.error("Reset command error:", err);
    res.status(500).json({
      message: "Server error"
    });
  }
};

/* =====================================================
   HELMET → POLL FOR COMMANDS
   ===================================================== */
exports.getHelmetCommand = async (req, res) => {
  try {
    const { helmetId } = req.params;

    if (!helmetId) {
      return res.status(400).json({
        message: "Helmet ID required"
      });
    }

    // Get oldest pending command
    const command = await HelmetCommand.findOne({
      helmetId,
      status: "PENDING"
    }).sort({ createdAt: 1 });

    if (!command) {
      return res.json({ command: null });
    }

    // Mark command as completed and store reset time
    command.status = "COMPLETED";
    await command.save();

    // Send command to helmet
    res.json({
      command: command.command,
    });

  } catch (err) {
    console.error("Get command error:", err);
    res.status(500).json({
      message: "Server error"
    });
  }
};

/* =====================================================
   GET AVAILABLE HELMET
   ===================================================== */
   exports.getAvailableHelmets = async (req, res) => {
  try {
    const helmets = await HelmetData.distinct("helmetId");

    res.status(200).json({
      count: helmets.length,
      helmets
    });

  } catch (error) {
    console.error("Get helmets error:", error);
    res.status(500).json({
      message: "Unable to fetch helmets"
    });
  }
};

/* =====================================================
   GET HELMET DATA (LATEST)
   ===================================================== */
exports.getLatestHelmetData = async (req, res) => {
  try {
    const { helmetId } = req.params;

    if (!helmetId) {
      return res.status(400).json({
        message: "Helmet ID is required"
      });
    }

    const latestData = await HelmetData.findOne({ helmetId })
      .sort({ timestamp: -1 });

    if (!latestData) {
      return res.status(404).json({
        message: "No data found for this helmet"
      });
    }

    res.status(200).json(latestData);

  } catch (error) {
    console.error("Get latest helmet data error:", error);
    res.status(500).json({
      message: "Unable to fetch helmet data"
    });
  }
};

/* =====================================================
   GET HELMET DATA (FOR PAST 7 DAYS)
   ===================================================== */
exports.get7DaysHelmetData = async (req, res) => {
  try {
    const { helmetId } = req.params;

    if (!helmetId) {
      return res.status(400).json({ message: "Helmet ID required" });
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const data = await HelmetData.aggregate([
      {
        $match: {
          helmetId: helmetId,
          timestamp: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            day: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$timestamp",
                timezone: "Asia/Colombo"   // ✅ important fix
              }
            }
          },
          body_temp: { $avg: "$sensors.body_temp" },
          heart_rate: { $avg: "$sensors.heart_rate" },
          ambient_temp: { $avg: "$sensors.ambient_temp" },
          gas_ppm: { $avg: "$sensors.gas_ppm" },
          uv_index: { $avg: "$sensors.uv_index" },
          noise_db: { $avg: "$sensors.noise_db" }
        }
      },
      { $sort: { "_id.day": 1 } }
    ]);

    const result = {};

    data.forEach(d => {
      const day = d._id.day;

      result[day] = {
        body_temp: d.body_temp ?? 0,
        heart_rate: d.heart_rate ?? 0,
        ambient_temp: d.ambient_temp ?? 0,
        gas_ppm: d.gas_ppm ?? 0,
        uv_index: d.uv_index ?? 0,
        noise_db: d.noise_db ?? 0
      };
    });

    res.status(200).json(result);

  } catch (err) {
    console.error("7-day aggregation error:", err);
    res.status(500).json({ message: "Server error" });
  }
};