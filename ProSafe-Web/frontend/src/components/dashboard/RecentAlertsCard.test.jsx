import { describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecentAlertsCard } from "./RecentAlertsCard";

const alerts = [
  {
    id: "1", type: "EMERGENCY", workerId: "W-001", workerName: "Nirmani Silva", helmetId: "PS-H-1",
    timestamp: new Date().toISOString(), previousRiskState: null, currentRiskState: null, confidence: null,
    sensorSnapshot: null, location: null, acknowledged: true, resolved: true, label: "Emergency button pressed",
  },
  {
    id: "2", type: "TRANSITION", workerId: "W-002", workerName: "Kasun Perera", helmetId: "PS-H-2",
    timestamp: new Date().toISOString(), previousRiskState: "SAFE", currentRiskState: "CRITICAL", confidence: 0.9,
    sensorSnapshot: { heartRate: 120 }, location: { lat: 6.9, lon: 79.8 }, acknowledged: false, resolved: false,
    label: "Risk changed: SAFE → CRITICAL",
  },
];

describe("RecentAlertsCard", () => {
  test("shows an empty state when there are no alerts", () => {
    render(<RecentAlertsCard alerts={[]} emptyMessage="No alerts recorded yet." />);
    expect(screen.getByText("No alerts recorded yet.")).toBeInTheDocument();
  });

  test("renders each alert with worker, label, and an Unresolved badge only when unresolved", () => {
    render(<RecentAlertsCard alerts={alerts} />);

    expect(screen.getByText("Nirmani Silva")).toBeInTheDocument();
    expect(screen.getByText("Kasun Perera")).toBeInTheDocument();
    expect(screen.getByText("Risk changed: SAFE → CRITICAL")).toBeInTheDocument();
    expect(screen.getAllByText("Unresolved")).toHaveLength(1); // only the second (unresolved) alert
  });

  test("clicking View opens the read-only detail modal with the full stored fields", async () => {
    render(<RecentAlertsCard alerts={alerts} />);

    const viewButtons = screen.getAllByRole("button", { name: "View" });
    await userEvent.click(viewButtons[1]);

    expect(screen.getByText("Alert Details")).toBeInTheDocument();
    expect(screen.getByText("SAFE → CRITICAL")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("Open location in Google Maps ↗")).toBeInTheDocument();
  });

  test("does not fabricate a trigger reason beyond the stored label", async () => {
    render(<RecentAlertsCard alerts={alerts} />);
    const viewButtons = screen.getAllByRole("button", { name: "View" });
    await userEvent.click(viewButtons[0]);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Emergency button pressed")).toBeInTheDocument();
    expect(within(dialog).queryByText(/triggered by/i)).not.toBeInTheDocument();
  });
});
