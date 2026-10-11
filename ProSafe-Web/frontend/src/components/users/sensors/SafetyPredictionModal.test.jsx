import { describe, expect, test, vi, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emitLive } from "../../../live/liveUpdates";
import { SafetyPredictionModal } from "./SafetyPredictionModal";
import { getSafetyPredictionHistory } from "../../../api/userSensorApi";

vi.mock("../../../api/userSensorApi", () => ({
  getSafetyPredictionHistory: vi.fn(),
}));

// Times relative to now: the trend shows the last hour by default.
const minutesAgo = (m) => new Date(Date.now() - m * 60 * 1000).toISOString();

beforeEach(() => {
  getSafetyPredictionHistory.mockReset();
});

describe("SafetyPredictionModal", () => {
  test("renders current risk state, latest prediction with confidence, and today's timeline", async () => {
    getSafetyPredictionHistory.mockResolvedValue({
      currentRiskState: "WARNING",
      emergencyActive: false,
      latestPrediction: { state: "WARNING", confidence: 0.91, timestamp: minutesAgo(1) },
      todayHistory: [
        { state: "SAFE", from: minutesAgo(50), to: minutesAgo(20), pointCount: 40, avgConfidence: 0.96 },
        { state: "WARNING", from: minutesAgo(20), to: minutesAgo(1), pointCount: 12, avgConfidence: 0.89 },
      ],
    });

    render(<SafetyPredictionModal open userId="W-001" onClose={vi.fn()} />);

    expect(await screen.findByText("91% confidence", { exact: false })).toBeInTheDocument();
    const warningBadges = screen.getAllByText("WARNING");
    expect(warningBadges.length).toBeGreaterThan(0);
    expect(screen.getAllByText("SAFE").length).toBeGreaterThan(0);
  });

  test("shows the emergency banner separately from the ML prediction, and it never appears as a timeline state", async () => {
    getSafetyPredictionHistory.mockResolvedValue({
      currentRiskState: "SAFE",
      emergencyActive: true,
      latestPrediction: { state: "SAFE", confidence: 0.97, timestamp: minutesAgo(1) },
      todayHistory: [
        { state: "SAFE", from: minutesAgo(50), to: minutesAgo(1), pointCount: 40, avgConfidence: 0.97 },
      ],
    });

    render(<SafetyPredictionModal open userId="W-001" onClose={vi.fn()} />);

    expect(await screen.findByText("Emergency Active")).toBeInTheDocument();
    expect(screen.queryByText("EMERGENCY")).not.toBeInTheDocument();
  });

  test("shows an empty state when there is no accepted prediction yet today", async () => {
    getSafetyPredictionHistory.mockResolvedValue({
      currentRiskState: null,
      emergencyActive: false,
      latestPrediction: null,
      todayHistory: [],
    });

    render(<SafetyPredictionModal open userId="W-001" onClose={vi.fn()} />);

    expect(await screen.findByText("No accepted prediction yet")).toBeInTheDocument();
    expect(screen.getByText("No predictions recorded yet today.")).toBeInTheDocument();
  });

  describe("live updates (no refresh)", () => {
    const history = () => ({
      operationalState: "SAFE", currentRiskState: "SAFE", emergencyActive: false, dataUncertain: false,
      latestPrediction: { state: "SAFE", confidence: 0.95, timestamp: minutesAgo(2) },
      todayHistory: [
        { state: "SAFE", from: minutesAgo(10), to: minutesAgo(2), pointCount: 480, avgConfidence: 0.95, dataQuality: "VALID" },
      ],
      timelineGapSeconds: 600,
    });
    const liveEvent = (workerId, state, confidence = 0.84) => ({
      kind: "WORKER_UPDATE",
      workerId,
      status: { operationalState: state, currentRiskState: state, emergencyActive: false, dataQualityState: "READY", dataUncertain: false, uncertainReason: null },
      latest: { timestamp: minutesAgo(1), systemState: state, confidence, accepted: true },
      points: [{ timestamp: minutesAgo(1), state, systemState: state, confidence, dataQuality: "VALID" }],
    });

    test("current status, latest prediction and the trend list update when a live event arrives", async () => {
      getSafetyPredictionHistory.mockResolvedValue(history());
      render(<SafetyPredictionModal open userId="W-001" onClose={vi.fn()} />);
      expect(await screen.findByText(/95% confidence ·/)).toBeInTheDocument();

      act(() => emitLive(liveEvent("W-001", "WARNING")));

      expect(screen.getByText(/84% confidence ·/)).toBeInTheDocument();
      const periods = screen.getByRole("list", { name: "Safety status periods" });
      expect(within(periods).getAllByRole("listitem").map((li) => li.textContent.split(/\d/)[0])).toEqual(["WARNING", "SAFE"]);
      expect(getSafetyPredictionHistory).toHaveBeenCalledTimes(1); // merged locally, no refetch
    });

    test("another worker's update does not change this worker's modal", async () => {
      getSafetyPredictionHistory.mockResolvedValue(history());
      render(<SafetyPredictionModal open userId="W-001" onClose={vi.fn()} />);
      expect(await screen.findByText(/95% confidence ·/)).toBeInTheDocument();

      act(() => emitLive(liveEvent("W-002", "CRITICAL", 0.99)));

      expect(screen.queryByText(/99% confidence ·/)).not.toBeInTheDocument();
      expect(within(screen.getByRole("list", { name: "Safety status periods" })).getAllByRole("listitem")).toHaveLength(1);
    });

    test("UNCERTAIN live data keeps the confirmed state and says the data are uncertain", async () => {
      getSafetyPredictionHistory.mockResolvedValue(history());
      render(<SafetyPredictionModal open userId="W-001" onClose={vi.fn()} />);
      await screen.findByText(/95% confidence ·/);

      act(() => emitLive({
        kind: "WORKER_UPDATE", workerId: "W-001",
        status: { operationalState: "UNCERTAIN", currentRiskState: null, dataQualityState: "UNCERTAIN", dataUncertain: true, uncertainReason: "BODY_CONTACT_FAILURE" },
        latest: { timestamp: minutesAgo(1), systemState: "UNCERTAIN", confidence: null, accepted: false },
        points: [{ timestamp: minutesAgo(1), state: "UNCERTAIN", systemState: "UNCERTAIN", confidence: null, uncertainReason: "BODY_CONTACT_FAILURE" }],
      }));

      expect(screen.getAllByText("Uncertain").length).toBeGreaterThan(0);
      expect(screen.getByText("No reliable prediction from the latest sensor data.")).toBeInTheDocument();
      expect(screen.getAllByText("Sensor skin contact lost").length).toBeGreaterThan(0);
      expect(screen.getByText(/95% confidence ·/)).toBeInTheDocument(); // last accepted kept
    });

    test("after a stream reconnect the history is refetched", async () => {
      getSafetyPredictionHistory.mockResolvedValue(history());
      render(<SafetyPredictionModal open userId="W-001" onClose={vi.fn()} />);
      await screen.findByText(/95% confidence ·/);
      await act(async () => {
        emitLive({ kind: "STREAM_CONNECTED", reconnected: true });
        await Promise.resolve();
      });
      expect(getSafetyPredictionHistory).toHaveBeenCalledTimes(2);
    });

    test("range pills switch the trend window", async () => {
      getSafetyPredictionHistory.mockResolvedValue({
        ...history(),
        todayHistory: [{ state: "SAFE", from: minutesAgo(50), to: minutesAgo(40), pointCount: 600, avgConfidence: 0.95 }],
      });
      render(<SafetyPredictionModal open userId="W-001" onClose={vi.fn()} />);
      await userEvent.click(await screen.findByRole("button", { name: "Last 15 min" }));
      expect(screen.getByText("No predictions in this time range.")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Last 1 hour" }));
      expect(screen.getByRole("list", { name: "Safety status periods" })).toBeInTheDocument();
    });
  });
});
