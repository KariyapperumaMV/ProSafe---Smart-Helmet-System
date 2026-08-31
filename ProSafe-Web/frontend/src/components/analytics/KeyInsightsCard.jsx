import { GlassCard } from "../ui/GlassCard";
import { EmptyState } from "../ui/EmptyState";

// Every string here comes verbatim from the backend's deterministic rule
// engine (#17) — no client-side generation, no rephrasing.
export function KeyInsightsCard({ insights }) {
  return (
    <GlassCard className="ps-analytics-card ps-key-insights-card">
      <h3 className="ps-detail-section-title">Key Insights</h3>
      {!insights.length ? (
        <EmptyState icon="💡" title="No notable patterns identified for this period" />
      ) : (
        <ul className="ps-insights-list">
          {insights.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
