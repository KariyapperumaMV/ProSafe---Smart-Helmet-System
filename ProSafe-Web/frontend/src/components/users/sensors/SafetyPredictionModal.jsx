import { useEffect, useState } from "react";
import { Modal } from "../../ui/Modal";
import { LoadingState } from "../../ui/LoadingState";
import { EmptyState } from "../../ui/EmptyState";
import { RiskBadge, StatusBadge } from "../../ui/StatusBadge";
import { PredictionTimelineChart } from "./PredictionTimelineChart";
import { getSafetyPredictionHistory } from "../../../api/userSensorApi";

// #16-#19 — shows the persisted ML state/confidence exactly as stored, and
// today's accepted-prediction history as a stepped timeline. Emergency is
// rendered as a clearly separate banner, never as if it were one of the
// ML's SAFE/WARNING/CRITICAL classes (it isn't one, and the pipeline never
// treats it as one — see WorkerProcessingState.emergencyActive).
export function SafetyPredictionModal({ open, onClose, userId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    setError(null);
    getSafetyPredictionHistory(userId)
      .then(setData)
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, [open, userId]);

  useEffect(() => {
    if (!open) setData(null);
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Safety Prediction" width={640}>
      {loading && <LoadingState label="Loading safety prediction history…" />}

      {!loading && error && (
        <EmptyState
          icon="⚠"
          title={error.status === 401 || error.status === 403 ? "Not authorized to view this data" : "Couldn't load this data"}
          description={error.message}
        />
      )}

      {!loading && !error && data && (
        <div className="ps-sensor-modal-body">
          {data.emergencyActive && (
            <div className="ps-emergency-banner">
              <StatusBadge tone="danger">Emergency Active</StatusBadge>
              <span>This worker&rsquo;s emergency status is separate from the ML prediction below.</span>
            </div>
          )}

          <div className="ps-sensor-value-row">
            <div className="ps-sensor-value-block">
              <span className="ps-sensor-value-label">Current Smoothed Risk State</span>
              <RiskBadge state={data.currentRiskState} />
            </div>

            <div className="ps-sensor-value-block">
              <span className="ps-sensor-value-label">Latest Prediction</span>
              {data.latestPrediction ? (
                <>
                  <RiskBadge state={data.latestPrediction.state} />
                  <span className="ps-help-text">
                    {Math.round(data.latestPrediction.confidence * 100)}% confidence ·{" "}
                    {new Date(data.latestPrediction.timestamp).toLocaleTimeString()}
                  </span>
                </>
              ) : (
                <span className="ps-sensor-value-big">No accepted prediction yet</span>
              )}
            </div>
          </div>

          <h3 className="ps-detail-section-title">Today&rsquo;s Prediction Timeline</h3>
          {data.todayHistory.length === 0 ? (
            <EmptyState icon="📈" title="No accepted predictions recorded yet today." />
          ) : (
            <PredictionTimelineChart segments={data.todayHistory} />
          )}
        </div>
      )}
    </Modal>
  );
}
