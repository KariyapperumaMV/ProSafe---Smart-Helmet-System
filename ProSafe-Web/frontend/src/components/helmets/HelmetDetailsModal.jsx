import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { LoadingState } from "../ui/LoadingState";
import { EmptyState } from "../ui/EmptyState";
import { StatusBadge, RiskBadge } from "../ui/StatusBadge";
import { getHelmet } from "../../api/helmetApi";

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleString();
}

// #20/#21 — a popup over the Helmets page. Emergency is shown as its own
// clearly-labeled state, never folded behind SAFE/WARNING/CRITICAL — same
// separation already used on the worker's own Safety Prediction modal.
export function HelmetDetailsModal({ open, onClose, helmetId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !helmetId) return;
    setLoading(true);
    setError(null);
    getHelmet(helmetId)
      .then(setData)
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, [open, helmetId]);

  useEffect(() => {
    if (!open) setData(null);
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Helmet Details" width={520}>
      {loading && <LoadingState label="Loading helmet details…" />}

      {!loading && error && (
        <EmptyState
          icon="⚠"
          title={error.status === 404 ? "Helmet not found" : "Couldn't load this helmet"}
          description={error.message}
        />
      )}

      {!loading && !error && data && (
        <div className="ps-sensor-modal-body">
          <div className="ps-helmet-detail-id">{data.helmet.helmetId}</div>

          <dl className="ps-detail-fields">
            <div>
              <dt>Created on</dt>
              <dd>{new Date(data.helmet.createdAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge tone={data.helmet.status === "ACTIVE" ? "green" : "neutral"}>{data.helmet.status}</StatusBadge>
              </dd>
            </div>
          </dl>

          <h3 className="ps-detail-section-title">Assignment</h3>
          {data.assigned ? (
            <dl className="ps-detail-fields">
              <div>
                <dt>Worker</dt>
                <dd>{data.assignedTo.name}</dd>
              </div>
              <div>
                <dt>User ID</dt>
                <dd>{data.assignedTo.userId}</dd>
              </div>
            </dl>
          ) : (
            <p className="ps-help-text">Not assigned</p>
          )}

          <h3 className="ps-detail-section-title">Connectivity</h3>
          {data.online === null ? (
            <p className="ps-help-text">No sensor data received yet</p>
          ) : (
            <div className="ps-sensor-value-row">
              <div className="ps-sensor-value-block">
                <span className="ps-sensor-value-label">Status</span>
                <span className={`ps-online-dot ${data.online ? "is-online" : "is-offline"}`}>
                  <span className="ps-status-dot" aria-hidden="true" />
                  {data.online ? "Online" : "Offline"}
                </span>
              </div>
              <div className="ps-sensor-value-block">
                <span className="ps-sensor-value-label">Last Seen</span>
                <span className="ps-sensor-value-big">{relativeTime(data.lastSeenAt)}</span>
              </div>
            </div>
          )}

          {data.latestCommand && (
            <p className="ps-help-text">
              Latest command: <strong>{data.latestCommand.command}</strong>
              {data.latestCommand.risk ? ` (${data.latestCommand.risk})` : ""}
            </p>
          )}

          {data.assigned && (
            <>
              <h3 className="ps-detail-section-title">Worker Safety</h3>
              {data.workerSafety.emergencyActive ? (
                <StatusBadge tone="danger">Emergency</StatusBadge>
              ) : (
                <RiskBadge state={data.workerSafety.currentRiskState} />
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
