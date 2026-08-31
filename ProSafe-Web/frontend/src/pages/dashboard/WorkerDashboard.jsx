import { PageHeader } from "../../components/layout/PageHeader";
import { GlassCard } from "../../components/ui/GlassCard";
import { LoadingState } from "../../components/ui/LoadingState";
import { EmptyState } from "../../components/ui/EmptyState";
import { WeatherCard } from "../../components/dashboard/WeatherCard";
import { WorkerSafetyCard } from "../../components/dashboard/WorkerSafetyCard";
import { AssignedHelmetCard } from "../../components/dashboard/AssignedHelmetCard";
import { LatestSensorsCard } from "../../components/dashboard/LatestSensorsCard";
import { RecentAlertsCard } from "../../components/dashboard/RecentAlertsCard";
import { useDashboardData } from "../../hooks/useDashboardData";
import { getWorkerDashboard } from "../../api/dashboardApi";

// Deliberately reduced (#9/#16 in the analysis) — no organization-wide
// metrics anywhere here, only this worker's own state. The backend
// endpoint itself only returns this worker's data (identity from the
// token), so there's nothing org-wide to accidentally render even if this
// component were misused.
export function WorkerDashboard() {
  const { data, loading, error } = useDashboardData(getWorkerDashboard);

  if (loading && !data) {
    return (
      <div>
        <PageHeader title="Dashboard" crumbs={[{ label: "Dashboard" }]} />
        <GlassCard>
          <LoadingState label="Loading dashboard…" />
        </GlassCard>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div>
        <PageHeader title="Dashboard" crumbs={[{ label: "Dashboard" }]} />
        <GlassCard>
          <EmptyState icon="⚠" title="Couldn't load the dashboard" description={error.message} />
        </GlassCard>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Dashboard" crumbs={[{ label: "Dashboard" }]} />

      <div className="ps-dashboard-top-row ps-dashboard-top-row-worker">
        <WeatherCard weather={data.weather} />
        <WorkerSafetyCard status={data.status} />
      </div>

      <div className="ps-dashboard-mid-row">
        <AssignedHelmetCard helmet={data.helmet} />
        <LatestSensorsCard latestSensors={data.latestSensors} />
      </div>

      <div className="ps-dashboard-bottom-row ps-dashboard-bottom-row-worker">
        <RecentAlertsCard
          title="My Recent Alerts"
          emptyMessage="No alerts recorded for you yet."
          readOnly
          limit={5}
        />
      </div>
    </div>
  );
}
