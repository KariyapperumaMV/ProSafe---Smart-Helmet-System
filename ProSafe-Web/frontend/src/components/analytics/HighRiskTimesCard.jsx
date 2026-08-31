import { GlassCard } from "../ui/GlassCard";
import { EmptyState } from "../ui/EmptyState";
import { StatusBadge } from "../ui/StatusBadge";

// Severity-first ranking decided entirely by the backend (emergency desc,
// then critical, then total alerts) — this just renders whatever order it's
// given.
export function HighRiskTimesCard({ highRiskTimes }) {
  return (
    <GlassCard className="ps-analytics-card">
      <h3 className="ps-detail-section-title">High-Risk Times</h3>
      {!highRiskTimes.length ? (
        <EmptyState icon="🕐" title="No alerts recorded in this period" />
      ) : (
        <ul className="ps-high-risk-list">
          {highRiskTimes.map((h) => (
            <li key={h.hour}>
              <span className="ps-high-risk-label">{h.label}</span>
              <span className="ps-high-risk-badges">
                <StatusBadge tone="neutral">{h.totalAlerts} total</StatusBadge>
                {h.warning > 0 && <StatusBadge tone="warning">{h.warning} warning</StatusBadge>}
                {h.critical > 0 && <StatusBadge tone="critical">{h.critical} critical</StatusBadge>}
                {h.emergency > 0 && <StatusBadge tone="danger">{h.emergency} emergency</StatusBadge>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
