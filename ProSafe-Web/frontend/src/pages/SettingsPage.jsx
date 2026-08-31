import { useEffect, useState } from "react";
import { PageHeader } from "../components/layout/PageHeader";
import { GlassCard } from "../components/ui/GlassCard";
import { LoadingState } from "../components/ui/LoadingState";
import { EmptyState } from "../components/ui/EmptyState";
import { AccountSettingsCard } from "../components/settings/AccountSettingsCard";
import { PasswordSettingsCard } from "../components/settings/PasswordSettingsCard";
import { NotificationSettingsCard } from "../components/settings/NotificationSettingsCard";
import { AppearanceSettingsCard } from "../components/settings/AppearanceSettingsCard";
import { SystemInfoCard } from "../components/settings/SystemInfoCard";
import { SiteSettingsCard } from "../components/settings/SiteSettingsCard";
import { useAuth } from "../context/AuthContext";
import { getMe } from "../api/userApi";
import { USER_ROLES } from "../constants/roles";

// Each card fetches/saves independently (#24) — a failure in one (e.g. Site
// Settings) never blocks the rest of the page from being usable. The only
// page-level load is the account profile itself, since every other card
// needs it (name for the avatar fallback, role for gating Site Settings/
// the locked Emergency Alerts toggle, current preferences to seed toggles).
export function SettingsPage() {
  const { updateStoredUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getMe()
      .then((data) => {
        setProfile(data.user);
        updateStoredUser(data.user);
      })
      .catch(setError)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title="Settings" crumbs={[{ label: "Settings" }]} />
        <GlassCard>
          <LoadingState label="Loading settings…" />
        </GlassCard>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div>
        <PageHeader title="Settings" crumbs={[{ label: "Settings" }]} />
        <GlassCard>
          <EmptyState icon="⚠" title="Couldn't load your profile" description={error.message} />
        </GlassCard>
      </div>
    );
  }

  const isAdmin = profile.role === USER_ROLES.ADMIN;

  return (
    <div>
      <PageHeader title="Settings" crumbs={[{ label: "Settings" }]} />
      <div className="ps-settings-grid">
        <AccountSettingsCard user={profile} onSaved={setProfile} />
        <PasswordSettingsCard />
        <NotificationSettingsCard user={profile} onSaved={setProfile} />
        <AppearanceSettingsCard />
        <SystemInfoCard fullWidth={!isAdmin} />
        {isAdmin && <SiteSettingsCard />}
      </div>
    </div>
  );
}
