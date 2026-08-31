import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { GlassCard } from "../../components/ui/GlassCard";
import { LoadingState } from "../../components/ui/LoadingState";
import { EmptyState } from "../../components/ui/EmptyState";
import { AnalyticsToolbar } from "../../components/analytics/AnalyticsToolbar";
import { AnalyticsMetricCard } from "../../components/analytics/AnalyticsMetricCard";
import { SafetyTrendChart } from "../../components/analytics/SafetyTrendChart";
import { AlertDistributionChart } from "../../components/analytics/AlertDistributionChart";
import { WorkerRiskTable } from "../../components/analytics/WorkerRiskTable";
import { EnvironmentalAnalyticsCard } from "../../components/analytics/EnvironmentalAnalyticsCard";
import { HealthDeviationCard } from "../../components/analytics/HealthDeviationCard";
import { ExposureAnalysisCard } from "../../components/analytics/ExposureAnalysisCard";
import { AlertResponseCard } from "../../components/analytics/AlertResponseCard";
import { HelmetReliabilityCard } from "../../components/analytics/HelmetReliabilityCard";
import { HighRiskTimesCard } from "../../components/analytics/HighRiskTimesCard";
import { KeyInsightsCard } from "../../components/analytics/KeyInsightsCard";
import { getAnalytics, downloadAnalyticsReport } from "../../api/analyticsApi";
import { useToast } from "../../context/ToastContext";

function todayDateStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatPeriodLabel(period) {
  if (!period) return "";
  if (period.type === "daily") {
    return new Date(`${period.date}T00:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  }
  if (period.type === "weekly" && period.weekStart && period.weekEnd) {
    const start = new Date(`${period.weekStart}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const end = new Date(`${period.weekEnd}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return `${start} – ${end}`;
  }
  // monthly: period.label is "YYYY-MM"
  const [y, m] = (period.label || "").split("-");
  if (!y || !m) return period.label || "";
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function AnalyticsPage() {
  const { showToast } = useToast();

  const [period, setPeriod] = useState("weekly");
  const [date, setDate] = useState(todayDateStr);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(
    (fresh = false) => {
      const setBusy = fresh ? setRefreshing : setLoading;
      setBusy(true);
      setError(null);
      return getAnalytics({ period, date, fresh })
        .then(setData)
        .catch((err) => setError(err))
        .finally(() => setBusy(false));
    },
    [period, date]
  );

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, date]);

  async function handleDownload() {
    setDownloading(true);
    try {
      const { blob, filename } = await downloadAnalyticsReport({ period, date });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("Report downloaded.", { type: "success" });
    } catch (err) {
      showToast(err.message || "Couldn't generate the report.", { type: "error" });
    } finally {
      setDownloading(false);
    }
  }

  const toolbar = (
    <AnalyticsToolbar
      period={period}
      date={date}
      periodLabel={data ? formatPeriodLabel(data.period) : ""}
      onPeriodChange={setPeriod}
      onDateChange={setDate}
      onRefresh={() => load(true)}
      refreshing={refreshing}
      onDownload={handleDownload}
      downloading={downloading}
    />
  );

  if (loading && !data) {
    return (
      <div>
        <PageHeader title="Analytics" crumbs={[{ label: "Analytics" }]} />
        {toolbar}
        <GlassCard>
          <LoadingState label="Loading analytics…" />
        </GlassCard>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div>
        <PageHeader title="Analytics" crumbs={[{ label: "Analytics" }]} />
        {toolbar}
        <GlassCard>
          <EmptyState icon="⚠" title="Couldn't load analytics" description={error.message} />
        </GlassCard>
      </div>
    );
  }

  const granularity = data.period.type === "daily" ? "hour" : "day";

  return (
    <div>
      <PageHeader title="Analytics" crumbs={[{ label: "Analytics" }]} />
      {toolbar}

      <div className="ps-analytics-kpi-row">
        <AnalyticsMetricCard icon="👥" label="Workers With Activity" value={data.summary.workersWithActivity} tone="green" />
        <AnalyticsMetricCard
          icon="⚠"
          label="Total Alerts"
          value={data.summary.totalAlerts}
          tone="warning"
          comparisonPercent={data.comparison.totalAlerts}
        />
        <AnalyticsMetricCard
          icon="🔶"
          label="Warning Alerts"
          value={data.summary.warningAlerts}
          tone="warning"
          comparisonPercent={data.comparison.warningAlerts}
        />
        <AnalyticsMetricCard
          icon="🔺"
          label="Critical Alerts"
          value={data.summary.criticalAlerts}
          tone="critical"
          comparisonPercent={data.comparison.criticalAlerts}
        />
        <AnalyticsMetricCard
          icon="🚨"
          label="Emergency Events"
          value={data.summary.emergencyAlerts}
          tone="danger"
          comparisonPercent={data.comparison.emergencyAlerts}
        />
        <AnalyticsMetricCard
          icon="⛑"
          label="Helmet Reporting Rate"
          value={data.summary.helmetReportingRate !== null ? `${data.summary.helmetReportingRate}%` : "No data"}
          tone="cyan"
        />
      </div>

      <div className="ps-analytics-trend-row">
        <SafetyTrendChart riskTrend={data.riskTrend} granularity={granularity} />
        <AlertDistributionChart distribution={data.alertDistribution} />
      </div>

      <div className="ps-analytics-full-row">
        <WorkerRiskTable workers={data.workersRequiringAttention} />
      </div>

      <div className="ps-analytics-two-col-row">
        <EnvironmentalAnalyticsCard environment={data.environment} granularity={granularity} />
        <HealthDeviationCard health={data.health} />
      </div>

      <div className="ps-analytics-two-col-row">
        <ExposureAnalysisCard exposure={data.exposure} />
        <AlertResponseCard alertResponse={data.alertResponse} />
      </div>

      <div className="ps-analytics-two-col-row">
        <HelmetReliabilityCard helmetReliability={data.helmetReliability} />
        <HighRiskTimesCard highRiskTimes={data.highRiskTimes} />
      </div>

      <div className="ps-analytics-full-row">
        <KeyInsightsCard insights={data.insights} />
      </div>
    </div>
  );
}
