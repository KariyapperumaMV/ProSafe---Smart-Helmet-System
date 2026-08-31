import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { CurrentConditionCard } from "./CurrentConditionCard";
import { getSafetyGuidance } from "../../api/userSensorApi";

vi.mock("../../api/userSensorApi", () => ({ getSafetyGuidance: vi.fn() }));

const SAFE_RESPONSE = {
  timestamp: new Date().toISOString(),
  operationalState: "SAFE",
  mlRiskState: "SAFE",
  emergencyActive: false,
  online: true,
  lastUpdated: new Date().toISOString(),
  readingsLabel: "Current readings",
  summary: { title: "All conditions normal", description: "Current readings are within expected operating conditions." },
  factors: [],
  guidance: [{ priority: "LOW", text: "Continue normal work practices and keep the helmet properly worn." }],
};

const WARNING_RESPONSE = {
  ...SAFE_RESPONSE,
  operationalState: "WARNING",
  mlRiskState: "WARNING",
  summary: { title: "Attention recommended", description: "1 condition currently requires attention." },
  factors: [{ sensor: "noise", label: "Noise", value: 82, unit: "dB", severity: "WARNING", detail: "Configured Warning range" }],
  guidance: [{ priority: "MEDIUM", text: "Noise is currently in the configured Warning range. Consider reducing further exposure and continue monitoring." }],
};

const EMERGENCY_RESPONSE = {
  ...SAFE_RESPONSE,
  operationalState: "EMERGENCY",
  emergencyActive: true,
  summary: { title: "Emergency active", description: "An emergency has been declared for you. Immediate action is required." },
  guidance: [
    { priority: "HIGH", text: "Follow the site emergency procedure." },
    { priority: "HIGH", text: "Seek immediate assistance." },
  ],
};

beforeEach(() => {
  getSafetyGuidance.mockReset();
});

describe("CurrentConditionCard", () => {
  test("shows a loading state, then the SAFE summary and single default action", async () => {
    getSafetyGuidance.mockResolvedValue(SAFE_RESPONSE);
    render(<CurrentConditionCard userId="W-001" />);

    expect(screen.getByText(/loading current condition/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("All conditions normal")).toBeInTheDocument());
    expect(screen.getByText("Safe")).toBeInTheDocument();
    expect(screen.queryByText("Contributing Factors")).not.toBeInTheDocument();
    expect(screen.getByText(/Continue normal work practices/)).toBeInTheDocument();
  });

  test("WARNING state shows the badge, contributing factor, and its action", async () => {
    getSafetyGuidance.mockResolvedValue(WARNING_RESPONSE);
    render(<CurrentConditionCard userId="W-001" />);

    await waitFor(() => expect(screen.getByText("Warning")).toBeInTheDocument());
    expect(screen.getByText("Attention recommended")).toBeInTheDocument();
    expect(screen.getByText("Contributing Factors")).toBeInTheDocument();
    expect(screen.getByText("Noise")).toBeInTheDocument();
    expect(screen.getByText(/reducing further exposure/)).toBeInTheDocument();
  });

  test("EMERGENCY state shows the danger badge and only emergency guidance", async () => {
    getSafetyGuidance.mockResolvedValue(EMERGENCY_RESPONSE);
    render(<CurrentConditionCard userId="W-001" />);

    await waitFor(() => expect(screen.getByText("Emergency Active")).toBeInTheDocument());
    expect(screen.getByText(/Follow the site emergency procedure/)).toBeInTheDocument();
    expect(screen.getByText(/Seek immediate assistance/)).toBeInTheDocument();
  });

  test("shows an error state when the request fails", async () => {
    getSafetyGuidance.mockRejectedValue({ status: 500, message: "Something went wrong. Please try again." });
    render(<CurrentConditionCard userId="W-001" />);

    await waitFor(() => expect(screen.getByText(/couldn't load current condition/i)).toBeInTheDocument());
  });

  test("polls every 60 seconds and stops after unmount", async () => {
    vi.useFakeTimers();
    try {
      getSafetyGuidance.mockResolvedValue(SAFE_RESPONSE);
      const { unmount } = render(<CurrentConditionCard userId="W-001" />);

      await vi.waitFor(() => expect(getSafetyGuidance).toHaveBeenCalledTimes(1));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60000);
      });
      expect(getSafetyGuidance).toHaveBeenCalledTimes(2);

      unmount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(120000);
      });
      expect(getSafetyGuidance).toHaveBeenCalledTimes(2); // no further calls after unmount
    } finally {
      vi.useRealTimers();
    }
  });

  test("no-helmet state renders its message without a Contributing Factors or Recommended Actions section", async () => {
    getSafetyGuidance.mockResolvedValue({
      ...SAFE_RESPONSE,
      operationalState: "NO_HELMET",
      mlRiskState: null,
      online: null,
      lastUpdated: null,
      summary: { title: "No helmet assigned", description: "Current safety guidance will become available when a helmet is assigned and sensor data is received." },
      factors: [],
      guidance: [],
    });
    render(<CurrentConditionCard userId="W-001" />);

    await waitFor(() => expect(screen.getByText("No helmet assigned")).toBeInTheDocument());
    expect(screen.queryByText("Contributing Factors")).not.toBeInTheDocument();
    expect(screen.queryByText("Recommended Actions")).not.toBeInTheDocument();
  });
});
