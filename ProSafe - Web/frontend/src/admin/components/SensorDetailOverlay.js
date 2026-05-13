import SensorGauge from "./SensorGauge";
import { classify } from "./SensorUtils";

/* ================= SENSOR CONFIG ================= */

const SENSOR_META = {
  body_temp: {
    name: "Body Temperature",
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
    name: "Heart Rate",
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
  },

  noise_db: {
    name: "Sound Level",
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
    name: "Ambient Temperature",
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
    name: "PPM Level",
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
    name: "UV Light",
    unit: "",
    type: "",
    min: 0,
    max: 10,
    thresholds: [
      { value: 0, color: "#2ecc71", label: "0" },
      { value: 3, color: "#2ecc71", label: "3" },
      { value: 8, color: "#f1c40f", label: "8" },
      { value: 10, color: "#e74c3c", label: "10" }
    ]
  }
};

const SensorDetailOverlay = ({
  sensorKey,
  data = [],
  latestValue,
  lastTimestamp,
  onClose
}) => {
  if (!sensorKey || !SENSOR_META[sensorKey]) return null;

  const meta = SENSOR_META[sensorKey];

  const status =
    latestValue !== undefined
      ? classify[meta.type](latestValue)
      : "safe";

  const formatSriLankaTime = (dateString) => {
    if (!dateString) return "N/A";

    return new Date(dateString).toLocaleString("en-LK", {
      timeZone: "Asia/Colombo",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  };

  return (
    <div className="detail-overlay">
      <div className="detail-box">

        <div className="detail-header">
          <h2>
            {meta.name} – <span className={status}>{status.toUpperCase()}</span>
          </h2>

          <SensorGauge
            label={meta.name}
            value={latestValue}
            unit={meta.unit}
            min={meta.min}
            max={meta.max}
            thresholds={meta.thresholds}
            classifyType={meta.type}
          />

          <p className="last-updated">
            Last updated: {formatSriLankaTime(lastTimestamp)}
          </p>
        </div>

        <h4>For past 7 days</h4>

        <div className="seven-day-chart">
          {data.map((d, i) => {

            const percent = Math.max(
              0,
              Math.min(
                1,
                (d.value - meta.min) / (meta.max - meta.min)
              )
            );

            const today = new Date().toISOString().slice(0,10);
            const isToday = d.date === today;

            return (
              <div key={i} className="bar-wrapper">

                <div className="bar-area">

                  <div className="bar-container">
                    {d.value && (
                      <span className="bar-value">
                        {d.value.toFixed(1)}
                      </span>
                    )}

                    <div
                      className={`bar ${isToday ? "bar-today" : ""}`}
                      style={{
                        height: d.value
                          ? `${Math.max(percent * 100, 6)}%`
                          : "0%"
                      }}
                    />

                  </div>

                  <div className="baseline" />
                </div>

                <span className="bar-label">
                  {new Date(d.date).toLocaleDateString("en-US", {
                    weekday: "short"
                  })}
                  {isToday && <span className="today-label"> (Today)</span>}
                </span>

              </div>
            );
          })}
        </div>

        <h4>Summary & Suggestions</h4>

        <div className="detail-summary">
          Current level is {status}. Follow site safety procedures.
        </div>

        <button className="gray-btn" onClick={onClose}>
          Close
        </button>

      </div>
    </div>
  );
};

export default SensorDetailOverlay;