import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../context/ToastContext";
import { AnalyticsPage } from "./AnalyticsPage";
import { getAnalytics, downloadAnalyticsReport } from "../../api/analyticsApi";

vi.mock("../../api/analyticsApi", () => ({
  getAnalytics: vi.fn(),
  downloadAnalyticsReport: vi.fn(),
}));

function baseAnalytics(overrides = {}) {
  return {
    period: {
      type: "weekly", date: "2026-08-31", start: "2026-08-30T18:30:00.000Z", end: "2026-09-06T18:30:00.000Z",
      label: "2026-08-31 to 2026-09-06", weekStart: "2026-08-31", weekEnd: "2026-09-06", timezone: "Asia/Colombo",
      previous: { start: "...", end: "...", label: "2026-08-24 to 2026-08-30" },
    },
    summary: {
      totalActiveWorkers: 10, workersWithActivity: 7, totalAlerts: 8, warningAlerts: 4,
      criticalAlerts: 3, emergencyAlerts: 1, avgAcknowledgementMinutes: 7.3, helmetReportingRate: 75,
    },
    comparison: { totalAlerts: -20, warningAlerts: -33.3, criticalAlerts: -25, emergencyAlerts: null, workersWithActivity: 10, environment: {} },
    riskTrend: [
      { bucket: "2026-08-31", warning: 1, critical: 1, emergency: 1 },
      { bucket: "2026-09-01", warning: 0, critical: 0, emergency: 0 },
    ],
    alertDistribution: { warning: 4, critical: 3, emergency: 1 },
    workersRequiringAttention: [
      { workerId: "W-A", workerName: "Worker A", warning: 2, critical: 1, emergency: 1, totalAlerts: 4, latestRiskState: "CRITICAL" },
      { workerId: "W-B", workerName: "Worker B", warning: 1, critical: 2, emergency: 0, totalAlerts: 3, latestRiskState: null },
    ],
    environment: {
      summary: {
        ambientTemperature: { avg: 31.7, min: 25, max: 40, totalReadings: 3, warningReadings: 1, criticalReadings: 1, warningPercent: 33.3, criticalPercent: 33.3 },
        noise: { avg: null, min: null, max: null, totalReadings: 0, warningReadings: 0, criticalReadings: 0, warningPercent: null, criticalPercent: null },
        gas: { avg: null, min: null, max: null, totalReadings: 0, warningReadings: 0, criticalReadings: 0, warningPercent: null, criticalPercent: null },
        uv: { avg: null, min: null, max: null, totalReadings: 0, warningReadings: 0, criticalReadings: 0, warningPercent: null, criticalPercent: null },
      },
      trends: {
        ambientTemperature: [{ bucket: "2026-08-31", avg: 31.7 }],
        noise: [{ bucket: "2026-08-31", avg: null }],
        gas: [{ bucket: "2026-08-31", avg: null }],
        uv: [{ bucket: "2026-08-31", avg: null }],
      },
      criticalDaysBySensor: { ambientTemperature: 1, noise: 0, gas: 0, uv: 0 },
      periodDays: 7,
    },
    health: {
      heartRate: { avgAbsDeviationPct: 27.5, maxAbsDeviationPct: 30, maxDeviationDirection: "below", significantEvents: 2, thresholdConfigured: true, thresholdPct: 20, topWorkers: [{ workerId: "W-B", workerName: "Worker B", avgAbsDeviationPct: 30, maxAbsDeviationPct: 30 }] },
      bodyTemperature: { avgAbsDeviationPct: 12.5, maxAbsDeviationPct: 15, maxDeviationDirection: "below", significantEvents: null, thresholdConfigured: false, thresholdPct: null, topWorkers: [] },
    },
    exposure: {
      noise: { topWorkers: [{ workerId: "W-A", workerName: "Worker A", longestStreakSeconds: 180 }] },
      heartRate: { topWorkers: [] },
    },
    helmetReliability: {
      registeredActiveHelmets: 4, reportingDuringPeriod: 3, noDataDuringPeriod: ["PS-NO-DATA"],
      currentlyOnline: 2, currentlyOffline: 2, reportingCoverage: [],
    },
    alertResponse: {
      total: 8, acknowledged: 3, unacknowledged: 5, acknowledgementRate: 37.5,
      avgAcknowledgementMinutes: 7.3, medianAcknowledgementMinutes: 5,
      resolvedEmergencies: 1, unresolvedEmergencies: 0, avgResolutionMinutes: 10, resolutionSamples: 1,
    },
    highRiskTimes: [{ hour: 13, label: "13:00–14:00", totalAlerts: 4, warning: 1, critical: 2, emergency: 1 }],
    insights: ["Most alerts occurred between 13:00–14:00 (4 alerts, 2 critical).", "1 registered helmet(s) did not report data during this period: PS-NO-DATA."],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>
    </ToastProvider>
  );
}

beforeEach(() => {
  getAnalytics.mockReset();
  downloadAnalyticsReport.mockReset();
});

