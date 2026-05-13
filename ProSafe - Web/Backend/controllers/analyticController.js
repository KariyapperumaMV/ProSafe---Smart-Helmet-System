const HelmetData = require("../models/HelmetData");
const User = require("../models/User");

exports.getTodayAnalytics = async (req, res) => {
  try {

    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);

    /* =========================================
       1. AVERAGE SENSOR VALUES TODAY
       ========================================= */

    const avgData = await HelmetData.aggregate([
      {
        $match: {
          timestamp: { $gte: startOfDay }
        }
      },
      {
        $group: {
          _id: null,

          body_temp: { $avg: "$sensors.body_temp" },
          heart_rate: { $avg: "$sensors.heart_rate" },

          ambient_temp: { $avg: "$sensors.ambient_temp" },
          gas_ppm: { $avg: "$sensors.gas_ppm" },
          uv_index: { $avg: "$sensors.uv_index" },
          noise_db: { $avg: "$sensors.noise_db" }
        }
      }
    ]);

    const averages = avgData[0] || {};

    /* =========================================
       2. TOTAL ALERTS TODAY
       ========================================= */

    const alertCounts = await HelmetData.aggregate([
      {
        $match: {
          timestamp: { $gte: startOfDay }
        }
      },
      {
        $group: {
          _id: "$status.overall",
          count: { $sum: 1 }
        }
      }
    ]);

    const alerts = {
      emergency: 0,
      critical: 0,
      warning: 0
    };

    alertCounts.forEach(a => {

      if (a._id === "EMERGENCY") alerts.emergency = a.count;
      if (a._id === "CRITICAL") alerts.critical = a.count;
      if (a._id === "WARNING") alerts.warning = a.count;

    });

    /* =========================================
       3. RISK DISTRIBUTION BY WORKER
       ========================================= */

    const workers = await User.find({ user_type: "WORKER" });

    const riskLevels = {
      safe: 0,
      warning: 0,
      critical: 0,
      emergency: 0
    };

    for (const worker of workers) {

      if (!worker.helmet) continue;

      const latest = await HelmetData.findOne({
        helmetId: worker.helmet
      }).sort({ timestamp: -1 });

      if (!latest) continue;

      const status = latest.status.overall.toLowerCase();

      if (riskLevels[status] !== undefined) {
        riskLevels[status]++;
      }
    }

    const riskDistribution = [
      { name: "safe", value: riskLevels.safe },
      { name: "warning", value: riskLevels.warning },
      { name: "critical", value: riskLevels.critical },
      { name: "emergency", value: riskLevels.emergency }
    ];

    /* =========================================
       4. TIME DISTRIBUTION (HOURLY)
       ========================================= */

    const timeDistribution = await HelmetData.aggregate([
      {
        $match: {
          timestamp: { $gte: startOfDay }
        }
      },
      {
        $group: {
          _id: {
            hour: {
              $dateToString: {
                format: "%H:00",
                date: "$timestamp",
                timezone: "Asia/Colombo"
              }
            }
          },

          ambient_temp: { $avg: "$sensors.ambient_temp" },
          noise_db: { $avg: "$sensors.noise_db" },
          gas_ppm: { $avg: "$sensors.gas_ppm" }
        }
      },
      {
        $sort: { "_id.hour": 1 }
      }
    ]);

    const formattedTime = timeDistribution.map(t => ({
      time: t._id.hour,
      ambient_temp: t.ambient_temp,
      noise_db: t.noise_db,
      gas_ppm: t.gas_ppm
    }));

    /* =========================================
       RESPONSE
       ========================================= */

    res.json({

      environment: {
        ambient_temp: averages.ambient_temp || 0,
        gas_ppm: averages.gas_ppm || 0,
        uv_index: averages.uv_index || 0,
        noise_db: averages.noise_db || 0
      },

      body: {
        body_temp: averages.body_temp || 0,
        heart_rate: averages.heart_rate || 0
      },

      alerts,

      riskLevels: riskDistribution,

      timeDistribution: formattedTime
    });

  } catch (err) {

    console.error("Analytics error:", err);

    res.status(500).json({
      message: "Analytics error"
    });

  }
};