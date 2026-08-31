import { GlassCard } from "../ui/GlassCard";
import { EmptyState } from "../ui/EmptyState";
import { formatRelativeTime } from "../../utils/formatRelativeTime";

export function AssignedHelmetCard({ helmet }) {
  return (
    <GlassCard className="ps-assigned-helmet-card">
      <h3 className="ps-detail-section-title">Assigned Helmet</h3>
      {!helmet ? (
        <EmptyState icon="⛑" title="No helmet assigned" />
      ) : (
        <div className="ps-sensor-value-row">
          <div className="ps-sensor-value-block">
            <span className="ps-sensor-value-label">Helmet ID</span>
            <span className="ps-sensor-value-big">{helmet.helmetId}</span>
          </div>
          <div className="ps-sensor-value-block">
            <span className="ps-sensor-value-label">Status</span>
            {helmet.online === null ? (
              <span className="ps-help-text">No sensor data received yet</span>
            ) : (
              <span className={`ps-online-dot ${helmet.online ? "is-online" : "is-offline"}`}>
                <span className="ps-status-dot" aria-hidden="true" />
                {helmet.online ? "Online" : "Offline"}
              </span>
            )}
            {helmet.lastSeenAt && <span className="ps-help-text">Last seen {formatRelativeTime(helmet.lastSeenAt)}</span>}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
