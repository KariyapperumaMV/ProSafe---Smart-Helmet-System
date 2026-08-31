import { useEffect, useState } from "react";
import { GlassCard } from "../ui/GlassCard";
import { LoadingState } from "../ui/LoadingState";
import { EmptyState } from "../ui/EmptyState";
import { getSystemInfo } from "../../api/settingsApi";

// `fullWidth` lets SettingsPage span this card across both grid columns for
// a WORKER (who has no Site Settings card to sit beside it) rather than
// leaving a visible empty cell (#27).
export function SystemInfoCard({ fullWidth = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getSystemInfo()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  return (
    <GlassCard className={`ps-settings-card ${fullWidth ? "ps-settings-span-full" : ""}`}>
      <h3 className="ps-detail-section-title">System Information</h3>
      {loading ? (
        <LoadingState label="Loading system information…" />
      ) : error ? (
        <EmptyState icon="⚠" title="Couldn't load system information" description={error.message} />
      ) : (
        <dl className="ps-detail-fields">
          <div>
            <dt>Application</dt>
            <dd>{data.appName}</dd>
          </div>
          <div>
            <dt>Logged-in Role</dt>
            <dd>{data.role}</dd>
          </div>
          <div>
            <dt>User ID</dt>
            <dd>{data.userId}</dd>
          </div>
          <div>
            <dt>Timezone</dt>
            <dd>{data.timezone}</dd>
          </div>
          <div>
            <dt>API Status</dt>
            <dd>{data.apiStatus === "ok" ? "OK" : data.apiStatus}</dd>
          </div>
          <div>
            <dt>ML Integration</dt>
            {/* Never "Online" — this endpoint never pings the ML service,
                only reports whether ML_SERVICE_URL is set (#18). */}
            <dd>{data.mlServiceConfigured ? "Configured" : "Not configured"}</dd>
          </div>
        </dl>
      )}
    </GlassCard>
  );
}
