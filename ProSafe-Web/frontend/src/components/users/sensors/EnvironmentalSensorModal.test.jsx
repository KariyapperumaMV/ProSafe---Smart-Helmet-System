import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { EnvironmentalSensorModal } from "./EnvironmentalSensorModal";
import { getNoiseHistory } from "../../../api/userSensorApi";

vi.mock("../../../api/userSensorApi", () => ({
  getNoiseHistory: vi.fn(),
  getGasHistory: vi.fn(),
  getUvHistory: vi.fn(),
  getAmbientTemperatureHistory: vi.fn(),
}));

beforeEach(() => {
  getNoiseHistory.mockReset();
});

describe("EnvironmentalSensorModal", () => {
  test("renders current value, category badge, ranges, and standard from the API — never hardcoded", async () => {
    getNoiseHistory.mockResolvedValue({
      sensor: "noise",
      label: "Sound Level",
      unit: "dB",
      current: { value: 83, timestamp: "2026-08-30T09:45:00.000Z" },
      category: "WARNING",
      ranges: {
        safe: { label: "< 80 dB" },
        warning: { label: "80–85 dB" },
        critical: { label: "≥ 85 dB" },
      },
      standard: "OSHA PEL",
      configurable: true,
      dailyAverages: [{ date: "2026-08-24", average: 78, sampleCount: 1000 }],
    });

    render(<EnvironmentalSensorModal open userId="W-001" sensor="noise" onClose={vi.fn()} />);

    expect(await screen.findByText("83 dB")).toBeInTheDocument();
    expect(screen.getByText("WARNING")).toBeInTheDocument();
    expect(screen.getByText("< 80 dB")).toBeInTheDocument();
    expect(screen.getByText("80–85 dB")).toBeInTheDocument();
    expect(screen.getByText("≥ 85 dB")).toBeInTheDocument();
    expect(screen.getByText(/OSHA PEL/)).toBeInTheDocument();
  });

  test("shows the no-data empty state when there are no daily averages", async () => {
    getNoiseHistory.mockResolvedValue({
      sensor: "noise", label: "Sound Level", unit: "dB",
      current: null, category: null,
      ranges: { safe: { label: "< 80 dB" }, warning: { label: "80–85 dB" }, critical: { label: "≥ 85 dB" } },
      standard: "OSHA PEL", configurable: true, dailyAverages: [],
    });

    render(<EnvironmentalSensorModal open userId="W-001" sensor="noise" onClose={vi.fn()} />);

    expect(await screen.findByText("Latest reading unavailable")).toBeInTheDocument();
    expect(screen.getByText("No valid readings available for the past 7 days.")).toBeInTheDocument();
  });
});
