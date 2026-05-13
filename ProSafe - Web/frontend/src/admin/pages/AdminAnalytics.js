import { useEffect, useState } from "react";
import axios from "axios";

import SensorGauge from "../components/SensorGauge";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis
} from "recharts";

/* =====================================================
   SENSOR CONFIG
===================================================== */

const SENSOR_META = {

  noise_db: {
    label: "Sound level",
    unit: "dB",
    type: "sound",
    min: 30,
    max: 100,
    thresholds: [
      { value: 30, color: "#2ecc71", label: "30" },
      { value: 80, color: "#2ecc71", label: "80" },
      { value: 90, color: "#f1c40f", label: "90" },
      { value: 100, color: "#e74c3c", label: "100" }
    ]
  },

  ambient_temp: {
    label: "Ambient temperature",
    unit: "°C",
    type: "ambient",
    min: 22,
    max: 45,
    thresholds: [
      { value: 22, color: "#2ecc71", label: "22" },
      { value: 27, color: "#2ecc71", label: "27" },
      { value: 35, color: "#f1c40f", label: "35" },
      { value: 45, color: "#e74c3c", label: "45" }
    ]
  },

  gas_ppm: {
    label: "PPM level",
    unit: "ppm",
    type: "gas",
    min: 0,
    max: 400,
    thresholds: [
      { value: 0, color: "#2ecc71", label: "0" },
      { value: 150, color: "#2ecc71", label: "150" },
      { value: 300, color: "#f1c40f", label: "300" },
      { value: 400, color: "#e74c3c", label: "400" }
    ]
  },

  uv_index: {
    label: "UV light",
    unit: "",
    type: "uv",
    min: 0,
    max: 10,
    thresholds: [
      { value: 0, color: "#2ecc71", label: "0" },
      { value: 3, color: "#2ecc71", label: "3" },
      { value: 8, color: "#f1c40f", label: "8" },
      { value: 10, color: "#e74c3c", label: "10" }
    ]
  },

  body_temp: {
    label: "Body temperature",
    unit: "°C",
    type: "body",
    min: 28,
    max: 42,
    thresholds: [
      { value: 30, color: "#e74c3c", label: "30" },
      { value: 35, color: "#f1c40f", label: "35" },
      { value: 38, color: "#2ecc71", label: "38" },
      { value: 39, color: "#f1c40f", label: "39" },
      { value: 42, color: "#e74c3c", label: "42" }
    ]
  },

  heart_rate: {
    label: "Heart rate",
    unit: "bpm",
    type: "heart",
    min: 80,
    max: 180,
    thresholds: [
      { value: 85, color: "#e74c3c", label: "85" },
      { value: 88, color: "#f1c40f", label: "88" },
      { value: 149, color: "#2ecc71", label: "149" },
      { value: 175, color: "#f1c40f", label: "175" },
      { value: 180, color: "#e74c3c", label: "180" }
    ]
  }

};

/* =====================================================
   CHART COLORS
===================================================== */

const RISK_COLORS = {
  safe: "#2ecc71",
  warning: "#f1c40f",
  critical: "#e74c3c",
  emergency: "#000000"
};

/* =====================================================
   COMPONENT
===================================================== */

const AdminAnalytics = () => {

  const [avgEnvironment, setAvgEnvironment] = useState({});
  const [avgBody, setAvgBody] = useState({});
  const [alerts, setAlerts] = useState({});
  const [riskLevels, setRiskLevels] = useState([]);
  const [timeDistribution, setTimeDistribution] = useState([]);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {

    try {

      const res = await axios.get(
        "http://localhost:5000/api/analytics/today"
      );

      const data = res.data;

      setAvgEnvironment(data.environment || {});
      setAvgBody(data.body || {});
      setAlerts(data.alerts || {});
      setRiskLevels(data.riskLevels || []);
      setTimeDistribution(data.timeDistribution || []);

    } catch (err) {
      console.error("Analytics fetch error:", err);
    }

  };

  const totalWorkers = riskLevels.reduce(
    (sum, r) => sum + r.value,
    0
  );

  return (

    <div className="analytics-container">

      {/* TOP ROW */}
      <div className="dashboard-top">

        {/* Average Environment */}
        <div className="glass-card analytics-card">

          <h3>Average Environment Data</h3>

          <div className="gauge-row">

            <SensorGauge
              {...SENSOR_META.noise_db}
              value={avgEnvironment.noise_db}
              classifyType="sound"
            />

            <SensorGauge
              {...SENSOR_META.ambient_temp}
              value={avgEnvironment.ambient_temp}
              classifyType="ambient"
            />

            <SensorGauge
              {...SENSOR_META.gas_ppm}
              value={avgEnvironment.gas_ppm}
              classifyType="gas"
            />

            <SensorGauge
              {...SENSOR_META.uv_index}
              value={avgEnvironment.uv_index}
              classifyType="uv"
            />

          </div>

        </div>

        {/* Total Alerts */}
        <div className="glass-card analytics-card">

          <h3>Total Alerts</h3>

          <div className="alerts-container">

            <div>
              <h2>{alerts.emergency || 0}</h2>
              <p>Emergency Alerts</p>
            </div>

            <div>
              <h2>{alerts.critical || 0}</h2>
              <p>Critical Alerts</p>
            </div>

            <div>
              <h2>{alerts.warning || 0}</h2>
              <p>Warning Alerts</p>
            </div>

          </div>

        </div>

      </div>

      {/* SECOND ROW */}
      <div className="dashboard-bottom">

        {/* Body Data */}
        <div className="glass-card analytics-card">

          <h3>Body Data</h3>

          <div className="gauge-row">

            <SensorGauge
              {...SENSOR_META.body_temp}
              value={avgBody.body_temp}
              classifyType="body"
            />

            <SensorGauge
              {...SENSOR_META.heart_rate}
              value={avgBody.heart_rate}
              classifyType="heart"
            />

          </div>

        </div>

        {/* Risk Distribution */}
        <div className="glass-card analytics-card">

          <h3>Risk Level Distribution</h3>

          <ResponsiveContainer width="100%" height={260}>

            <PieChart>

              <Pie
                data={riskLevels}
                dataKey="value"
                nameKey="name"
                innerRadius={70}
                outerRadius={100}
              >

                {riskLevels.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={RISK_COLORS[entry.name]}
                  />
                ))}

              </Pie>

              <Tooltip />

            </PieChart>

          </ResponsiveContainer>

          <div style={{ textAlign: "center" }}>
            {totalWorkers} Users
          </div>

        </div>

      </div>

      {/* TIME DISTRIBUTION */}
      <div className="glass-card analytics-card">

        <h3>
          Average Environment Data – Distribution According To Time
        </h3>

        <ResponsiveContainer width="100%" height={300}>

          <LineChart data={timeDistribution}>

            <CartesianGrid strokeDasharray="3 3" />

            <XAxis dataKey="time" />

            <YAxis />

            <Tooltip />

            <Line
              type="monotone"
              dataKey="ambient_temp"
              stroke="#2ecc71"
              strokeWidth={2}
            />

            <Line
              type="monotone"
              dataKey="noise_db"
              stroke="#3498db"
              strokeWidth={2}
            />

            <Line
              type="monotone"
              dataKey="gas_ppm"
              stroke="#f1c40f"
              strokeWidth={2}
            />

          </LineChart>

        </ResponsiveContainer>

      </div>

    </div>

  );

};

export default AdminAnalytics;