import { GlassCard } from "../ui/GlassCard";

// Numbers only — mirrors exactly what Helmet Management itself counts, via
// the same shared helmetService helpers, so the two pages can never
// disagree (#17).
export function HelmetHealthCard({ helmetStatus }) {
  const rows = [
    { label: "Registered", value: helmetStatus.registered },
    { label: "Online", value: helmetStatus.online, tone: "green" },
    { label: "Offline", value: helmetStatus.offline, tone: "neutral" },
    { label: "Assigned", value: helmetStatus.assigned },
    { label: "Unassigned", value: helmetStatus.unassigned },
  ];

  return (
    <GlassCard className="ps-helmet-health-card">
      <div className="ps-filter-bar" style={{ padding: 0 }}>
        <h3 className="ps-detail-section-title" style={{ margin: 0 }}>
          Helmet Health
        </h3>
        {helmetStatus.onlinePercent !== null && (
          <span className="ps-helmet-health-pct">{helmetStatus.onlinePercent}% online</span>
        )}
      </div>

      <div className="ps-helmet-health-grid">
        {rows.map((row) => (
          <div key={row.label} className="ps-helmet-health-stat">
            <span className={`ps-helmet-health-num ${row.tone ? `is-${row.tone}` : ""}`}>{row.value}</span>
            <span className="ps-helmet-health-label">{row.label}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
