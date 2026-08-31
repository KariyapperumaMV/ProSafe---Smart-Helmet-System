import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { GlassCard } from "../ui/GlassCard";
import { EmptyState } from "../ui/EmptyState";

const CATEGORIES = [
  { key: "warning", label: "Warning", color: "var(--ps-warning)" },
  { key: "critical", label: "Critical", color: "var(--ps-critical)" },
  { key: "emergency", label: "Emergency", color: "var(--ps-danger)" },
];

// Donut + numeric counts beside it (#21) — never color-only, same rule
// already used by the Dashboard's Worker Status chart.
export function AlertDistributionChart({ distribution }) {
  const total = distribution.warning + distribution.critical + distribution.emergency;
  const data = CATEGORIES.map((c) => ({ ...c, value: distribution[c.key] }));

  return (
    <GlassCard className="ps-analytics-card">
      <h3 className="ps-detail-section-title">Alert Distribution</h3>
      {!total ? (
        <EmptyState icon="📊" title="No alerts in this period" />
      ) : (
        <div className="ps-worker-status-body">
          <div className="ps-worker-status-chart">
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="label" innerRadius={50} outerRadius={75} strokeWidth={0} isAnimationActive={false}>
                  {data.map((d) => (
                    <Cell key={d.key} fill={d.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="ps-worker-status-total">
              <span className="ps-worker-status-total-num">{total}</span>
              <span className="ps-worker-status-total-label">Total</span>
            </div>
          </div>

          <ul className="ps-worker-status-legend">
            {data.map((d) => (
              <li key={d.key}>
                <span className="ps-timeline-dot" style={{ background: d.color }} aria-hidden="true" />
                <span className="ps-worker-status-legend-label">{d.label}</span>
                <span className="ps-worker-status-legend-count">{d.value}</span>
                <span className="ps-worker-status-legend-pct">{total ? Math.round((d.value / total) * 100) : 0}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}
