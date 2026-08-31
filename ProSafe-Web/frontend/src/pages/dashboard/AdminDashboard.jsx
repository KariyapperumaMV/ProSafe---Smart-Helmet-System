import { PageHeader } from "../../components/layout/PageHeader";
import { GlassCard } from "../../components/ui/GlassCard";
import { LoadingState } from "../../components/ui/LoadingState";
import { EmptyState } from "../../components/ui/EmptyState";
import { WeatherCard } from "../../components/dashboard/WeatherCard";
import { MetricCard } from "../../components/dashboard/MetricCard";
import { WorkerStatusSummary } from "../../components/dashboard/WorkerStatusSummary";
import { RecentAlertsCard } from "../../components/dashboard/RecentAlertsCard";
import { HelmetHealthCard } from "../../components/dashboard/HelmetHealthCard";
import { WorkerLocationCard } from "../../components/dashboard/WorkerLocationCard";
import { useDashboardData } from "../../hooks/useDashboardData";
import { getAdminDashboard } from "../../api/dashboardApi";

export function AdminDashboard() {
  const { data, loading, error } = useDashboardData(getAdminDashboard);

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

      <div className="ps-dashboard-top-row">
        <WeatherCard weather={data.weather} />
        <MetricCard icon="👥" label="Total Workers" value={data.summary.totalWorkers} tone="green" />
        <MetricCard icon="⛑" label="Helmets Online" value={data.summary.helmetsOnline} tone="cyan" />
        <MetricCard icon="⚠" label="Alerts Today" value={data.summary.alertsToday} tone="warning" />
        <MetricCard icon="✅" label="Safe Workers" value={data.summary.safeWorkers} tone="green" />
      </div>

      <div className="ps-dashboard-mid-row">
        <WorkerStatusSummary workerStatus={data.workerStatus} />
        <RecentAlertsCard alerts={data.recentAlerts} emptyMessage="No alerts recorded yet." />
      </div>

      <div className="ps-dashboard-bottom-row">
        <HelmetHealthCard helmetStatus={data.helmetStatus} />
        <WorkerLocationCard locations={data.locations} />
      </div>
    </div>
  );
}
