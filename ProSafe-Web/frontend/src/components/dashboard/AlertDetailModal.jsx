import { Modal } from "../ui/Modal";
import { StatusBadge } from "../ui/StatusBadge";
import { formatRelativeTime } from "../../utils/formatRelativeTime";

const SENSOR_LABELS = {
  heartRate: { label: "Heart Rate", unit: "BPM" },
  bodyTemp: { label: "Body Temperature", unit: "°C" },
  ambientTemp: { label: "Ambient Temp", unit: "°C" },
  noise: { label: "Noise", unit: "dB" },
  gas: { label: "Gas", unit: "ppm" },
  uv: { label: "UV", unit: "" },
};

// #10 — read-only, populated entirely from the already-fetched dashboard
// alert object (no extra request). Shows only fields Alert genuinely
// stores; never a fabricated "triggered by X" cause.
export function AlertDetailModal({ open, onClose, alert }) {
  if (!alert) return null;

  return (
    <Modal open={open} onClose={onClose} title="Alert Details" width={480}>
      <div className="ps-sensor-modal-body">
        <div className="ps-alert-detail-header">
          <StatusBadge tone={alert.type === "EMERGENCY" ? "danger" : "neutral"}>{alert.type}</StatusBadge>
          <span className="ps-help-text">{formatRelativeTime(alert.timestamp)}</span>
        </div>

        <p className="ps-alert-detail-label">{alert.label}</p>

        <dl className="ps-detail-fields">
          <div>
            <dt>Worker</dt>
            <dd>{alert.workerName}</dd>
          </div>
          <div>
            <dt>Helmet</dt>
            <dd>{alert.helmetId}</dd>
          </div>
          <div>
            <dt>Timestamp</dt>
            <dd>{new Date(alert.timestamp).toLocaleString()}</dd>
          </div>
          {alert.type === "TRANSITION" && (
            <div>
              <dt>Risk change</dt>
              <dd>
                {alert.previousRiskState} → {alert.currentRiskState}
              </dd>
            </div>
          )}
          {alert.confidence !== null && alert.confidence !== undefined && (
            <div>
              <dt>Confidence</dt>
              <dd>{Math.round(alert.confidence * 100)}%</dd>
            </div>
          )}
          <div>
            <dt>Read (acknowledged)</dt>
            <dd>
              {alert.acknowledged
                ? `Yes${alert.acknowledgedBy ? ` — by ${alert.acknowledgedBy}` : ""}${
                    alert.acknowledgedAt ? ` (${new Date(alert.acknowledgedAt).toLocaleString()})` : ""
                  }`
                : "No"}
            </dd>
          </div>
          {alert.type === "EMERGENCY" && !alert.resolved && (
            <div>
              <dt>Reset requested</dt>
              <dd>{alert.resetRequested ? "Yes — waiting for the helmet to confirm" : "No"}</dd>
            </div>
          )}
          <div>
            <dt>Resolved</dt>
            <dd>{alert.resolved ? "Yes" : "No"}</dd>
          </div>
        </dl>

        {alert.sensorSnapshot && (
          <>
            <h3 className="ps-detail-section-title">Sensor Snapshot</h3>
            <div className="ps-sensor-grid">
              {Object.entries(SENSOR_LABELS).map(([key, meta]) => {
                const value = alert.sensorSnapshot[key];
                if (value === undefined || value === null) return null;
                return (
                  <div key={key} className="ps-sensor-card">
                    <div className="ps-sensor-info">
                      <span className="ps-sensor-label">{meta.label}</span>
                      <span className="ps-sensor-value">
                        {value}
                        {meta.unit ? <span className="ps-sensor-unit"> {meta.unit}</span> : null}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {alert.location ? (
          <p className="ps-help-text">
            <a
              href={`https://www.google.com/maps?q=${alert.location.lat},${alert.location.lon}`}
              target="_blank"
              rel="noreferrer"
              className="ps-map-link"
            >
              Open location in Google Maps ↗
            </a>
          </p>
        ) : (
          <p className="ps-help-text">No location recorded for this alert.</p>
        )}
      </div>
    </Modal>
  );
}
