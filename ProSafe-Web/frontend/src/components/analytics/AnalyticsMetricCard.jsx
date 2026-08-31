import { GlassCard } from "../ui/GlassCard";

// Neutral wording only — a smaller number is not automatically "better"
// (fewer recorded alerts could also mean lower helmet reporting), so this
// never says "improved"/"worsened", just the factual change in volume.
function comparisonText(percent) {
  if (percent === null || percent === undefined) return "New this period";
  if (percent === 0) return "No change vs previous period";
  const direction = percent > 0 ? "more" : "fewer";
  return `${Math.abs(percent)}% ${direction} vs previous period`;
}

export function AnalyticsMetricCard({ icon, label, value, tone = "neutral", comparisonPercent }) {
  const hasComparison = comparisonPercent !== undefined;
  return (
    <GlassCard className="ps-metric-card">
      <div className={`ps-metric-icon ps-metric-icon-${tone}`} aria-hidden="true">
        {icon}
      </div>
      <div className="ps-metric-value">{value}</div>
      <div className="ps-metric-label">{label}</div>
      {hasComparison && <div className="ps-metric-comparison">{comparisonText(comparisonPercent)}</div>}
    </GlassCard>
  );
}
