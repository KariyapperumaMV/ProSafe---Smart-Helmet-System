import { useEffect, useState } from "react";
import { Modal } from "../../ui/Modal";
import { LoadingState } from "../../ui/LoadingState";
import { EmptyState } from "../../ui/EmptyState";
import { SensorHistoryChart } from "./SensorHistoryChart";
import { getHeartRateHistory, getBodyTemperatureHistory } from "../../../api/userSensorApi";

const SENSOR_CONFIG = {
  heartRate: { title: "Heart Rate", fetch: getHeartRateHistory },
  bodyTemperature: { title: "Body Temperature", fetch: getBodyTemperatureHistory },
};

// #6/#7 — personalized: current value, the worker's own baseline, deviation
// from it, and a 7-day daily-average chart. Never shows environmental
// SAFE/WARNING/CRITICAL ranges — heart rate and body temperature are judged
// against the individual's baseline, not a population threshold table.
export function PersonalizedSensorModal({ open, onClose, userId, sensor }) {
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
              <span className="ps-sensor-value-label">Worker Baseline</span>
              <span className="ps-sensor-value-big">
                {data.baseline !== null ? `${data.baseline} ${data.unit}` : "Baseline not configured"}
              </span>
            </div>

            <div className="ps-sensor-value-block">
              <span className="ps-sensor-value-label">Deviation from Baseline</span>
              <span className={`ps-sensor-value-big ${data.deviationPercent > 0 ? "is-elevated" : ""}`}>
                {data.deviationPercent !== null ? `${data.deviationPercent > 0 ? "+" : ""}${data.deviationPercent}%` : "Unavailable"}
              </span>
            </div>
          </div>

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
