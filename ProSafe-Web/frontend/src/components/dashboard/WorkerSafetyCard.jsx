import { GlassCard } from "../ui/GlassCard";
import { StatusBadge, RiskBadge } from "../ui/StatusBadge";

// operationalState is already computed server-side (#18: EMERGENCY overrides
// everything, UNKNOWN when there's no processing state yet, never SAFE by
// default) — this component just displays it, no re-deriving.
export function WorkerSafetyCard({ status }) {
  const isEmergency = status.operationalState === "EMERGENCY";

  return (
    <GlassCard className="ps-worker-safety-card">
      <h3 className="ps-detail-section-title">Current Safety Status</h3>
      {isEmergency ? (
        <StatusBadge tone="danger">EMERGENCY</StatusBadge>
      ) : (
        <RiskBadge state={status.currentRiskState} />
      )}
    </GlassCard>
  );
}
