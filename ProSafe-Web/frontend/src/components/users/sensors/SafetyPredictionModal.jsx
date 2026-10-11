import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "../../ui/Modal";
import { LoadingState } from "../../ui/LoadingState";
import { EmptyState } from "../../ui/EmptyState";
import { RiskBadge, StatusBadge, OperationalStatus } from "../../ui/StatusBadge";
import { SafetyTrendChart } from "./SafetyTrendChart";
import { SafetyHistoryList } from "./SafetyHistoryList";
import { getSafetyPredictionHistory } from "../../../api/userSensorApi";
import { useLiveWorkerUpdates } from "../../../hooks/useLiveWorkerUpdates";
import { applyLiveUpdateToPredictionSummary } from "../../../utils/liveMerge";
import { DEFAULT_GAP_MS, TREND_RANGES, historyEntries, mergeLivePoints, rangeStartMs } from "../../../utils/safetyTrend";

// The x axis keeps moving even when no new data arrives.
const CLOCK_TICK_MS = 30 * 1000;

// Keeps "confirmed safety state" and "current data quality" distinct
// (the backend's operational-state rule decides which one is shown).
function statusExplanation(data) {
  if (data.operationalState === "EMERGENCY") return "Emergency is active (separate from the ML prediction).";
  if (data.operationalState === "UNCERTAIN") {
    return data.currentRiskState
      ? `No reliable prediction from the latest sensor data (last confirmed: ${data.currentRiskState}).`
      : "No reliable prediction from the latest sensor data.";
  }
  if (data.dataUncertain) return "Last confirmed safety state, kept while the latest sensor data are uncertain.";
  if (!data.operationalState || data.operationalState === "UNKNOWN") return "No safety state established yet.";
  return "Confirmed safety state (smoothed over the last predictions).";
}

// #16-#19 — the persisted, confirmed safety state and latest accepted
// prediction on top; underneath, today's history as a Safety Trend chart
// (step line over Safe / Warning / Critical; UNCERTAIN shown as grey gaps),
// then the same periods as a compact list. Loaded over REST when opened and
// kept current by live worker updates while open — no refresh needed.
// Emergency is a separate banner, never one of the ML's states.
export function SafetyPredictionModal({ open, onClose, userId }) {
  const [data, setData] = useState(null);
  const [segments, setSegments] = useState([]);
  const [range, setRange] = useState("1h");
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    ({ silent = false } = {}) => {
      if (!userId) return;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      getSafetyPredictionHistory(userId)
        .then((res) => {
          setData(res);
          setSegments(res.todayHistory || []);
          setNow(Date.now());
          setError(null);
        })
        .catch((err) => {
          if (!silent) setError(err);
        })
        .finally(() => {
          if (!silent) setLoading(false);
        });
    },
    [userId]
  );

  useEffect(() => {
    if (open && userId) load();
  }, [open, userId, load]);

  useEffect(() => {
    if (!open) {
      setData(null);
      setSegments([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, [open]);

  const gapMs = (data?.timelineGapSeconds ?? DEFAULT_GAP_MS / 1000) * 1000;

  useLiveWorkerUpdates(
    open && data ? userId : null,
    (event) => {
      setData((prev) => applyLiveUpdateToPredictionSummary(prev, event));
      if (event.points?.length) setSegments((prev) => mergeLivePoints(prev, event.points, gapMs));
      setNow(Date.now());
    },
    { onReconnect: () => load({ silent: true }) }
  );

  const startMs = rangeStartMs(range, now);
  const listed = useMemo(() => historyEntries(segments, { startMs, gapMs }), [segments, startMs, gapMs]);
  // Helmet clocks may run slightly ahead of the browser: never cut off the newest sample.
  const lastSampleMs = segments.length ? new Date(segments[segments.length - 1].to).getTime() + 1000 : 0;
  const endMs = Math.max(now, lastSampleMs, startMs + 60 * 1000);

  return (
    <Modal open={open} onClose={onClose} title="Safety Prediction" width={680}>
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
              <span className="ps-sensor-value-label">Current Status</span>
              <OperationalStatus status={data} />
              <span className="ps-help-text">{statusExplanation(data)}</span>
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

          <div className="ps-trend-header">
            <h3 className="ps-detail-section-title">Safety Trend</h3>
            <div className="ps-filter-pills" role="group" aria-label="Time range">
              {TREND_RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  className={`ps-filter-pill ${range === r.key ? "is-active" : ""}`}
                  aria-pressed={range === r.key}
                  onClick={() => setRange(r.key)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {segments.length === 0 ? (
            <EmptyState icon="📈" title="No predictions recorded yet today." />
          ) : listed.length === 0 ? (
            <EmptyState icon="📈" title="No predictions in this time range." description="Choose Today to see earlier history." />
          ) : (
            <>
              <SafetyTrendChart segments={segments} startMs={startMs} endMs={endMs} gapMs={gapMs} />
              <h4 className="ps-trend-subtitle">Status periods</h4>
              <SafetyHistoryList segments={listed} />
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
