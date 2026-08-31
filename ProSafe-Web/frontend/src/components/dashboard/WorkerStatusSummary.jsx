import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { GlassCard } from "../ui/GlassCard";
import { EmptyState } from "../ui/EmptyState";

// Mutually exclusive by construction on the backend (#7) — this component
// only ever displays the five counts it's given, it never re-derives or
// re-buckets anything itself.
const CATEGORIES = [
  { key: "safe", label: "Safe", color: "var(--ps-green)" },
  { key: "warning", label: "Warning", color: "var(--ps-warning)" },
  { key: "critical", label: "Critical", color: "var(--ps-critical)" },
  { key: "emergency", label: "Emergency", color: "var(--ps-danger)" },
  { key: "unknown", label: "Unknown", color: "var(--ps-text-faint)" },
];

export function WorkerStatusSummary({ workerStatus }) {
  const total = workerStatus?.total || 0;
  const data = CATEGORIES.map((c) => ({ ...c, value: workerStatus?.[c.key] || 0 }));

  return (
    <GlassCard className="ps-worker-status-card">
      <h3 className="ps-detail-section-title">Worker Status</h3>

      {!total ? (
        <EmptyState icon="👤" title="No workers yet" />
      ) : (
        <div className="ps-worker-status-body">
          <div className="ps-worker-status-chart">
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={52}
                  outerRadius={75}
                  strokeWidth={0}
                  isAnimationActive={false}
                >
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

          {/* Counts + percentages in text too — never color-only (#7/#24). */}
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
