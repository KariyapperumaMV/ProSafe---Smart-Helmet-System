import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function formatDateLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// A bar per day (not a line) is deliberate: daily averages are discrete,
// unconnected values — a day with no valid readings is simply absent from
// `data` (never zero-filled), and a bar chart doesn't visually imply an
// interpolated value across that gap the way a connected line would.
function ChartTooltip({ active, payload, unit }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="ps-chart-tooltip">
      <div className="ps-chart-tooltip-date">{formatDateLabel(point.date)}</div>
      <div>
        {point.average}
        {unit ? ` ${unit}` : ""}
      </div>
      <div className="ps-chart-tooltip-sub">{point.sampleCount} readings</div>
    </div>
  );
}

export function SensorHistoryChart({ data, unit }) {
  return (
    <div className="ps-chart-wrap" role="img" aria-label="Past 7 days daily average chart">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="rgba(148,214,200,0.12)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDateLabel}
            tick={{ fill: "var(--ps-text-muted)", fontSize: 12 }}
            axisLine={{ stroke: "rgba(148,214,200,0.2)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--ps-text-muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ fill: "rgba(45,212,191,0.08)" }} />
          <Bar dataKey="average" fill="var(--ps-cyan)" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
