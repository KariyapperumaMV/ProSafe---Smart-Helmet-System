import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkerStatusSummary } from "./WorkerStatusSummary";

describe("WorkerStatusSummary", () => {
  test("renders every category's count, including UNKNOWN, as text (not color-only)", () => {
    render(<WorkerStatusSummary workerStatus={{ total: 5, safe: 1, warning: 1, critical: 1, emergency: 1, unknown: 1 }} />);

    expect(screen.getByText("5")).toBeInTheDocument(); // total in the donut center
    expect(screen.getByText("Safe")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("Emergency")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    // Five counts of "1" (one per category) alongside the total "5".
    expect(screen.getAllByText("1")).toHaveLength(5);
  });

  test("shows an empty state when there are no workers", () => {
    render(<WorkerStatusSummary workerStatus={{ total: 0, safe: 0, warning: 0, critical: 0, emergency: 0, unknown: 0 }} />);
    expect(screen.getByText("No workers yet")).toBeInTheDocument();
  });

  test("handles a missing workerStatus prop gracefully", () => {
    render(<WorkerStatusSummary workerStatus={undefined} />);
    expect(screen.getByText("No workers yet")).toBeInTheDocument();
  });
});
