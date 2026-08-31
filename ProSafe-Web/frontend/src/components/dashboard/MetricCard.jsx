import { GlassCard } from "../ui/GlassCard";

// No "vs yesterday" trend — there's no historical snapshot to compare
// against honestly (approved: omit rather than fabricate).
export function MetricCard({ icon, label, value, tone = "neutral" }) {
  return (
    <GlassCard className="ps-metric-card">
      <div className={`ps-metric-icon ps-metric-icon-${tone}`} aria-hidden="true">
        {icon}
      </div>
      <div className="ps-metric-value">{value}</div>
      <div className="ps-metric-label">{label}</div>
    </GlassCard>
  );
}
