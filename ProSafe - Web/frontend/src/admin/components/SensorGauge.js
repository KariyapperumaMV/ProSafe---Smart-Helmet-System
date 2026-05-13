import { classify } from "./SensorUtils";

const polarToCartesian = (cx, cy, r, angleDeg) => {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
};

const arcPath = (cx, cy, r, startAngle, endAngle) => {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";

  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
};

const SensorGauge = ({
  label,
  value,
  unit,
  min,
  max,
  thresholds, 
  // thresholds example:
  // [
  //   { value: 35, color: "#e74c3c", label: "35" },
  //   { value: 38, color: "#2ecc71", label: "38" },
  //   { value: 39, color: "#f1c40f", label: "39" }
  // ]
   classifyType,
   onClick
}) => {
    const v = value ?? min;
  const clamped = Math.min(Math.max(v, min), max);

  const angle =
    ((clamped - min) / (max - min)) * 180 - 90;

  const cx = 100;
  const cy = 100;
  const r = 80;

  const allStops = [
    { value: min },
    ...thresholds,
    { value: max },
  ];

  // Detect status for label coloring
  const status =
  classifyType && value !== undefined
    ? classify[classifyType](value)
    : "";

  return (
    <div className={`sensor-gauge ${status}`}>
      <svg viewBox="-10 -10 220 120" width="160">

        {/* ARCS */}
        {allStops.map((t, i) => {
          if (!allStops[i + 1]) return null;

          const start =
            ((t.value - min) / (max - min)) * 180 - 90;
          const end =
            ((allStops[i + 1].value - min) / (max - min)) * 180 - 90;

          return (
            <path
              key={i}
              d={arcPath(cx, cy, r, start, end)}
              stroke={thresholds[i]?.color || "#ccc"}
              strokeWidth="12"
              fill="none"
              strokeLinecap="round"
            />
          );
        })}

        {/* NEEDLE */}
        <line
          x1={cx}
          y1={cy}
          x2={cx}
          y2={cy - 60}
          stroke="#fff"
          strokeWidth="3"
          style={{
            transform: `rotate(${angle}deg)`,
            transformOrigin: "100px 100px",
            transition: "transform 0.4s ease",
          }}
        />

        {/* CENTER DOT */}
        <circle cx={cx} cy={cy} r="5" fill="#fff" />

        {/* THRESHOLD LABELS */}
        {thresholds.map((t, i) => {
          const a =
            ((t.value - min) / (max - min)) * 180 - 90;
          const p = polarToCartesian(cx, cy, r + 18, a);

          return (
            <text
              key={i}
              x={p.x}
              y={p.y}
              fontSize="12"
              fill="#fff"
              textAnchor="middle"
            >
              {t.label}
            </text>
          );
        })}
      </svg>

      <div className="gauge-value">
        {value ?? "-"} {unit}
      </div>

      {/* Sensor Label */}
      <div
        className={`gauge-label ${status} clickable`}
        onClick={() => onClick?.(classifyType)}
      >
        {label}
      </div>
      
    </div>
  );
};

export default SensorGauge;