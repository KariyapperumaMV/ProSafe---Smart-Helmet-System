import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { EmptyState } from "../ui/EmptyState";
import { formatRelativeTime } from "../../utils/formatRelativeTime";

function pinIcon(online) {
  return L.divIcon({
    className: "ps-map-pin",
    html: `<span class="ps-map-pin-dot ${online ? "is-online" : "is-offline"}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

// Fits the view to whatever pins exist rather than defaulting to any
// hardcoded coordinates — a single worker gets centered on them directly,
// since fitBounds on one point alone would zoom in to street level with no
// useful padding logic.
function FitToLocations({ locations }) {
  const map = useMap();

  useEffect(() => {
    if (!locations.length) return;
    if (locations.length === 1) {
      map.setView([locations[0].lat, locations[0].lon], 15);
    } else {
      const bounds = L.latLngBounds(locations.map((loc) => [loc.lat, loc.lon]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [locations, map]);

  return null;
}

// #23/#26/#34 — only ever plots a worker whose helmet has sent a genuine
// valid GPS fix (the backend excludes everyone else, never fabricates a
// fallback coordinate). Offline pins are worded "last known location," never
// implying the worker is physically there right now.
export function WorkerLocationMap({ locations }) {
  const list = locations || [];

  if (!list.length) {
    return (
      <EmptyState
        icon="📍"
        title="No worker locations yet"
        description="A pin appears here once a worker's helmet reports a valid GPS reading."
      />
    );
  }

  return (
    <div className="ps-map-container">
      <MapContainer
        center={[list[0].lat, list[0].lon]}
        zoom={13}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToLocations locations={list} />
        {list.map((loc) => (
          <Marker key={loc.userId} position={[loc.lat, loc.lon]} icon={pinIcon(loc.online)}>
            <Popup>
              <div className="ps-map-popup">
                <strong>{loc.workerName}</strong>
                <span>Helmet {loc.helmetId}</span>
                <span>{loc.online ? "Online" : "Offline"}</span>
                <span>{loc.online ? "Current location" : "Last known location"}</span>
                <span>Last update: {formatRelativeTime(loc.locationTimestamp)}</span>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
