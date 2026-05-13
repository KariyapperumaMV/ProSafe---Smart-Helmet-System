import { useEffect, useState } from "react";
import axios from "axios";
import SensorGauge from "./SensorGauge";
import { classify } from "./SensorUtils";
import SensorDetailOverlay from "./SensorDetailOverlay";
import userAvatar from "../../pictures/user.png";

const ViewUserModal = ({ user, onClose }) => {
  const [helmetData, setHelmetData] = useState(null);
  const [loading, setLoading] = useState(false);

  // sensor history
  const [selectedSensor, setSelectedSensor] = useState(null);
  const [sevenDayData, setSevenDayData] = useState(null);

  // map label
  const toDMS = (deg, isLat) => {
    const absolute = Math.abs(deg);
    const degrees = Math.floor(absolute);
    const minutesFloat = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const seconds = ((minutesFloat - minutes) * 60).toFixed(1);

    const direction = isLat
      ? deg >= 0 ? "N" : "S"
      : deg >= 0 ? "E" : "W";

    return `${degrees}°${minutes}'${seconds}"${direction}`;
  };

  const gps = helmetData?.sensors?.gps;

  const locationLabel =
    gps
      ? `${toDMS(gps.lat, true)} ${toDMS(gps.lng, false)}`
      : "Location unavailable";

  // 7 days average calculation
  const fetchSevenDays = async (sensorKey) => {
    try {
      const res = await axios.get(
        `http://localhost:5000/api/helmet/last7days/${user.helmet}`
      );

      const raw = res.data;

      const today = new Date();
      const days = [];

      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(today.getDate() - i);

        const key = d.toISOString().slice(0,10);

        days.push({
          date: key,
          value: raw[key]?.[sensorKey] ?? null
        });
      }

      setSevenDayData(days);
      setSelectedSensor(sensorKey);

    } catch (err) {
      console.error(err);
    }
  };

  // summery
  const SENSOR_RULES = {
    body: {
      name: "Body Temperature",
      warning: {
        action:
          "Reduce physical workload, move the worker to a shaded or ventilated area, and provide drinking water. Continue close monitoring.",
        reason:
          "Early heat stress or mild hypothermia reduces concentration and reaction time, increasing the risk of falls and judgment errors."
      },
      critical: {
        action:
          "Stop work immediately. Move the worker to a safe rest area, begin cooling or warming as appropriate, and seek medical attention.",
        reason:
          "Severe temperature imbalance can lead to heat stroke or hypothermia, causing collapse or loss of consciousness."
      }
    },

    heart: {
      name: "Heart Rate",
      warning: {
        action:
          "Instruct the worker to rest, slow down activity, and hydrate. Recheck heart rate after recovery.",
        reason:
          "Abnormal heart rate often indicates overexertion or fatigue, reducing coordination and decision-making."
      },
      critical: {
        action:
          "Stop work immediately. Seat or lay the worker down and arrange medical evaluation.",
        reason:
          "Extremely high or low heart rates can indicate cardiovascular distress and risk of sudden collapse."
      }
    },

    ambient: {
      name: "Ambient Temperature",
      warning: {
        action:
          "Increase rest breaks, rotate tasks, ensure water availability, and encourage shaded work.",
        reason:
          "High ambient temperature accelerates fatigue and dehydration, increasing accident risk."
      },
      critical: {
        action:
          "Suspend non-essential outdoor work and move workers to cooler environments.",
        reason:
          "Extreme heat significantly increases the likelihood of heat exhaustion or heat stroke."
      }
    },

    uv: {
      name: "UV Light",
      warning: {
        action:
          "Use protective gear such as visors, long sleeves, sunscreen, and scheduled shade breaks.",
        reason:
          "Moderate UV exposure causes skin and eye strain, reducing focus."
      },
      critical: {
        action:
          "Limit outdoor exposure and reschedule tasks where possible.",
        reason:
          "High UV levels increase the risk of sunburn, heat stress, and long-term skin damage."
      }
    },

    gas: {
      name: "Gas Level",
      warning: {
        action:
          "Improve ventilation, identify possible gas sources, and reduce exposure time.",
        reason:
          "Moderate gas concentration can cause dizziness or nausea, impairing awareness."
      },
      critical: {
        action:
          "Evacuate the area immediately and notify site safety personnel.",
        reason:
          "High gas concentration may be toxic or explosive, posing immediate danger."
      }
    },

    sound: {
      name: "Sound Level",
      warning: {
        action:
          "Provide hearing protection and limit exposure duration.",
        reason:
          "Sustained noise reduces situational awareness and communication."
      },
      critical: {
        action:
          "Stop or isolate the noise source and enforce mandatory hearing protection.",
        reason:
          "Extremely high noise can cause permanent hearing damage and block warning signals."
      }
    }
  };

  const buildSummary = () => {
    if (!helmetData?.sensors) return null;

    const safe = [];
    const warning = [];
    const critical = [];

    const sensorMap = {
      body: helmetData.sensors.body_temp,
      heart: helmetData.sensors.heart_rate,
      ambient: helmetData.sensors.ambient_temp,
      gas: helmetData.sensors.gas_ppm,
      uv: helmetData.sensors.uv_index,
      sound: helmetData.sensors.noise_db
    };

    Object.entries(sensorMap).forEach(([key, value]) => {
      if (value === undefined || value === null) return;

      const level = classify[key](value);

      if (level === "safe") safe.push(key);
      if (level === "warning") warning.push(key);
      if (level === "critical") critical.push(key);
    });

    return { safe, warning, critical };
  };

  useEffect(() => {
    if (!user?.helmet) return;

    const fetchLatest = async () => {
      try {
        setLoading(true);
        const res = await axios.get(
          `http://localhost:5000/api/helmet/latest/${user.helmet}`
        );
        setHelmetData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchLatest();
  }, [user]);

  return (
    <div className="modal-overlay">
      <div className="modal-box">

        {selectedSensor && sevenDayData && (
          <SensorDetailOverlay
            sensorKey={selectedSensor}
            data={sevenDayData}
            latestValue={helmetData.sensors[selectedSensor]}
            lastTimestamp={helmetData.timestamp}
            onClose={() => setSelectedSensor(null)}
          />
        )}
        
        {/* HEADER */}
        <div className="modal-header">
          <span className={`status-badge ${helmetData?.status?.overall?.toLowerCase()}`}>
            {helmetData?.status?.overall || "NO DATA"}
          </span>
        </div>

        <div className="modal-body">

          {/* LEFT */}
          <div className="modal-left">
            <img src={userAvatar} alt="User" className="user-avatar-img" />

            <div className="user-basic">
              <div className="user-id">{user.userId}</div>
              <div className="user-name">{user.name}</div>
              <div className="user-role">{user.user_type}</div>
            </div>

            <div className="user-details">
              <div><span>NIC</span>{user.nic}</div>
              <div><span>Phone</span>{user.phoneNo}</div>
              <div><span>Email</span>{user.email}</div>
              <div><span>Helmet</span>{user.helmet || "Not assigned"}</div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="modal-right">

            {loading && <p>Loading helmet data...</p>}

            {helmetData && (
              <>
                {/* TOP ROW */}
                <div className="top-row">

                  <div className="modal-section">
                    <h4>Body data</h4>
                    <div className="gauge-row">
                      <SensorGauge
                        label="Body temperature"
                        value={helmetData.sensors.body_temp}
                        unit="°C"
                        min={28}
                        max={42}
                        thresholds={[
                          { value: 30, color: "#e74c3c", label: "30" },
                          { value: 35, color: "#f1c40f", label: "35" },
                          { value: 38, color: "#2ecc71", label: "38" },
                          { value: 39, color: "#f1c40f", label: "39" },
                          { value: 42, color: "#e74c3c", label: "42" },
                        ]}
                        classifyType="body"
                        onClick={() => fetchSevenDays("body_temp")}
                      />

                      <SensorGauge
                        label="Heart rate"
                        value={helmetData.sensors?.heart_rate}
                        unit="bpm"
                        min={70}
                        max={180}
                        safeMin={88}
                        safeMax={180}
                        thresholds={[
                          { value: 80, color: "#e74c3c", label: "80" },
                          { value: 88, color: "#f1c40f", label: "88" },
                          { value: 149, color: "#2ecc71", label: "149" },
                          { value: 175, color: "#f1c40f", label: "175" },
                          { value: 180, color: "#e74c3c", label: "180" },
                        ]}
                        type="symmetric"
                        classifyType="heart"
                        onClick={() => fetchSevenDays("heart_rate")}
                      />
                    </div>
                  </div>
                  
                  {/* Location */}
                  <div className="modal-section body-data">
                    <h4>Location</h4>

                    {gps ? (
                      <div>
                        <div className="map-label">
                            {locationLabel}
                          </div>
                        <div className="map-box map-embed">
                          
                          <iframe
                            title="User location"
                            src={`https://www.google.com/maps?q=${gps.lat},${gps.lng}&z=16&output=embed`}
                            allowFullScreen
                            loading="lazy"
                          />

                          </div>
                      </div>
                      ) : (
                        <div className="map-box">Unavailable</div>
                      )}
                  </div>
                </div>

                {/* ENVIRONMENT */}
                <div className="modal-section environment-data">
                  <h4>Environment data</h4>
                  <div className="gauge-row">
                    <SensorGauge
                      label="Sound level"
                      value={helmetData.sensors.noise_db}
                      unit="dB"
                      min={30}
                      max={100}
                      thresholds={[
                        { value: 30, color: "#2ecc71", label: "30" },
                        { value: 80, color: "#2ecc71", label: "80" },
                        { value: 90, color: "#f1c40f", label: "90" },                        
                        { value: 100, color: "#e74c3c", label: "100" },
                      ]}
                      classifyType="sound"
                      onClick={() => fetchSevenDays("noise_db")}
                    />

                    <SensorGauge
                      label="Ambient temperature"
                      value={helmetData.sensors?.ambient_temp}
                      unit="°C"
                      min={22}
                      max={45}
                      thresholds={[
                        { value: 22, color: "#2ecc71", label: "22" },
                        { value: 27, color: "#2ecc71", label: "27" },
                        { value: 35, color: "#f1c40f", label: "35" },
                        { value: 45, color: "#e74c3c", label: "45" },
                      ]}
                      classifyType="ambient"
                      onClick={() => fetchSevenDays("ambient_temp")}
                    />

                    <SensorGauge
                      label="PPM level"
                      value={helmetData.sensors?.gas_ppm}
                      unit="ppm"
                      min={0}
                      max={400}
                      thresholds={[
                        { value: 0, color: "#2ecc71", label: "0" },
                        { value: 150, color: "#2ecc71", label: "150" },
                        { value: 300, color: "#f1c40f", label: "300" },
                        { value: 400, color: "#e74c3c", label: "400" },
                      ]}
                      classifyType="gas"
                      onClick={() => fetchSevenDays("gas_ppm")}
                    />

                    <SensorGauge
                      label="UV light"
                      value={helmetData.sensors?.uv_index}
                      unit=""
                      min={0}
                      max={10}
                      thresholds={[
                        { value: 0, color: "#2ecc71", label: "0" },
                        { value: 3, color: "#2ecc71", label: "3" },
                        { value: 8, color: "#f1c40f", label: "8" },
                        { value: 10, color: "#e74c3c", label: "10" },
                      ]}
                      classifyType="uv"
                      onClick={() => fetchSevenDays("uv_index")}
                    />
                  </div>
                </div>

                {/* SUMMARY */}
                <div className="modal-section summary">
                  <h4>Summary</h4>
                  <div className="summary-box">
                    <p>
                      <strong>Overall Helmet Status:</strong>{" "}
                      {helmetData.status.overall.toUpperCase()}
                    </p>

                    {(() => {
                      const summary = buildSummary();
                      if (!summary) return null;

                      return (
                        <>
                          {summary.safe.length > 0 && (
                            <p>
                              <strong>Safe sensors:</strong>{" "}
                              {summary.safe.map(s => SENSOR_RULES[s].name).join(", ")}
                            </p>
                          )}

                          {summary.warning.map(sensor => (
                            <p key={sensor}>
                              <strong>{SENSOR_RULES[sensor].name} – Warning</strong><br />
                              <ul>
                                <li>
                                  <strong>Action:</strong> {SENSOR_RULES[sensor].warning.action}<br />
                                </li>
                                <li>
                                  <strong>Why:</strong> {SENSOR_RULES[sensor].warning.reason}
                                </li>
                              </ul>                                                  
                            </p>
                          ))}

                          {summary.critical.map(sensor => (
                            <p key={sensor}>
                              <strong>{SENSOR_RULES[sensor].name} – Critical</strong><br />
                              <ul>
                                <li>
                                  <strong>Action:</strong> {SENSOR_RULES[sensor].critical.action}<br />
                                </li>
                                <li>
                                  <strong>Why:</strong> {SENSOR_RULES[sensor].critical.reason}
                                </li>
                              </ul>                                                                                  
                          </p>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="gray-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default ViewUserModal;