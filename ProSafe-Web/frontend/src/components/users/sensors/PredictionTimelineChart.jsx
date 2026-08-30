const STATE_TONE = {
  SAFE: "green",
  WARNING: "warning",
  CRITICAL: "critical",
};

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// SAFE/WARNING/CRITICAL are categorical, not a percentage — this renders
// today's accepted-prediction history as a sequence of colored segments
// (already transition-compressed by the backend) rather than forcing it
// into a line/bar chart built for continuous numbers. Not built on the
// shared chart library: a generic charting API doesn't map cleanly onto
// "blocks of time in one of three states."
export function PredictionTimelineChart({ segments }) {
  return (
    <div className="ps-timeline">
      <div className="ps-timeline-bar" role="img" aria-label="Today's safety prediction timeline">
        {segments.map((segment, i) => {
          const durationMs = Math.max(new Date(segment.to) - new Date(segment.from), 60 * 1000);
          return (
            <div
              key={i}
              className={`ps-timeline-segment ps-timeline-${STATE_TONE[segment.state] || "neutral"}`}
              style={{ flexGrow: durationMs }}
              title={`${segment.state} · ${formatTime(segment.from)}–${formatTime(segment.to)}`}
            />
          );
        })}
      </div>

      <ul className="ps-timeline-legend-list">
        {segments.map((segment, i) => (
          <li key={i}>
            <span className={`ps-timeline-dot ps-timeline-${STATE_TONE[segment.state] || "neutral"}`} aria-hidden="true" />
            <span className="ps-timeline-legend-state">{segment.state}</span>
            <span className="ps-timeline-legend-time">
              {formatTime(segment.from)}–{formatTime(segment.to)}
            </span>
            {segment.avgConfidence !== null && (
              <span className="ps-timeline-legend-confidence">{Math.round(segment.avgConfidence * 100)}% confidence</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
