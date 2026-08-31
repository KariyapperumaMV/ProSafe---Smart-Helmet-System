import { GlassCard } from "../ui/GlassCard";
import { EmptyState } from "../ui/EmptyState";

// A count summary, deliberately not a map (#10/#26 in the analysis — no map
// library added, no fabricated coordinates). `reportingCount` already only
// includes workers whose location is recent per the backend's freshness
// rule, not every historical GPS record.
export function WorkerLocationCard({ locations }) {
  const { reportingCount = 0, totalWorkers = 0 } = locations || {};

  return (
    <GlassCard className="ps-location-card">
      <h3 className="ps-detail-section-title">Worker Locations</h3>
      {totalWorkers === 0 ? (
        <EmptyState icon="📍" title="No workers yet" />
      ) : reportingCount === 0 ? (
        <EmptyState
          icon="📍"
          title="No workers currently reporting location"
          description="Location becomes available once a helmet sends a recent valid GPS reading."
        />
      ) : (
        <p className="ps-location-summary">
          <strong>{reportingCount}</strong> of <strong>{totalWorkers}</strong> workers reporting location
        </p>
      )}
    </GlassCard>
  );
}
