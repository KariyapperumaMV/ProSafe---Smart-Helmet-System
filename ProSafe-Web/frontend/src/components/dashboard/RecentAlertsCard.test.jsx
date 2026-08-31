import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecentAlertsCard } from "./RecentAlertsCard";
import { getAlerts, acknowledgeAlert } from "../../api/alertApi";
import { requestEmergencyReset } from "../../api/helmetApi";
import { useNotificationContext } from "../../context/NotificationContext";
import { ToastProvider } from "../../context/ToastContext";

// RecentAlertsCard calls useToast() for error/success messages — ToastProvider
// has no external dependencies of its own, so it's used for real here rather
// than mocked.
function renderCard(props) {
  return render(
    <ToastProvider>
      <RecentAlertsCard {...props} />
    </ToastProvider>
  );
}

vi.mock("../../api/alertApi", () => ({
  getAlerts: vi.fn(),
  acknowledgeAlert: vi.fn(),
}));
vi.mock("../../api/helmetApi", () => ({
  requestEmergencyReset: vi.fn(),
}));
vi.mock("../../context/NotificationContext", () => ({
  useNotificationContext: vi.fn(),
}));

const emergencyAlert = {
  id: "1", type: "EMERGENCY", workerId: "W-001", workerName: "Nirmani Silva", helmetId: "PS-H-1",
  timestamp: new Date().toISOString(), previousRiskState: null, currentRiskState: null, confidence: null,
  sensorSnapshot: null, location: null, acknowledged: true, acknowledgedAt: null, acknowledgedBy: null,
  resolved: true, resetRequested: false, label: "Emergency button pressed",
};
const transitionAlert = {
  id: "2", type: "TRANSITION", workerId: "W-002", workerName: "Kasun Perera", helmetId: "PS-H-2",
  timestamp: new Date().toISOString(), previousRiskState: "SAFE", currentRiskState: "CRITICAL", confidence: 0.9,
  sensorSnapshot: { heartRate: 120 }, location: { lat: 6.9, lon: 79.8 }, acknowledged: false,
  acknowledgedAt: null, acknowledgedBy: null, resolved: false, resetRequested: false,
  label: "Risk changed: SAFE → CRITICAL",
};
const activeEmergencyAlert = {
  id: "3", type: "EMERGENCY", workerId: "W-003", workerName: "Priya Fernando", helmetId: "PS-H-3",
  timestamp: new Date().toISOString(), previousRiskState: null, currentRiskState: null, confidence: null,
  sensorSnapshot: null, location: null, acknowledged: false, acknowledgedAt: null, acknowledgedBy: null,
  resolved: false, resetRequested: false, label: "Emergency button pressed",
};

function mockNotificationContext(overrides = {}) {
  useNotificationContext.mockReturnValue({
    notifications: [], unreadCount: 0, loading: false, lastEvent: null,
    markRead: vi.fn(), markAllRead: vi.fn(),
    ...overrides,
  });
}

beforeEach(() => {
  getAlerts.mockReset();
  acknowledgeAlert.mockReset();
  requestEmergencyReset.mockReset();
  useNotificationContext.mockReset();
  mockNotificationContext();
});

