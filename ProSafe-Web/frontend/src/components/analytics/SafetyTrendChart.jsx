import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GlassCard } from "../ui/GlassCard";
import { EmptyState } from "../ui/EmptyState";
import { formatBucketLabel } from "../../utils/formatBucketLabel";

function TrendTooltip({ active, payload, label, granularity }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  return (
    <div className="ps-chart-tooltip">
      <div className="ps-chart-tooltip-date">{formatBucketLabel(label, granularity)}</div>
      <div>Warning: {point.warning}</div>
      <div>Critical: {point.critical}</div>
      <div>Emergency: {point.emergency}</div>
    </div>
  );
}

// Stacked bars: total bar height reads as total alerts, colored by
// severity — deliberately not a line chart, since these are discrete event
// counts per bucket, not a continuous measurement (#22).
export function SafetyTrendChart({ riskTrend, granularity }) {
  const hasActivity = riskTrend.some((r) => r.warning || r.critical || r.emergency);

  return (
    <GlassCard className="ps-analytics-card">
      <h3 className="ps-detail-section-title">Safety Events Trend</h3>
      {!hasActivity ? (
        <EmptyState icon="📈" title="No safety events in this period" />
      ) : (
        <div className="ps-chart-wrap">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={riskTrend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="rgba(148,214,200,0.12)" vertical={false} />
              <XAxis
                dataKey="bucket"
                tickFormatter={(b) => formatBucketLabel(b, granularity)}
                tick={{ fill: "var(--ps-text-muted)", fontSize: 11 }}
                axisLine={{ stroke: "rgba(148,214,200,0.2)" }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fill: "var(--ps-text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
              <Tooltip content={<TrendTooltip granularity={granularity} />} cursor={{ fill: "rgba(45,212,191,0.06)" }} />
              <Legend wrapperStyle={{ fontSize: 12, color: "var(--ps-text-muted)" }} />
              <Bar dataKey="warning" stackId="a" name="Warning" fill="var(--ps-warning)" />
              <Bar dataKey="critical" stackId="a" name="Critical" fill="var(--ps-critical)" />
              <Bar dataKey="emergency" stackId="a" name="Emergency" fill="var(--ps-danger)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  );
}
