import { useEffect, useRef, useState } from "react";
import { GlassCard } from "../ui/GlassCard";
import { StatusBadge } from "../ui/StatusBadge";
import { LoadingState } from "../ui/LoadingState";
import { EmptyState } from "../ui/EmptyState";
import { getSafetyGuidance } from "../../api/userSensorApi";
import { formatRelativeTime } from "../../utils/formatRelativeTime";

const POLL_MS = 60 * 1000;

const BADGE_TONE = {
  EMERGENCY: "danger",
  CRITICAL: "critical",
  WARNING: "warning",
  SAFE: "green",
  NO_HELMET: "neutral",
  NO_DATA: "neutral",
  UNKNOWN: "neutral",
};

const BADGE_LABEL = {
  EMERGENCY: "Emergency Active",
  CRITICAL: "Critical",
  WARNING: "Warning",
  SAFE: "Safe",
  NO_HELMET: "No Helmet",
  NO_DATA: "No Data",
  UNKNOWN: "Unknown",
};

// Deterministic, backend-rule-based guidance only (see safetyGuidanceService.js)
// — this component just renders the response, it never derives severity or
// wording on its own.
export function CurrentConditionCard({ userId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    function load() {
      getSafetyGuidance(userId)
        .then((res) => {
          if (!mountedRef.current) return;
          setData(res);
          setError(null);
        })
        .catch((err) => {
          if (!mountedRef.current) return;
          setError(err);
        })
        .finally(() => {
          if (mountedRef.current) setLoading(false);
        });
    }

    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [userId]);

  return (
    <GlassCard className="ps-guidance-card">
      <div className="ps-guidance-header">
        <h3 className="ps-detail-section-title">Current Condition &amp; Guidance</h3>
        {data && <StatusBadge tone={BADGE_TONE[data.operationalState] || "neutral"}>{BADGE_LABEL[data.operationalState] || data.operationalState}</StatusBadge>}
      </div>

      {loading && <LoadingState label="Loading current condition…" />}

      {!loading && error && (
        <EmptyState icon="⚠" title="Couldn't load current condition" description={error.message} />
      )}

      {!loading && !error && data && (
        <div className="ps-guidance-body">
          <p className="ps-guidance-summary-title">{data.summary.title}</p>
          <p className="ps-guidance-summary-desc">{data.summary.description}</p>

          {data.lastUpdated && (
            <p className="ps-detail-timestamp">
              {data.readingsLabel || "Current readings"} · Last updated {formatRelativeTime(data.lastUpdated)}
            </p>
          )}

          {data.factors.length > 0 && (
            <div className="ps-guidance-section">
              <p className="ps-guidance-section-label">Contributing Factors</p>
              <ul className="ps-guidance-factors">
                {data.factors.map((factor) => (
                  <li key={factor.sensor} className={`ps-guidance-factor is-${factor.severity.toLowerCase()}`}>
                    <span className="ps-guidance-factor-label">{factor.label}</span>
                    {factor.value !== null && (
                      <span className="ps-guidance-factor-value">
                        {factor.value}
                        {factor.unit ? ` ${factor.unit}` : ""}
                      </span>
                    )}
                    <span className="ps-guidance-factor-severity">{factor.severity}</span>
                    <span className="ps-guidance-factor-detail">{factor.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.guidance.length > 0 && (
            <div className="ps-guidance-section">
              <p className="ps-guidance-section-label">Recommended Actions</p>
              <ul className="ps-guidance-actions">
                {data.guidance.map((action, idx) => (
                  <li key={idx} className="ps-guidance-action">
                    {action.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}
