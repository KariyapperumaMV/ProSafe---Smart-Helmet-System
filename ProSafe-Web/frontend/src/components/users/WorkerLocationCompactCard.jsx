import { GlassCard } from "../ui/GlassCard";
import { WorkerLocationMap } from "../dashboard/WorkerLocationMap";
import { formatRelativeTime } from "../../utils/formatRelativeTime";

// Reuses WorkerLocationMap (marker icon, fit/center, tile layer, online/
// offline color) via its `compact` prop rather than forking any Leaflet
// logic. `location` (latest packet WITH a valid GPS fix) and `online`/
// `lastSeenAt` (the helmet heartbeat) are deliberately separate concepts —
// they can legitimately point at different packets, so both are shown
// explicitly instead of collapsing into one timestamp.
export function WorkerLocationCompactCard({ userId, workerName, helmetId, online, lastSeenAt, location }) {
  const mapLocations = location
    ? [{ userId, workerName, helmetId, lat: location.lat, lon: location.lon, online, locationTimestamp: location.locationTimestamp }]
    : [];

  const lastSeenDiffersFromLocation =
    location &&
    lastSeenAt &&
    new Date(lastSeenAt).getTime() !== new Date(location.locationTimestamp).getTime();

  return (
    <GlassCard className="ps-location-card is-compact">
      <h3 className="ps-detail-section-title">Location</h3>
      <WorkerLocationMap
        locations={mapLocations}
        compact
        emptyTitle="Location unavailable"
        emptyDescription="No valid GPS location has been received from this helmet."
      />
      {location && (
        <div className="ps-location-compact-footer">
          <p className="ps-detail-timestamp">
            Helmet {online ? "online" : "offline"} · {online ? "Current location" : "Last known location"}
          </p>
          <p className="ps-detail-timestamp">
            Location recorded {formatRelativeTime(location.locationTimestamp)}
          </p>
          {lastSeenDiffersFromLocation && (
            <p className="ps-detail-timestamp">Helmet last seen {formatRelativeTime(lastSeenAt)}</p>
          )}
          <p className="ps-detail-timestamp">Helmet: {helmetId}</p>
          <a
            href={`https://www.google.com/maps?q=${location.lat},${location.lon}`}
            target="_blank"
            rel="noreferrer"
            className="ps-map-link"
          >
            Open in Google Maps ↗
          </a>
        </div>
      )}
    </GlassCard>
  );
}
