import { useEffect, useState } from "react";
import { Modal } from "../../ui/Modal";
import { LoadingState } from "../../ui/LoadingState";
import { EmptyState } from "../../ui/EmptyState";
import { StatusBadge } from "../../ui/StatusBadge";
import { SensorHistoryChart } from "./SensorHistoryChart";
import { getNoiseHistory, getGasHistory, getUvHistory, getAmbientTemperatureHistory } from "../../../api/userSensorApi";

const SENSOR_CONFIG = {
  noise: { title: "Sound Level", fetch: getNoiseHistory },
  gas: { title: "Gas / PPM Level", fetch: getGasHistory },
  uv: { title: "UV Light Level", fetch: getUvHistory },
  ambientTemperature: { title: "Ambient Temperature", fetch: getAmbientTemperatureHistory },
};

// "critical" (not "danger") is deliberate — an individual sensor reading in
// this range is not the same thing as an Emergency, which is reserved for
// the red "danger" tone elsewhere in the app (#19/#24).
const CATEGORY_TONE = { SAFE: "green", WARNING: "warning", CRITICAL: "critical" };

// #9-#12/#20 — one shared modal for the four non-personalized sensors. The
// SAFE/WARNING/CRITICAL category and range labels come entirely from the
// backend (config/sensorRanges.js) — this component never hardcodes a
// threshold number, so there's exactly one place those numbers can drift.
export function EnvironmentalSensorModal({ open, onClose, userId, sensor }) {
  const config = SENSOR_CONFIG[sensor];
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !userId || !config) return;
    setLoading(true);
    setError(null);
    config
      .fetch(userId)
      .then(setData)
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, [open, userId, config]);

  useEffect(() => {
    if (!open) setData(null);
  }, [open]);

  if (!config) return null;

  return (
    <Modal open={open} onClose={onClose} title={config.title} width={560}>
      {loading && <LoadingState label={`Loading ${config.title.toLowerCase()} history…`} />}

      {!loading && error && (
        <EmptyState
          icon="⚠"
          title={error.status === 401 || error.status === 403 ? "Not authorized to view this data" : "Couldn't load this data"}
          description={error.message}
        />
      )}

      {!loading && !error && data && (
        <div className="ps-sensor-modal-body">
          <div className="ps-sensor-value-row">
            <div className="ps-sensor-value-block">
              <span className="ps-sensor-value-label">Current Value</span>
              <span className="ps-sensor-value-big">
                {data.current ? `${data.current.value} ${data.unit}` : "Latest reading unavailable"}
              </span>
              {data.current && (
                <span className="ps-help-text">as of {new Date(data.current.timestamp).toLocaleString()}</span>
              )}
            </div>

            <div className="ps-sensor-value-block">
              <span className="ps-sensor-value-label">Current Category</span>
              {data.category ? (
                <StatusBadge tone={CATEGORY_TONE[data.category] || "neutral"}>{data.category}</StatusBadge>
              ) : (
                <span className="ps-sensor-value-big">Unavailable</span>
              )}
            </div>
          </div>

          <div className="ps-range-table">
            <div className="ps-range-row ps-range-safe">
              <span>Safe Range</span>
              <span>{data.ranges.safe.label}</span>
            </div>
            <div className="ps-range-row ps-range-warning">
              <span>Warning Range</span>
              <span>{data.ranges.warning.label}</span>
            </div>
            <div className="ps-range-row ps-range-critical">
              <span>Critical Range</span>
              <span>{data.ranges.critical.label}</span>
            </div>
          </div>
          <p className="ps-help-text">
            Reference: {data.standard} — project-configured range, visualization only.
          </p>

          <h3 className="ps-detail-section-title">Past 7 Days Average</h3>
          {data.dailyAverages.length === 0 ? (
            <EmptyState icon="📈" title="No valid readings available for the past 7 days." />
          ) : (
            <SensorHistoryChart data={data.dailyAverages} unit={data.unit} />
          )}
        </div>
      )}
    </Modal>
  );
}
