import { GlassCard } from "../ui/GlassCard";

// "Current Helmet Status" is explicitly labeled as a present-time snapshot
// (#14) — it is not a claim that a helmet was online throughout the whole
// historical period being viewed.
export function HelmetReliabilityCard({ helmetReliability: r }) {
  return (
    <GlassCard className="ps-analytics-card">
      <h3 className="ps-detail-section-title">Helmet Reliability</h3>
      <dl className="ps-detail-fields">
        <div>
          <dt>Registered Active Helmets</dt>
          <dd>{r.registeredActiveHelmets}</dd>
        </div>
        <div>
          <dt>Reported Data This Period</dt>
          <dd>{r.reportingDuringPeriod}</dd>
        </div>
        <div>
          <dt>No Data This Period</dt>
          <dd>{r.noDataDuringPeriod.length}</dd>
        </div>
      </dl>

      {r.noDataDuringPeriod.length > 0 && (
        <p className="ps-help-text">Helmets with no data: {r.noDataDuringPeriod.join(", ")}</p>
      )}

      <div className="ps-helmet-status-heading">Current Helmet Status (as of now)</div>
      <div className="ps-helmet-health-grid">
        <div className="ps-helmet-health-stat">
          <span className="ps-helmet-health-num is-green">{r.currentlyOnline}</span>
          <span className="ps-helmet-health-label">Online</span>
        </div>
        <div className="ps-helmet-health-stat">
          <span className="ps-helmet-health-num">{r.currentlyOffline}</span>
          <span className="ps-helmet-health-label">Offline</span>
        </div>
      </div>
    </GlassCard>
  );
}
