import { GlassCard } from "../ui/GlassCard";

// Personalized (baseline-relative) metrics — never the fixed environmental
// thresholds (#10). significantEvents is null/"Not configured" for body
// temperature until an operator sets ANALYTICS_BODY_TEMP_DEVIATION_THRESHOLD_PCT
// — no fabricated threshold (#4).
function HealthMetricBlock({ title, metric }) {
  if (metric.avgAbsDeviationPct === null) {
    return (
      <div className="ps-health-block">
        <h4>{title}</h4>
        <p className="ps-help-text">No deviation data in this period.</p>
      </div>
    );
  }

  return (
    <div className="ps-health-block">
      <h4>{title}</h4>
      <dl className="ps-detail-fields">
        <div>
          <dt>Avg. Deviation</dt>
          <dd>{metric.avgAbsDeviationPct}%</dd>
        </div>
        <div>
          <dt>Max Deviation</dt>
          <dd>
            {metric.maxAbsDeviationPct}% ({metric.maxDeviationDirection} baseline)
          </dd>
        </div>
        <div>
          <dt>Significant Events</dt>
          <dd>{metric.thresholdConfigured ? metric.significantEvents : "Not configured"}</dd>
        </div>
      </dl>
      {metric.topWorkers.length > 0 && (
        <ul className="ps-mini-rank-list">
          {metric.topWorkers.slice(0, 5).map((w) => (
            <li key={w.workerId}>
              <span>{w.workerName}</span>
              <span>{w.maxAbsDeviationPct}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function HealthDeviationCard({ health }) {
  return (
    <GlassCard className="ps-analytics-card">
      <h3 className="ps-detail-section-title">Worker Health Deviations</h3>
      <div className="ps-health-grid">
        <HealthMetricBlock title="Heart Rate" metric={health.heartRate} />
        <HealthMetricBlock title="Body Temperature" metric={health.bodyTemperature} />
      </div>
    </GlassCard>
  );
}
