import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { WorkerDashboard } from "./WorkerDashboard";
import { getWorkerDashboard } from "../../api/dashboardApi";

vi.mock("../../api/dashboardApi", () => ({
  getWorkerDashboard: vi.fn(),
}));

beforeEach(() => {
  getWorkerDashboard.mockReset();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <WorkerDashboard />
    </MemoryRouter>
  );
}

const baseResponse = {
  user: { userId: "W-001", name: "Nirmani Silva" },
  status: { operationalState: "SAFE", currentRiskState: "SAFE", emergencyActive: false },
  helmet: { helmetId: "PS-H-001", online: true, lastSeenAt: new Date().toISOString() },
  latestSensors: { timestamp: new Date().toISOString(), heartRate: 88, bodyTemp: 37, ambientTemp: 30, noise: 70, gas: 100, uv: 3 },
  recentAlerts: [
    {
      id: "1", type: "TRANSITION", workerId: "W-001", workerName: "Nirmani Silva", helmetId: "PS-H-001",
      timestamp: new Date().toISOString(), previousRiskState: "SAFE", currentRiskState: "WARNING", confidence: 0.9,
      sensorSnapshot: null, location: null, acknowledged: false, resolved: false, label: "Risk changed: SAFE → WARNING",
    },
  ],
  weather: { available: false },
};

describe("WorkerDashboard", () => {
  test("renders the worker's own alerts, safety status, and helmet — never organization-wide metrics", async () => {
    getWorkerDashboard.mockResolvedValue(baseResponse);
    renderPage();

    expect(await screen.findByText("Nirmani Silva")).toBeInTheDocument();
    expect(screen.getByText("PS-H-001")).toBeInTheDocument();

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
    getWorkerDashboard.mockResolvedValue({ ...baseResponse, recentAlerts: [] });
    renderPage();
    expect(await screen.findByText("No alerts recorded for you yet.")).toBeInTheDocument();
  });

  test("shows a loading state before data arrives", () => {
    getWorkerDashboard.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading dashboard…")).toBeInTheDocument();
  });
});
