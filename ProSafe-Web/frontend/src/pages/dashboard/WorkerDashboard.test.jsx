import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../context/ToastContext";
import { WorkerDashboard } from "./WorkerDashboard";
import { getWorkerDashboard } from "../../api/dashboardApi";
import { getAlerts } from "../../api/alertApi";
import { useNotificationContext } from "../../context/NotificationContext";

vi.mock("../../api/dashboardApi", () => ({
  getWorkerDashboard: vi.fn(),
}));
vi.mock("../../api/alertApi", () => ({
  getAlerts: vi.fn(),
  acknowledgeAlert: vi.fn(),
}));
vi.mock("../../context/NotificationContext", () => ({
  useNotificationContext: vi.fn(),
}));

beforeEach(() => {
  getWorkerDashboard.mockReset();
  getAlerts.mockReset();
  getAlerts.mockResolvedValue({
    alerts: [
      {
        id: "1", type: "TRANSITION", workerId: "W-001", workerName: "Nirmani Silva", helmetId: "PS-H-001",
        timestamp: new Date().toISOString(), previousRiskState: "SAFE", currentRiskState: "WARNING", confidence: 0.9,
        sensorSnapshot: null, location: null, acknowledged: false, acknowledgedAt: null, acknowledgedBy: null,
        resolved: false, resetRequested: false, label: "Risk changed: SAFE → WARNING",
      },
    ],
  });
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
        <WorkerDashboard />
      </MemoryRouter>
    </ToastProvider>
  );
}

const baseResponse = {
  user: { userId: "W-001", name: "Nirmani Silva" },
  status: { operationalState: "SAFE", currentRiskState: "SAFE", emergencyActive: false },
  helmet: { helmetId: "PS-H-001", online: true, lastSeenAt: new Date().toISOString() },
  latestSensors: { timestamp: new Date().toISOString(), heartRate: 88, bodyTemp: 37, ambientTemp: 30, noise: 70, gas: 100, uv: 3 },
  weather: { available: false },
};

describe("WorkerDashboard", () => {
  test("renders the worker's own alerts (read-only), safety status, and helmet — never organization-wide metrics", async () => {
    getWorkerDashboard.mockResolvedValue(baseResponse);
    renderPage();

    expect(await screen.findByText("Nirmani Silva")).toBeInTheDocument();
    expect(screen.getByText("PS-H-001")).toBeInTheDocument();
    expect(await screen.findByText("Risk changed: SAFE → WARNING")).toBeInTheDocument();
    // Worker's own alert card is read-only — no supervisory actions.
    expect(screen.queryByRole("button", { name: "Mark as Read" })).not.toBeInTheDocument();

    // No admin-only cards or org-wide labels ever render on this page.
    expect(screen.queryByText("Total Workers")).not.toBeInTheDocument();
    expect(screen.queryByText("Helmets Online")).not.toBeInTheDocument();
    expect(screen.queryByText("Safe Workers")).not.toBeInTheDocument();
    expect(screen.queryByText("Worker Status")).not.toBeInTheDocument();
    expect(screen.queryByText("Helmet Health")).not.toBeInTheDocument();
    expect(screen.queryByText("Worker Locations")).not.toBeInTheDocument();
  });

  test("emergency is visually higher priority than currentRiskState", async () => {
    getWorkerDashboard.mockResolvedValue({
      ...baseResponse,
      status: { operationalState: "EMERGENCY", currentRiskState: "SAFE", emergencyActive: true },
    });
    renderPage();

    expect(await screen.findByText("EMERGENCY")).toBeInTheDocument();
    // The underlying SAFE risk state must not be shown as if it were the
    // operational status once emergency is active.
    expect(screen.queryByText("SAFE")).not.toBeInTheDocument();
  });

  test("worker with no helmet: assigned helmet card shows the empty state", async () => {
    getWorkerDashboard.mockResolvedValue({ ...baseResponse, helmet: null, latestSensors: null });
    renderPage();

    expect(await screen.findByText("No helmet assigned")).toBeInTheDocument();
    expect(screen.getByText("No sensor data received yet")).toBeInTheDocument();
  });

  test("shows the empty state when the worker has no alerts", async () => {
    getWorkerDashboard.mockResolvedValue(baseResponse);
    getAlerts.mockResolvedValue({ alerts: [] });
    renderPage();
    expect(await screen.findByText("No alerts recorded for you yet.")).toBeInTheDocument();
  });

  test("shows a loading state before data arrives", () => {
    getWorkerDashboard.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading dashboard…")).toBeInTheDocument();
  });
});
