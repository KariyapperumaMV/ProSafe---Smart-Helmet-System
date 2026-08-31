import { useEffect, useState } from "react";
import { GlassCard } from "../ui/GlassCard";
import { LoadingState } from "../ui/LoadingState";
import { EmptyState } from "../ui/EmptyState";
import { getSiteSettings } from "../../api/settingsApi";

// ADMIN-only (the route itself renders this card only for an admin, and the
// backend independently returns 403 for anyone else — see settingsApi).
// Read-only by design — no PATCH exists for site config this phase (#15).
export function SiteSettingsCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getSiteSettings()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  return (
    <GlassCard className="ps-settings-card">
      <h3 className="ps-detail-section-title">Site Settings</h3>
      {loading ? (
        <LoadingState label="Loading site settings…" />
      ) : error ? (
        <EmptyState icon="⚠" title="Couldn't load site settings" description={error.message} />
      ) : (
        <>
          <dl className="ps-detail-fields">
            <div>
              <dt>Site Name</dt>
              <dd>{data.siteName}</dd>
            </div>
            <div>
              <dt>Site Latitude</dt>
              <dd>{data.siteLatitude !== null ? data.siteLatitude.toFixed(4) : "Not configured"}</dd>
            </div>
            <div>
              <dt>Site Longitude</dt>
              <dd>{data.siteLongitude !== null ? data.siteLongitude.toFixed(4) : "Not configured"}</dd>
            </div>
            <div>
              <dt>Site Timezone</dt>
              <dd>{data.siteTimezone}</dd>
            </div>
            <div>
              <dt>Helmet Offline Threshold</dt>
              <dd>{data.helmetOfflineAfterSeconds}s</dd>
            </div>
          </dl>
          <p className="ps-help-text">
            Read-only — coordinates may be a development placeholder rather than a verified physical site until configured otherwise.
          </p>
        </>
      )}
    </GlassCard>
  );
}
