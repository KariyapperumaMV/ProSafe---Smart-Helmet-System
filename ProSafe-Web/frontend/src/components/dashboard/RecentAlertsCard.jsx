import { useCallback, useEffect, useState } from "react";
import { GlassCard } from "../ui/GlassCard";
import { StatusBadge } from "../ui/StatusBadge";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { LoadingState } from "../ui/LoadingState";
import { AlertDetailModal } from "./AlertDetailModal";
import { ResetEmergencyModal } from "./ResetEmergencyModal";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import { getAlerts, acknowledgeAlert } from "../../api/alertApi";
import { useToast } from "../../context/ToastContext";
import { useNotificationContext } from "../../context/NotificationContext";

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "EMERGENCY", label: "Emergency" },
  { key: "WARNING", label: "Warning" },
  { key: "CRITICAL", label: "Critical" },
  { key: "UNREAD", label: "Unread" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "UNRESOLVED", label: "Unresolved" },
];

// A live notification of one of these types means the alert list this card
// shows is now stale — refetch rather than trying to hand-construct an Alert
// from the (differently-shaped) Notification event.
const LIVE_REFRESH_TYPES = new Set([
  "NEW_ALERT",
  "EMERGENCY_ALERT",
  "EMERGENCY_RESOLVED",
  "EMERGENCY_RESET_REQUESTED",
]);

function alertTone(alert) {
  if (alert.type === "EMERGENCY") return "danger";
  if (alert.currentRiskState === "CRITICAL") return "critical";
  if (alert.currentRiskState === "WARNING") return "warning";
  return "green";
}

function filterParams(filterKey) {
  switch (filterKey) {
    case "EMERGENCY":
      return { type: "EMERGENCY" };
    case "WARNING":
      return { risk: "WARNING" };
    case "CRITICAL":
      return { risk: "CRITICAL" };
    case "UNREAD":
      return { acknowledged: "false" };
    case "RESOLVED":
      return { resolved: "true" };
    case "UNRESOLVED":
      return { resolved: "false" };
    default:
      return {};
  }
}

// Shared by the admin (all workers) and worker (own only) dashboards — the
// backend decides which alerts this card receives (#17: RBAC lives in one
// place, the service). `readOnly` hides the ADMIN-only supervisory actions
// (Mark as Read, Reset Emergency) for the worker variant; View stays either
// way, since it's read-only itself.
export function RecentAlertsCard({
  title = "Recent Alerts",
  emptyMessage = "No alerts to show.",
  readOnly = false,
  days = 7,
  limit = 10,
}) {
  const { showToast } = useToast();
  const { lastEvent } = useNotificationContext();

  const [filter, setFilter] = useState("ALL");
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    return getAlerts({ days, limit, ...filterParams(filter) })
      .then((data) => setAlerts(data.alerts))
      .catch(() => showToast("Couldn't load alerts.", { type: "error" }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, days, limit]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (lastEvent && LIVE_REFRESH_TYPES.has(lastEvent.type)) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);

  async function handleMarkAsRead(alert) {
    try {
      const data = await acknowledgeAlert(alert.id);
      setAlerts((prev) => prev.map((a) => (a.id === alert.id ? data.alert : a)));
    } catch (err) {
      showToast(err.message || "Couldn't mark that alert as read.", { type: "error" });
    }
  }

  function handleResetRequested(alertId) {
    setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, resetRequested: true } : a)));
  }

  return (
    <GlassCard className="ps-alerts-card">
      <div className="ps-filter-bar" style={{ padding: 0 }}>
        <h3 className="ps-detail-section-title" style={{ margin: 0 }}>
          {title}
        </h3>
        <div className="ps-filter-pills">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`ps-filter-pill ${filter === f.key ? "is-active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !alerts.length ? (
        <LoadingState label="Loading alerts…" />
      ) : !alerts.length ? (
        <EmptyState icon="🔔" title={emptyMessage} />
      ) : (
        <ul className="ps-alert-list">
          {alerts.map((alert) => {
            const isActiveEmergency = alert.type === "EMERGENCY" && !alert.resolved;
            return (
              <li key={alert.id} className={`ps-alert-row ${!alert.resolved ? "is-unresolved" : ""}`}>
                <span className={`ps-alert-bar ps-alert-bar-${alertTone(alert)}`} aria-hidden="true" />
                <div className="ps-alert-row-main">
                  <div className="ps-alert-row-top">
                    <span className="ps-alert-row-worker">{alert.workerName}</span>
                    <StatusBadge tone={alertTone(alert)}>{alert.type}</StatusBadge>
                    {!alert.resolved && <StatusBadge tone="neutral">Unresolved</StatusBadge>}
                    {alert.resetRequested && <StatusBadge tone="warning">Reset requested</StatusBadge>}
                  </div>
                  <span className="ps-alert-row-desc">{alert.label}</span>
                </div>
                <span className="ps-alert-row-time">{formatRelativeTime(alert.timestamp)}</span>
                <div className="ps-alert-row-actions">
                  <Button variant="secondary" size="sm" onClick={() => setSelected(alert)}>
                    View
                  </Button>
                  {!readOnly && !alert.acknowledged && (
                    <Button variant="secondary" size="sm" onClick={() => handleMarkAsRead(alert)}>
                      Mark as Read
                    </Button>
                  )}
                  {!readOnly && isActiveEmergency && !alert.resetRequested && (
                    <Button variant="danger" size="sm" onClick={() => setResetTarget(alert)}>
                      Reset Emergency
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDetailModal open={!!selected} alert={selected} onClose={() => setSelected(null)} />
      <ResetEmergencyModal
        open={!!resetTarget}
        alert={resetTarget}
        onClose={() => setResetTarget(null)}
        onResetRequested={handleResetRequested}
      />
    </GlassCard>
  );
}