describe("RecentAlertsCard", () => {
  test("shows an empty state when there are no alerts", async () => {
    getAlerts.mockResolvedValue({ alerts: [] });
    renderCard({ emptyMessage: "No alerts recorded yet." });
    expect(await screen.findByText("No alerts recorded yet.")).toBeInTheDocument();
  });

  test("renders each alert with worker, label, and an Unresolved badge only when unresolved", async () => {
    getAlerts.mockResolvedValue({ alerts: [emergencyAlert, transitionAlert] });
    renderCard();

    expect(await screen.findByText("Nirmani Silva")).toBeInTheDocument();
    expect(screen.getByText("Kasun Perera")).toBeInTheDocument();
    expect(screen.getByText("Risk changed: SAFE → CRITICAL")).toBeInTheDocument();
    // Scoped to the list itself — the filter pills also render a button
    // literally labeled "Unresolved".
    const list = document.querySelector(".ps-alert-list");
    expect(within(list).getAllByText("Unresolved")).toHaveLength(1); // only the unresolved alert row
  });

  test("clicking View opens the read-only detail modal with the full stored fields", async () => {
    getAlerts.mockResolvedValue({ alerts: [emergencyAlert, transitionAlert] });
    renderCard();
    await screen.findByText("Nirmani Silva");

    const viewButtons = screen.getAllByRole("button", { name: "View" });
    await userEvent.click(viewButtons[1]);

    expect(screen.getByText("Alert Details")).toBeInTheDocument();
    expect(screen.getByText("SAFE → CRITICAL")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("Open location in Google Maps ↗")).toBeInTheDocument();
  });

  test("fetches with the correct query params when a filter pill is clicked", async () => {
    getAlerts.mockResolvedValue({ alerts: [] });
    renderCard({ days: 7, limit: 10 });
    await waitFor(() => expect(getAlerts).toHaveBeenCalledWith({ days: 7, limit: 10 }));

    await userEvent.click(screen.getByRole("button", { name: "Critical" }));
    await waitFor(() =>
      expect(getAlerts).toHaveBeenLastCalledWith({ days: 7, limit: 10, risk: "CRITICAL" })
    );

    await userEvent.click(screen.getByRole("button", { name: "Unread" }));
    await waitFor(() =>
      expect(getAlerts).toHaveBeenLastCalledWith({ days: 7, limit: 10, acknowledged: "false" })
    );
  });

  test("Mark as Read acknowledges the alert and updates the row", async () => {
    getAlerts.mockResolvedValue({ alerts: [transitionAlert] });
    acknowledgeAlert.mockResolvedValue({ alert: { ...transitionAlert, acknowledged: true } });
    renderCard();

    const markButton = await screen.findByRole("button", { name: "Mark as Read" });
    await userEvent.click(markButton);

    expect(acknowledgeAlert).toHaveBeenCalledWith("2");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Mark as Read" })).not.toBeInTheDocument());
  });

  test("readOnly hides Mark as Read and Reset Emergency, keeps View", async () => {
    getAlerts.mockResolvedValue({ alerts: [transitionAlert, activeEmergencyAlert] });
    renderCard({ readOnly: true });
    await screen.findByText("Kasun Perera");

    expect(screen.queryByRole("button", { name: "Mark as Read" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset Emergency" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "View" })).toHaveLength(2);
  });

  test("Reset Emergency only shows for an unresolved EMERGENCY alert, and confirming requests a reset", async () => {
    getAlerts.mockResolvedValue({ alerts: [emergencyAlert, activeEmergencyAlert] });
    requestEmergencyReset.mockResolvedValue({ resetRequested: true, alreadyRequested: false });
    renderCard();
    await screen.findByText("Priya Fernando");

    // Only the active (unresolved) emergency alert gets the button.
    expect(screen.getAllByRole("button", { name: "Reset Emergency" })).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Reset Emergency" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Reset Emergency?")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Reset Emergency" }));
    await waitFor(() => expect(requestEmergencyReset).toHaveBeenCalledWith("PS-H-3"));
    await waitFor(() => expect(screen.getByText("Reset requested")).toBeInTheDocument());
  });

  test("a live NEW_ALERT/EMERGENCY_ALERT event refetches without the parent re-rendering", async () => {
    getAlerts.mockResolvedValue({ alerts: [] });
    mockNotificationContext({ lastEvent: null });
    const { rerender } = render(
      <ToastProvider>
        <RecentAlertsCard />
      </ToastProvider>
    );
    await waitFor(() => expect(getAlerts).toHaveBeenCalledTimes(1));

    mockNotificationContext({ lastEvent: { id: "evt-1", type: "EMERGENCY_ALERT" } });
    rerender(
      <ToastProvider>
        <RecentAlertsCard />
      </ToastProvider>
    );

    await waitFor(() => expect(getAlerts).toHaveBeenCalledTimes(2));
  });

  test("does not fabricate a trigger reason beyond the stored label", async () => {
    getAlerts.mockResolvedValue({ alerts: [emergencyAlert] });
    renderCard();
    const viewButton = await screen.findByRole("button", { name: "View" });
    await userEvent.click(viewButton);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Emergency button pressed")).toBeInTheDocument();
    expect(within(dialog).queryByText(/triggered by/i)).not.toBeInTheDocument();
  });
});
