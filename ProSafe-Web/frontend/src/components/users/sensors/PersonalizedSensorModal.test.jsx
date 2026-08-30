import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PersonalizedSensorModal } from "./PersonalizedSensorModal";
import { getHeartRateHistory, getBodyTemperatureHistory } from "../../../api/userSensorApi";

vi.mock("../../../api/userSensorApi", () => ({
  getHeartRateHistory: vi.fn(),
  getBodyTemperatureHistory: vi.fn(),
}));

beforeEach(() => {
  getHeartRateHistory.mockReset();
  getBodyTemperatureHistory.mockReset();
});

describe("PersonalizedSensorModal", () => {
  test("shows a loading state, then the current value, baseline, and deviation", async () => {
    getHeartRateHistory.mockResolvedValue({
      sensor: "heartRate",
      label: "Heart Rate",
      unit: "BPM",
      current: { value: 92, timestamp: "2026-08-30T09:45:00.000Z" },
      baseline: 72,
      deviationPercent: 27.78,
      dailyAverages: [{ date: "2026-08-24", average: 74.1, sampleCount: 1380 }],
    });

    render(<PersonalizedSensorModal open userId="W-001" sensor="heartRate" onClose={vi.fn()} />);

    expect(screen.getByText(/loading heart rate history/i)).toBeInTheDocument();

    expect(await screen.findByText("92 BPM")).toBeInTheDocument();
    expect(screen.getByText("72 BPM")).toBeInTheDocument();
    expect(screen.getByText("+27.78%")).toBeInTheDocument();
  });

  test("shows 'Baseline not configured' and no fabricated deviation when baseline is missing", async () => {
    getBodyTemperatureHistory.mockResolvedValue({
      sensor: "bodyTemperature",
      label: "Body Temperature",
      unit: "°C",
      current: { value: 37.8, timestamp: "2026-08-30T09:45:00.000Z" },
      baseline: null,
      deviationPercent: null,
      dailyAverages: [],
    });

    render(<PersonalizedSensorModal open userId="W-001" sensor="bodyTemperature" onClose={vi.fn()} />);

    expect(await screen.findByText("Baseline not configured")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("No valid readings available for the past 7 days.")).toBeInTheDocument();
  });

  test("shows 'Latest reading unavailable' when there is no current packet", async () => {
    getHeartRateHistory.mockResolvedValue({
      sensor: "heartRate",
      label: "Heart Rate",
      unit: "BPM",
      current: null,
      baseline: 70,
      deviationPercent: null,
      dailyAverages: [],
    });

    render(<PersonalizedSensorModal open userId="W-001" sensor="heartRate" onClose={vi.fn()} />);

    expect(await screen.findByText("Latest reading unavailable")).toBeInTheDocument();
  });

  test("shows an error state when the request fails", async () => {
    getHeartRateHistory.mockRejectedValue({ status: 500, message: "Internal server error" });

    render(<PersonalizedSensorModal open userId="W-001" sensor="heartRate" onClose={vi.fn()} />);

    expect(await screen.findByText("Couldn't load this data")).toBeInTheDocument();
  });

  test("calls onClose when the close button is clicked", async () => {
    getHeartRateHistory.mockResolvedValue({
      sensor: "heartRate", label: "Heart Rate", unit: "BPM",
      current: null, baseline: null, deviationPercent: null, dailyAverages: [],
    });
    const onClose = vi.fn();
    render(<PersonalizedSensorModal open userId="W-001" sensor="heartRate" onClose={onClose} />);

    await waitFor(() => expect(getHeartRateHistory).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: /close dialog/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("renders nothing when closed", () => {
    render(<PersonalizedSensorModal open={false} userId="W-001" sensor="heartRate" onClose={vi.fn()} />);
    expect(screen.queryByText("Heart Rate")).not.toBeInTheDocument();
    expect(getHeartRateHistory).not.toHaveBeenCalled();
  });
});
