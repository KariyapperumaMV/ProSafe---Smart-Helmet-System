import { describeUncertainReason } from "../../../constants/uncertainReasons";

const STATE_TONE = {
  SAFE: "green",
  WARNING: "warning",
  CRITICAL: "critical",
  UNCERTAIN: "uncertain",
};

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// Secondary to the Safety Trend chart: the same periods as text (never
// colour-only), newest first. Consecutive equal states arrive already
// grouped into one period, so this never lists second-by-second rows.
export function SafetyHistoryList({ segments }) {
  return (
    <ul className="ps-timeline-legend-list" aria-label="Safety status periods">
      {segments.map((segment) => (
        <li key={`${segment.state}-${segment.from}`}>
          <span className={`ps-timeline-dot ps-timeline-${STATE_TONE[segment.state] || "neutral"}`} aria-hidden="true" />
          <span className="ps-timeline-legend-state">{segment.state}</span>
          <span className="ps-timeline-legend-time">
            {formatTime(segment.from)}–{formatTime(segment.to)}
          </span>
          {segment.state === "UNCERTAIN"
            ? segment.uncertainReason && (
                <span className="ps-timeline-legend-confidence">{describeUncertainReason(segment.uncertainReason)}</span>
              )
            : segment.avgConfidence != null && (
                <span className="ps-timeline-legend-confidence">{Math.round(segment.avgConfidence * 100)}% confidence</span>
              )}
        </li>
      ))}
    </ul>
  );
}
