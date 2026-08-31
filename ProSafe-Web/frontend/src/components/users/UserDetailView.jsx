import { useState } from "react";
import { UserAvatar } from "../ui/UserAvatar";
import { RoleBadge, RiskBadge } from "../ui/StatusBadge";
import { GlassCard } from "../ui/GlassCard";
import { EmptyState } from "../ui/EmptyState";
import { SensorCard } from "../ui/SensorCard";
import { USER_ROLES } from "../../constants/roles";
import { PersonalizedSensorModal } from "./sensors/PersonalizedSensorModal";
import { EnvironmentalSensorModal } from "./sensors/EnvironmentalSensorModal";
import { SafetyPredictionModal } from "./sensors/SafetyPredictionModal";
import { WorkerLocationCompactCard } from "./WorkerLocationCompactCard";
import { CurrentConditionCard } from "./CurrentConditionCard";

// `modal` links each live-reading card to the popup it opens (#20) — the
// same key doubles as the userSensorApi path segment, so SENSOR_DEFS is the
// one place a sensor's identity is defined.
const SENSOR_DEFS = [
  { key: "heartRate", label: "Heart Rate", icon: "❤", unit: "BPM", modal: { type: "personalized", sensor: "heartRate" } },
  { key: "bodyTemp", label: "Body Temperature", icon: "🌡", unit: "°C", modal: { type: "personalized", sensor: "bodyTemperature" } },
  { key: "ambientTemp", label: "Ambient Temp", icon: "🌤", unit: "°C", modal: { type: "environmental", sensor: "ambientTemperature" } },
  { key: "noise", label: "Noise", icon: "🔊", unit: "dB", modal: { type: "environmental", sensor: "noise" } },
  { key: "gas", label: "Gas (PPM)", icon: "☁", unit: "ppm", modal: { type: "environmental", sensor: "gas" } },
  { key: "uv", label: "UV Light", icon: "☀", unit: "", modal: { type: "environmental", sensor: "uv" } },
];

// #14/#16 — worker view shows compact sensor cards (not gauges, per the
// doc's own note) plus current risk state, only when a helmet is assigned
// and the pipeline has produced data. Admin view never shows any of this.
export function UserDetailView({ data, actions }) {
  const { user, currentRiskState, emergencyActive, latestSensorData, online, lastSeenAt, location } = data;
  const isWorker = user.role === USER_ROLES.WORKER;
  const [activeModal, setActiveModal] = useState(null); // { type, sensor } | { type: "prediction" } | null

  return (
    <div className="ps-detail-grid">
      <GlassCard className="ps-detail-identity">
        <UserAvatar name={user.name} imageUrl={user.profileImageUrl} size={96} />
        <h2 className="ps-detail-name">{user.name}</h2>
        <RoleBadge role={user.role} />

        {isWorker && (
          <button
            type="button"
            className="ps-detail-risk ps-detail-risk-btn"
            onClick={() => setActiveModal({ type: "prediction" })}
            aria-label="View safety prediction history"
          >
            {emergencyActive ? (
              <span className="ps-badge ps-badge-danger">Emergency Active</span>
            ) : (
              <RiskBadge state={currentRiskState} />
            )}
          </button>
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
            <GlassCard className="ps-sensor-readings-card">
              <EmptyState icon="⛑" title="No helmet assigned" description="Sensor and safety data will appear once a helmet is assigned." />
            </GlassCard>
          ) : !latestSensorData ? (
            <GlassCard className="ps-sensor-readings-card">
              <EmptyState icon="📡" title="Helmet offline" description="No sensor readings have been received yet." />
            </GlassCard>
          ) : (
            <>
              <GlassCard className="ps-sensor-readings-card">
                <h3 className="ps-detail-section-title">Sensor Readings</h3>
                <p className="ps-detail-timestamp">
                  {online === false ? "Last known readings" : "Current readings"} · Last updated{" "}
                  {new Date(latestSensorData.timestamp).toLocaleString()}
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
                        onClick={() => setActiveModal(def.modal)}
                      />
                    );
                  })}
                </div>
              </GlassCard>

              <WorkerLocationCompactCard
                userId={user.userId}
                workerName={user.name}
                helmetId={user.helmetId}
                online={online}
                lastSeenAt={lastSeenAt}
                location={location}
              />
            </>
          )}

          {/* Guidance always mounts for a worker, independent of whether a
              helmet/packet exists — the backend's own NO_HELMET/NO_DATA
              responses handle those states declaratively (backend is the
              source of truth), rather than being swallowed by the empty
              states above. */}
          <CurrentConditionCard userId={user.userId} />
        </div>
      )}

      {isWorker && (
        <>
          <PersonalizedSensorModal
            open={activeModal?.type === "personalized"}
            onClose={() => setActiveModal(null)}
            userId={user.userId}
            sensor={activeModal?.sensor}
          />
          <EnvironmentalSensorModal
            open={activeModal?.type === "environmental"}
            onClose={() => setActiveModal(null)}
            userId={user.userId}
            sensor={activeModal?.sensor}
          />
          <SafetyPredictionModal
            open={activeModal?.type === "prediction"}
            onClose={() => setActiveModal(null)}
            userId={user.userId}
          />
        </>
      )}
    </div>
  );
}
