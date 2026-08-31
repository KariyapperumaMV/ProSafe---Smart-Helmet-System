import { GlassCard } from "../ui/GlassCard";

export function AlertResponseCard({ alertResponse: a }) {
  return (
    <GlassCard className="ps-analytics-card">
      <h3 className="ps-detail-section-title">Alert Response</h3>
      <dl className="ps-detail-fields">
        <div>
          <dt>Total Alerts</dt>
          <dd>{a.total}</dd>
        </div>
        <div>
          <dt>Acknowledged</dt>
          <dd>
            {a.acknowledged} {a.acknowledgementRate !== null ? `(${a.acknowledgementRate}%)` : ""}
          </dd>
        </div>
        <div>
          <dt>Unacknowledged</dt>
          <dd>{a.unacknowledged}</dd>
        </div>
        <div>
          <dt>Avg. Acknowledgement Time</dt>
          <dd>{a.avgAcknowledgementMinutes !== null ? `${a.avgAcknowledgementMinutes} min` : "No data"}</dd>
        </div>
        <div>
          <dt>Median Acknowledgement Time</dt>
          <dd>{a.medianAcknowledgementMinutes !== null ? `${a.medianAcknowledgementMinutes} min` : "No data"}</dd>
        </div>
        <div>
          <dt>Resolved Emergencies</dt>
          <dd>{a.resolvedEmergencies}</dd>
        </div>
        <div>
          <dt>Unresolved Emergencies</dt>
          <dd>{a.unresolvedEmergencies}</dd>
        </div>
        <div>
          <dt>Avg. Resolution Time</dt>
          <dd>
            {a.resolutionSamples > 0
              ? `${a.avgResolutionMinutes} min (based on ${a.resolutionSamples} emergenc${a.resolutionSamples === 1 ? "y" : "ies"})`
              : "No data"}
          </dd>
        </div>
      </dl>
    </GlassCard>
  );
}
