import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GlassCard } from "../ui/GlassCard";
import { EmptyState } from "../ui/EmptyState";
import { formatBucketLabel } from "../../utils/formatBucketLabel";

const SENSORS = [
  { key: "ambientTemperature", label: "Ambient Temperature", unit: "°C" },
  { key: "noise", label: "Noise", unit: "dB" },
  { key: "gas", label: "Gas", unit: "ppm" },
  { key: "uv", label: "UV", unit: "" },
];

function EnvTooltip({ active, payload, label, unit, granularity }) {
  if (!active || !payload?.length || payload[0].value === null) return null;
  return (
    <div className="ps-chart-tooltip">
      <div className="ps-chart-tooltip-date">{formatBucketLabel(label, granularity)}</div>
      <div>
        {payload[0].value}
        {unit ? ` ${unit}` : ""}
      </div>
    </div>
  );
}

// One sensor at a time (#9/#12) — every sensor's summary AND trend are
// already in the main Analytics response, so switching the dropdown never
// triggers a refetch.
export function EnvironmentalAnalyticsCard({ environment, granularity }) {
  const [selected, setSelected] = useState("ambientTemperature");
  const meta = SENSORS.find((s) => s.key === selected);
  const summary = environment.summary[selected];
  const trend = environment.trends[selected];
  const hasTrendData = trend.some((t) => t.avg !== null);

  return (
    <GlassCard className="ps-analytics-card">
      <div className="ps-filter-bar" style={{ padding: 0 }}>
        <h3 className="ps-detail-section-title" style={{ margin: 0 }}>
          Environmental Trends
        </h3>
        <select className="ps-select" value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Select environmental sensor">
          {SENSORS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {summary.totalReadings === 0 ? (
        <EmptyState icon="🌡" title={`No ${meta.label.toLowerCase()} readings in this period`} />
      ) : (
        <>
          <div className="ps-env-stats-row">
            <div className="ps-env-stat">
              <span className="ps-env-stat-label">Average</span>
              <span className="ps-env-stat-value">
                {summary.avg}
                {meta.unit}
              </span>
            </div>
            <div className="ps-env-stat">
              <span className="ps-env-stat-label">Min</span>
              <span className="ps-env-stat-value">
                {summary.min}
                {meta.unit}
              </span>
            </div>
            <div className="ps-env-stat">
              <span className="ps-env-stat-label">Max</span>
              <span className="ps-env-stat-value">
                {summary.max}
                {meta.unit}
              </span>
            </div>
            <div className="ps-env-stat">
              <span className="ps-env-stat-label">Warning</span>
              <span className="ps-env-stat-value is-warning">
                {summary.warningReadings} ({summary.warningPercent}%)
              </span>
            </div>
            <div className="ps-env-stat">
              <span className="ps-env-stat-label">Critical</span>
              <span className="ps-env-stat-value is-critical">
                {summary.criticalReadings} ({summary.criticalPercent}%)
              </span>
            </div>
          </div>

          {hasTrendData && (
            <div className="ps-chart-wrap">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(148,214,200,0.12)" vertical={false} />
                  <XAxis
                    dataKey="bucket"
                    tickFormatter={(b) => formatBucketLabel(b, granularity)}
                    tick={{ fill: "var(--ps-text-muted)", fontSize: 11 }}
                    axisLine={{ stroke: "rgba(148,214,200,0.2)" }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fill: "var(--ps-text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={40} domain={["auto", "auto"]} />
                  <Tooltip content={<EnvTooltip unit={meta.unit} granularity={granularity} />} />
                  <Line type="monotone" dataKey="avg" stroke="var(--ps-cyan)" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
}
