import { useEffect, useState } from "react";
import { PageHeader } from "../components/layout/PageHeader";
import { GlassCard } from "../components/ui/GlassCard";
import { LoadingState } from "../components/ui/LoadingState";
import { EmptyState } from "../components/ui/EmptyState";
import { UserDetailView } from "../components/users/UserDetailView";
import { getMe } from "../api/userApi";

// Worker self-view — read only (#3: workers can only check their own
// details; edit/delete stay admin-only actions).
export function ProfilePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getMe()
      .then(setData)
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="My Profile" crumbs={[{ label: "Profile" }]} />

      {loading && (
        <GlassCard>
          <LoadingState label="Loading your profile…" />
        </GlassCard>
      )}

      {!loading && error && (
        <GlassCard>
          <EmptyState icon="⚠" title="Couldn't load your profile" description={error.message} />
        </GlassCard>
      )}

      {!loading && !error && data && <UserDetailView data={data} />}
    </div>
  );
}