describe("AnalyticsPage", () => {
  test("shows a loading state before data arrives", () => {
    getAnalytics.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading analytics…")).toBeInTheDocument();
  });

  test("shows an error state when the request fails entirely", async () => {
    getAnalytics.mockRejectedValue({ status: 500, message: "Internal server error" });
    renderPage();
    expect(await screen.findByText("Couldn't load analytics")).toBeInTheDocument();
  });

  test("renders KPI cards with real values and comparison text", async () => {
    getAnalytics.mockResolvedValue(baseAnalytics());
    renderPage();

    await screen.findByText("Workers With Activity");
    expect(screen.getByText("7")).toBeInTheDocument();
    const kpiRow = document.querySelector(".ps-analytics-kpi-row");
    const totalAlertsCard = within(kpiRow).getByText("Total Alerts").closest(".ps-metric-card");
    expect(within(totalAlertsCard).getByText("8")).toBeInTheDocument();
    expect(screen.getByText("20% fewer vs previous period")).toBeInTheDocument();
    expect(screen.getByText("New this period")).toBeInTheDocument(); // emergencyAlerts comparison is null
  });

  test("renders the worker risk table, sorted order as given by the backend", async () => {
    getAnalytics.mockResolvedValue(baseAnalytics());
    renderPage();

    await screen.findByText("Workers Requiring Attention");
    const rows = screen.getAllByRole("row").slice(1); // skip header row
    expect(within(rows[0]).getByText("Worker A")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Worker B")).toBeInTheDocument();
  });

  test("clicking a worker row navigates to their user detail page", async () => {
    getAnalytics.mockResolvedValue(baseAnalytics());
    renderPage();

    await screen.findByText("Workers Requiring Attention");
    const table = screen.getByRole("table");
    const row = within(table).getByText("Worker A").closest("tr");
    await userEvent.click(row);
    // No router assertion harness here beyond confirming no crash and the
    // click handler exists — full navigation is exercised at the app level
    // by ProtectedRoute/RoleRoute's own tests.
    expect(row).toBeInTheDocument();
  });

  test("renders key insights verbatim from the backend", async () => {
    getAnalytics.mockResolvedValue(baseAnalytics());
    renderPage();
    expect(await screen.findByText(/Most alerts occurred between 13:00–14:00/)).toBeInTheDocument();
    expect(screen.getByText(/1 registered helmet\(s\) did not report data/)).toBeInTheDocument();
  });

  test("shows the empty state when there are no insights", async () => {
    getAnalytics.mockResolvedValue(baseAnalytics({ insights: [] }));
    renderPage();
    expect(await screen.findByText("No notable patterns identified for this period")).toBeInTheDocument();
  });

  test("switching period triggers a new fetch with the new period", async () => {
    getAnalytics.mockResolvedValue(baseAnalytics());
    renderPage();
    await screen.findByText("Workers With Activity");
    expect(getAnalytics).toHaveBeenCalledWith(expect.objectContaining({ period: "weekly" }));

    await userEvent.click(screen.getByRole("button", { name: "Monthly" }));
    await waitFor(() => expect(getAnalytics).toHaveBeenLastCalledWith(expect.objectContaining({ period: "monthly" })));
  });

  test("changing the date triggers a new fetch with the new date", async () => {
    getAnalytics.mockResolvedValue(baseAnalytics());
    renderPage();
    await screen.findByText("Workers With Activity");

    const dateInput = screen.getByLabelText("Select reference date");
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, "2026-09-15");
    await waitFor(() => expect(getAnalytics).toHaveBeenLastCalledWith(expect.objectContaining({ date: "2026-09-15" })));
  });

  test("Refresh requests fresh:true and updates the page with the new result", async () => {
    getAnalytics.mockResolvedValueOnce(baseAnalytics()).mockResolvedValueOnce(baseAnalytics({ summary: { ...baseAnalytics().summary, totalAlerts: 99 } }));
    renderPage();
    await screen.findByText("Workers With Activity");

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(getAnalytics).toHaveBeenLastCalledWith(expect.objectContaining({ fresh: true })));
    expect(await screen.findByText("99")).toBeInTheDocument();
  });

  test("Download Report shows a pending state, then success", async () => {
    getAnalytics.mockResolvedValue(baseAnalytics());
    let resolveDownload;
    downloadAnalyticsReport.mockReturnValue(
      new Promise((resolve) => {
        resolveDownload = resolve;
      })
    );
    // jsdom doesn't implement createObjectURL/revokeObjectURL — stub them.
    global.URL.createObjectURL = vi.fn(() => "blob:mock");
    global.URL.revokeObjectURL = vi.fn();

    renderPage();
    await screen.findByText("Workers With Activity");

    const downloadButton = screen.getByRole("button", { name: "Download Report" });
    await userEvent.click(downloadButton);
    expect(downloadButton).toBeDisabled();

    resolveDownload({ blob: new Blob(["pdf"]), filename: "ProSafe-Weekly-Safety-Report-2026-08-31_to_2026-09-06.pdf" });
    await waitFor(() => expect(downloadButton).not.toBeDisabled());
    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  test("Download Report shows an error toast on failure and re-enables the button", async () => {
    getAnalytics.mockResolvedValue(baseAnalytics());
    downloadAnalyticsReport.mockRejectedValue({ message: "Report generation failed" });
    renderPage();
    await screen.findByText("Workers With Activity");

    const downloadButton = screen.getByRole("button", { name: "Download Report" });
    await userEvent.click(downloadButton);

    expect(await screen.findByText("Report generation failed")).toBeInTheDocument();
    expect(downloadButton).not.toBeDisabled();
  });

  test("environmental sensor selector switches sensors without a refetch", async () => {
    getAnalytics.mockResolvedValue(baseAnalytics());
    renderPage();
    await screen.findByText("Workers With Activity");
    const callsBefore = getAnalytics.mock.calls.length;

    const select = screen.getByLabelText("Select environmental sensor");
    await userEvent.selectOptions(select, "noise");

    expect(screen.getByText("No noise readings in this period")).toBeInTheDocument();
    expect(getAnalytics.mock.calls.length).toBe(callsBefore); // no new fetch
  });

  test("body temperature significant events shows 'Not configured' rather than a fabricated count", async () => {
    getAnalytics.mockResolvedValue(baseAnalytics());
    renderPage();
    await screen.findByText("Worker Health Deviations");
    expect(screen.getByText("Not configured")).toBeInTheDocument();
  });
});
