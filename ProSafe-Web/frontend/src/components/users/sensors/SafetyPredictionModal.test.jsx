import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SafetyPredictionModal } from "./SafetyPredictionModal";
import { getSafetyPredictionHistory } from "../../../api/userSensorApi";

vi.mock("../../../api/userSensorApi", () => ({
  getSafetyPredictionHistory: vi.fn(),
}));

beforeEach(() => {
  getSafetyPredictionHistory.mockReset();
});

describe("SafetyPredictionModal", () => {
  test("renders current risk state, latest prediction with confidence, and today's timeline", async () => {
    getSafetyPredictionHistory.mockResolvedValue({
      currentRiskState: "WARNING",
      emergencyActive: false,
      latestPrediction: { state: "WARNING", confidence: 0.91, timestamp: "2026-08-30T09:45:00.000Z" },
      todayHistory: [
        { state: "SAFE", from: "2026-08-30T02:00:00.000Z", to: "2026-08-30T08:00:00.000Z", pointCount: 40, avgConfidence: 0.96 },
        { state: "WARNING", from: "2026-08-30T08:00:00.000Z", to: "2026-08-30T09:45:00.000Z", pointCount: 12, avgConfidence: 0.89 },
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
      latestPrediction: { state: "SAFE", confidence: 0.97, timestamp: "2026-08-30T09:45:00.000Z" },
      todayHistory: [
        { state: "SAFE", from: "2026-08-30T02:00:00.000Z", to: "2026-08-30T09:45:00.000Z", pointCount: 40, avgConfidence: 0.97 },
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
    expect(screen.getByText("No accepted predictions recorded yet today.")).toBeInTheDocument();
  });
});
