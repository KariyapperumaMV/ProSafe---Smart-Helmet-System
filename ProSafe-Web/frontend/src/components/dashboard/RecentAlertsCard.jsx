import { useState } from "react";
import { GlassCard } from "../ui/GlassCard";
import { StatusBadge } from "../ui/StatusBadge";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { AlertDetailModal } from "./AlertDetailModal";
import { formatRelativeTime } from "../../utils/formatRelativeTime";

function alertTone(alert) {
  if (alert.type === "EMERGENCY") return "danger";
  if (alert.currentRiskState === "CRITICAL") return "critical";
  if (alert.currentRiskState === "WARNING") return "warning";
  return "green";
}

// Shared by the admin (all workers) and worker (own only) dashboards — the
// backend decides which alerts this card receives, this component only
// renders whatever array it's given (#17: RBAC lives in one place, the
// service, not duplicated in two card variants).
export function RecentAlertsCard({ title = "Recent Alerts", alerts, emptyMessage = "No alerts to show." }) {
  const [selected, setSelected] = useState(null);

  return (
    <GlassCard className="ps-alerts-card">
      <div className="ps-filter-bar" style={{ padding: 0 }}>
        <h3 className="ps-detail-section-title" style={{ margin: 0 }}>
          {title}
        </h3>
      </div>

      {!alerts?.length ? (
        <EmptyState icon="🔔" title={emptyMessage} />
      ) : (
        <ul className="ps-alert-list">
          {alerts.map((alert) => (
            <li key={alert.id} className={`ps-alert-row ${!alert.resolved ? "is-unresolved" : ""}`}>
              <span className={`ps-alert-bar ps-alert-bar-${alertTone(alert)}`} aria-hidden="true" />
              <div className="ps-alert-row-main">
                <div className="ps-alert-row-top">
                  <span className="ps-alert-row-worker">{alert.workerName}</span>
                  <StatusBadge tone={alertTone(alert)}>{alert.type}</StatusBadge>
                  {!alert.resolved && <StatusBadge tone="neutral">Unresolved</StatusBadge>}
                </div>
                <span className="ps-alert-row-desc">{alert.label}</span>
              </div>
              <span className="ps-alert-row-time">{formatRelativeTime(alert.timestamp)}</span>
              <Button variant="secondary" size="sm" onClick={() => setSelected(alert)}>
                View
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AlertDetailModal open={!!selected} alert={selected} onClose={() => setSelected(null)} />
    </GlassCard>
  );
}
