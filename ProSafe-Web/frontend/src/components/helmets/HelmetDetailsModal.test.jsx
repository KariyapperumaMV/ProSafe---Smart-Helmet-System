import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelmetDetailsModal } from "./HelmetDetailsModal";
import { getHelmet } from "../../api/helmetApi";

vi.mock("../../api/helmetApi", () => ({
  getHelmet: vi.fn(),
}));

beforeEach(() => {
  getHelmet.mockReset();
});

describe("HelmetDetailsModal", () => {
  test("renders the assigned worker and worker safety state", async () => {
    getHelmet.mockResolvedValue({
      helmet: { helmetId: "PS-H-001", status: "ACTIVE", createdAt: "2026-08-01T00:00:00.000Z" },
      assigned: true,
      assignedTo: { userId: "W-015", name: "Nirmani Silva" },
      online: true,
      lastSeenAt: new Date(Date.now() - 60 * 1000).toISOString(),
      latestCommand: { command: "SET_RISK", risk: "WARNING" },
      workerSafety: { currentRiskState: "WARNING", emergencyActive: false },
    });

    render(<HelmetDetailsModal open helmetId="PS-H-001" onClose={vi.fn()} />);

    expect(await screen.findByText("PS-H-001")).toBeInTheDocument();
    expect(screen.getByText("Nirmani Silva")).toBeInTheDocument();
    expect(screen.getByText("W-015")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByText("WARNING")).toBeInTheDocument();
  });

  test("shows 'Not assigned' for an unassigned helmet", async () => {
    getHelmet.mockResolvedValue({
      helmet: { helmetId: "PS-H-002", status: "ACTIVE", createdAt: "2026-08-01T00:00:00.000Z" },
      assigned: false,
      assignedTo: null,
      online: null,
      lastSeenAt: null,
      latestCommand: null,
      workerSafety: null,
    });

    render(<HelmetDetailsModal open helmetId="PS-H-002" onClose={vi.fn()} />);

    expect(await screen.findByText("Not assigned")).toBeInTheDocument();
    expect(screen.getByText("No sensor data received yet")).toBeInTheDocument();
    // No worker-safety section rendered at all when unassigned.
    expect(screen.queryByText("Worker Safety")).not.toBeInTheDocument();
  });

  test("shows EMERGENCY distinctly rather than folding it into the risk badge", async () => {
    getHelmet.mockResolvedValue({
      helmet: { helmetId: "PS-H-003", status: "ACTIVE", createdAt: "2026-08-01T00:00:00.000Z" },
      assigned: true,
      assignedTo: { userId: "W-020", name: "Kasun Perera" },
      online: true,
      lastSeenAt: new Date().toISOString(),
      latestCommand: null,
      workerSafety: { currentRiskState: "SAFE", emergencyActive: true },
    });

    render(<HelmetDetailsModal open helmetId="PS-H-003" onClose={vi.fn()} />);

    expect(await screen.findByText("Emergency")).toBeInTheDocument();
    expect(screen.queryByText("SAFE")).not.toBeInTheDocument();
  });

  test("shows an error state when the request fails", async () => {
    getHelmet.mockRejectedValue({ status: 500, message: "Internal server error" });
    render(<HelmetDetailsModal open helmetId="PS-H-500" onClose={vi.fn()} />);
    expect(await screen.findByText("Couldn't load this helmet")).toBeInTheDocument();
    expect(screen.getByText("Internal server error")).toBeInTheDocument();
  });

  test("shows a 'Helmet not found' title for a 404", async () => {
    getHelmet.mockRejectedValue({ status: 404, message: "Helmet not found" });
    render(<HelmetDetailsModal open helmetId="PS-H-404" onClose={vi.fn()} />);
    expect(await screen.findAllByText("Helmet not found")).not.toHaveLength(0);
  });
});
