import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../context/ToastContext";
import { AdminDashboard } from "./AdminDashboard";
import { getAdminDashboard } from "../../api/dashboardApi";
import { getAlerts } from "../../api/alertApi";
import { useNotificationContext } from "../../context/NotificationContext";

vi.mock("../../api/dashboardApi", () => ({
  getAdminDashboard: vi.fn(),
}));
vi.mock("../../api/alertApi", () => ({
  getAlerts: vi.fn(),
  acknowledgeAlert: vi.fn(),
}));
vi.mock("../../context/NotificationContext", () => ({
  useNotificationContext: vi.fn(),
}));
// Leaflet needs real layout/DOM measurement it doesn't get in jsdom — the
// map itself is covered by WorkerLocationMap.test.jsx, this page test only
// needs to know the card received the right data.
vi.mock("../../components/dashboard/WorkerLocationMap", () => ({
  WorkerLocationMap: ({ locations }) => <div data-testid="mock-map">{locations?.length || 0} pin(s)</div>,
}));

const fullResponse = {
  summary: { totalWorkers: 5, helmetsOnline: 3, alertsToday: 2, safeWorkers: 1 },
  workerStatus: { total: 5, safe: 1, warning: 1, critical: 1, emergency: 1, unknown: 1 },
  helmetStatus: { registered: 4, online: 3, offline: 1, assigned: 3, unassigned: 1, onlinePercent: 75 },
  recentAlerts: [],
  weather: { available: false },
  locations: [
    { userId: "W-001", workerName: "Nirmani Silva", helmetId: "PS-H-1", lat: 6.9, lon: 79.8, online: true, lastSeenAt: new Date().toISOString(), locationTimestamp: new Date().toISOString(), operationalState: "SAFE" },
  ],
};

beforeEach(() => {
  getAdminDashboard.mockReset();
  getAlerts.mockReset();
  getAlerts.mockResolvedValue({ alerts: [] });
  useNotificationContext.mockReset();
  useNotificationContext.mockReturnValue({
    notifications: [], unreadCount: 0, loading: false, lastEvent: null,
    markRead: vi.fn(), markAllRead: vi.fn(),
  });
});

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    </ToastProvider>
  );
}

describe("AdminDashboard", () => {
  test("shows a loading state before data arrives", () => {
    getAdminDashboard.mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByText("Loading dashboard…")).toBeInTheDocument();
  });

  test("renders all four KPI metric cards with real values", async () => {
    getAdminDashboard.mockResolvedValue(fullResponse);
    renderPage();

    await screen.findByText("Total Workers");

    function metricValue(label) {
      const card = screen.getByText(label).closest(".ps-metric-card");
      return within(card).getByText((_, el) => el.className === "ps-metric-value").textContent;
    }

    expect(metricValue("Total Workers")).toBe("5");
    expect(metricValue("Helmets Online")).toBe("3");
    expect(metricValue("Alerts Today")).toBe("2");
    expect(metricValue("Safe Workers")).toBe("1");
  });

  test("worker status card shows the UNKNOWN count when supplied", async () => {
    getAdminDashboard.mockResolvedValue(fullResponse);
    renderPage();
    await screen.findByText("Total Workers");
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  test("shows the empty alerts state when the alerts endpoint returns none", async () => {
    getAdminDashboard.mockResolvedValue(fullResponse);
    renderPage();
    expect(await screen.findByText("No alerts recorded yet.")).toBeInTheDocument();
  });

  test("renders a weather-unavailable state without crashing the rest of the dashboard", async () => {
    getAdminDashboard.mockResolvedValue(fullResponse);
    renderPage();
    expect(await screen.findByText("Weather unavailable")).toBeInTheDocument();
    // The rest of the dashboard still rendered.
    expect(screen.getByText("Helmet Health")).toBeInTheDocument();
  });

  test("passes the location array through to the map card", async () => {
    getAdminDashboard.mockResolvedValue(fullResponse);
    renderPage();
    expect(await screen.findByText("1 pin(s)")).toBeInTheDocument();
  });

  test("shows an error state when the request fails entirely", async () => {
    getAdminDashboard.mockRejectedValue({ status: 500, message: "Internal server error" });
    renderPage();
    expect(await screen.findByText("Couldn't load the dashboard")).toBeInTheDocument();
  });
});
