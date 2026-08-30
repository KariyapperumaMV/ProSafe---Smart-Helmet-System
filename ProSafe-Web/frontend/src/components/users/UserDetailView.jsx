import { UserAvatar } from "../ui/UserAvatar";
import { RoleBadge, RiskBadge } from "../ui/StatusBadge";
import { GlassCard } from "../ui/GlassCard";
import { EmptyState } from "../ui/EmptyState";
import { SensorCard } from "../ui/SensorCard";
import { USER_ROLES } from "../../constants/roles";

const SENSOR_DEFS = [
  { key: "heartRate", label: "Heart Rate", icon: "❤", unit: "BPM" },
  { key: "bodyTemp", label: "Body Temperature", icon: "🌡", unit: "°C" },
  { key: "ambientTemp", label: "Ambient Temp", icon: "🌤", unit: "°C" },
  { key: "noise", label: "Noise", icon: "🔊", unit: "dB" },
  { key: "gas", label: "Gas (PPM)", icon: "☁", unit: "ppm" },
  { key: "uv", label: "UV Light", icon: "☀", unit: "" },
];

// #14/#16 — worker view shows compact sensor cards (not gauges, per the
// doc's own note) plus current risk state, only when a helmet is assigned
// and the pipeline has produced data. Admin view never shows any of this.
export function UserDetailView({ data, actions }) {
  const { user, currentRiskState, emergencyActive, latestSensorData } = data;
  const isWorker = user.role === USER_ROLES.WORKER;

  return (
    <div className="ps-detail-grid">
      <GlassCard className="ps-detail-identity">
        <UserAvatar name={user.name} imageUrl={user.profileImageUrl} size={96} />
        <h2 className="ps-detail-name">{user.name}</h2>
        <RoleBadge role={user.role} />

        {isWorker && (
          <div className="ps-detail-risk">
            {emergencyActive ? (
              <span className="ps-badge ps-badge-danger">Emergency Active</span>
            ) : (
              <RiskBadge state={currentRiskState} />
            )}
          </div>
        )}

        <dl className="ps-detail-fields">
          <div>
            <dt>User ID</dt>
            <dd>{user.userId}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Phone No</dt>
            <dd>{user.phone}</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>{user.address || "—"}</dd>
          </div>
          <div>
            <dt>NIC</dt>
            <dd>{user.nic}</dd>
          </div>
          {isWorker && (
            <div>
              <dt>Helmet</dt>
              <dd>{user.helmetId || "Not Assigned"}</dd>
            </div>
          )}
        </dl>

        {actions && <div className="ps-detail-actions">{actions}</div>}
      </GlassCard>

      {isWorker && (
        <div className="ps-detail-worker-col">
          {!user.helmetId ? (
            <GlassCard>
              <EmptyState icon="⛑" title="No helmet assigned" description="Sensor and safety data will appear once a helmet is assigned." />
            </GlassCard>
          ) : !latestSensorData ? (
            <GlassCard>
              <EmptyState icon="📡" title="Helmet offline" description="No sensor readings have been received yet." />
            </GlassCard>
          ) : (
            <>
              <GlassCard>
                <h3 className="ps-detail-section-title">Sensor Readings</h3>
                <p className="ps-detail-timestamp">
                  Last updated {new Date(latestSensorData.timestamp).toLocaleString()}
                </p>
                <div className="ps-sensor-grid">
                  {SENSOR_DEFS.map((def) => {
                    const reading = latestSensorData.sensors?.[def.key];
                    return (
                      <SensorCard
                        key={def.key}
                        icon={def.icon}
                        label={def.label}
                        unit={def.unit}
                        value={reading?.value ?? reading ?? null}
                        valid={reading?.valid !== false}
                      />
                    );
                  })}
                </div>
              </GlassCard>

              {latestSensorData.sensors?.gps?.lat && (
                <GlassCard>
                  <h3 className="ps-detail-section-title">Location</h3>
                  <a
                    href={`https://www.google.com/maps?q=${latestSensorData.sensors.gps.lat},${latestSensorData.sensors.gps.lon}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ps-map-link"
                  >
                    Open in Google Maps ↗
                  </a>
                </GlassCard>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
