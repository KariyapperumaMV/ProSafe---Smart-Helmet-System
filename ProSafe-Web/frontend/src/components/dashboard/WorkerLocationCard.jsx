import { GlassCard } from "../ui/GlassCard";
import { WorkerLocationMap } from "./WorkerLocationMap";

export function WorkerLocationCard({ locations }) {
  return (
    <GlassCard className="ps-location-card">
      <h3 className="ps-detail-section-title">Worker Locations</h3>
      <WorkerLocationMap locations={locations} />
    </GlassCard>
  );
}
