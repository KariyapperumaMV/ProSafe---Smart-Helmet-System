import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RISK_KEYS, buildTrendData, labelForLevel } from "../../../utils/safetyTrend";
import { describeUncertainReason } from "../../../constants/uncertainReasons";

// Same status colours as the rest of the app (RiskBadge: CRITICAL = danger red).
const STATE_COLOR = {
  SAFE: "var(--ps-green)",
  WARNING: "var(--ps-warning)",
  CRITICAL: "var(--ps-danger)",
};
const STATE_LABEL = { SAFE: "Safe", WARNING: "Warning", CRITICAL: "Critical", UNCERTAIN: "Uncertain" };
const Y_DOMAIN = [-0.4, 2.4];

const timeFmt = (t, withSeconds = false) =>
  new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", ...(withSeconds ? { second: "2-digit" } : {}) });

function TrendTooltip({ active, payload }) {
  const seg = active && payload?.length ? payload[0].payload?.seg : null;
  if (!seg) return null;
  const uncertain = seg.state === "UNCERTAIN";
  return (
    <div className="ps-trend-tooltip">
      <div className="ps-trend-tooltip-time">
        {timeFmt(seg.from, true)}
        {seg.to !== seg.from ? `–${timeFmt(seg.to, true)}` : ""}
      </div>
      <div className={`ps-trend-tooltip-state ps-trend-state-${seg.state.toLowerCase()}`}>{seg.state}</div>
      {uncertain ? (
        <div>Reason: {describeUncertainReason(seg.uncertainReason) || "not recorded"}</div>
      ) : (
        <>
          {seg.avgConfidence != null && <div>Confidence: {Math.round(seg.avgConfidence * 100)}%</div>}
          {seg.dataQuality && <div>Data quality: {seg.dataQuality}</div>}
        </>
      )}
    </div>
  );
}

// "How has this worker's safety state changed over time?" — a step line on
// Safe / Warning / Critical levels. UNCERTAIN periods break the line and are
// shaded grey (hatched): UNCERTAIN is not a safety level.
export function SafetyTrendChart({ segments, startMs, endMs, gapMs, height = 220 }) {
  const { rows, bands } = useMemo(() => buildTrendData(segments, { startMs, gapMs }), [segments, startMs, gapMs]);

  return (
    <div className="ps-trend" role="img" aria-label="Safety trend chart: safety level over time">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <pattern id="ps-trend-uncertain-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--ps-uncertain-soft)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ps-uncertain)" strokeWidth="1.5" strokeOpacity="0.55" />
            </pattern>
          </defs>
          <CartesianGrid stroke="var(--ps-border)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[startMs, endMs]}
            tickFormatter={(t) => timeFmt(t)}
            minTickGap={48}
            tick={{ fill: "var(--ps-text-muted)", fontSize: 11 }}
            stroke="var(--ps-border-strong)"
            allowDataOverflow
          />
          <YAxis
            type="number"
            domain={Y_DOMAIN}
            ticks={[0, 1, 2]}
            tickFormatter={labelForLevel}
            width={62}
            tick={{ fill: "var(--ps-text-muted)", fontSize: 11 }}
            stroke="var(--ps-border-strong)"
            allowDataOverflow
          />
          {bands.map((b) => (
            <ReferenceArea
              key={`${b.x1}-${b.x2}`}
              x1={Math.max(b.x1, startMs)}
              x2={b.x2}
              y1={Y_DOMAIN[0]}
              y2={Y_DOMAIN[1]}
              fill="url(#ps-trend-uncertain-hatch)"
              fillOpacity={1}
              stroke="none"
              ifOverflow="hidden"
            />
          ))}
          <Tooltip content={<TrendTooltip />} cursor={{ stroke: "var(--ps-border-strong)" }} isAnimationActive={false} />
          {/* Thin neutral path carries the vertical transitions; coloured
              overlays mark which level each period sits at. */}
          <Line dataKey="level" type="stepAfter" stroke="var(--ps-text-faint)" strokeWidth={1.5} dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
          {RISK_KEYS.map((key) => (
            <Line
              key={key}
              dataKey={key}
              type="stepAfter"
              stroke={STATE_COLOR[key]}
              strokeWidth={3}
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
          <Line dataKey="hover" stroke="transparent" dot={false} activeDot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>

      <ul className="ps-trend-legend" aria-label="Legend">
        {["SAFE", "WARNING", "CRITICAL"].map((key) => (
          <li key={key}>
            <span className="ps-trend-swatch" style={{ background: STATE_COLOR[key] }} aria-hidden="true" />
            {STATE_LABEL[key]}
          </li>
        ))}
        <li>
          <span className="ps-trend-swatch ps-trend-swatch-uncertain" aria-hidden="true" />
          Uncertain (no reliable prediction)
        </li>
      </ul>
    </div>
  );
}
