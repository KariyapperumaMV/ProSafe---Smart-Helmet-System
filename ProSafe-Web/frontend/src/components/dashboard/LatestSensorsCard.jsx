import { Link } from "react-router-dom";
import { GlassCard } from "../ui/GlassCard";
import { EmptyState } from "../ui/EmptyState";
import { SensorCard } from "../ui/SensorCard";

// Same fields/units as the User View sensor grid (#19) — no second unit
// convention. No historical graphs here; that's what the sensor-history
// popups on the profile page are for.
const SENSOR_DEFS = [
  { key: "heartRate", label: "Heart Rate", icon: "❤", unit: "BPM" },
  { key: "bodyTemp", label: "Body Temperature", icon: "🌡", unit: "°C" },
  { key: "ambientTemp", label: "Ambient Temp", icon: "🌤", unit: "°C" },
  { key: "noise", label: "Noise", icon: "🔊", unit: "dB" },
  { key: "gas", label: "Gas (PPM)", icon: "☁", unit: "ppm" },
  { key: "uv", label: "UV Light", icon: "☀", unit: "" },
];

export function LatestSensorsCard({ latestSensors }) {
  return (
    <GlassCard className="ps-latest-sensors-card">
      <h3 className="ps-detail-section-title">Latest Sensor Summary</h3>
      {!latestSensors ? (
        <EmptyState icon="📡" title="No sensor data received yet" />
      ) : (
        <>
          <div className="ps-sensor-grid">
            {SENSOR_DEFS.map((def) => (
              <SensorCard key={def.key} icon={def.icon} label={def.label} unit={def.unit} value={latestSensors[def.key] ?? null} />
            ))}
          </div>
          <Link to="/profile" className="ps-map-link">
            View full profile ↗
          </Link>
        </>
      )}
    </GlassCard>
  );
}
