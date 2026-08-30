import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { PredictionTimelineChart } from "./PredictionTimelineChart";

describe("PredictionTimelineChart", () => {
  test("renders one legend entry per segment with state, time range, and confidence text (not color-only)", () => {
    render(
      <PredictionTimelineChart
        segments={[
          { state: "SAFE", from: "2026-08-30T02:00:00.000Z", to: "2026-08-30T08:00:00.000Z", pointCount: 40, avgConfidence: 0.96 },
          { state: "WARNING", from: "2026-08-30T08:00:00.000Z", to: "2026-08-30T09:45:00.000Z", pointCount: 12, avgConfidence: 0.89 },
        ]}
      />
    );

    expect(screen.getByText("SAFE")).toBeInTheDocument();
    expect(screen.getByText("WARNING")).toBeInTheDocument();
    expect(screen.getByText("96% confidence")).toBeInTheDocument();
    expect(screen.getByText("89% confidence")).toBeInTheDocument();
  });

  test("omits confidence text when a segment has no confidence data", () => {
    render(
      <PredictionTimelineChart
        segments={[{ state: "SAFE", from: "2026-08-30T02:00:00.000Z", to: "2026-08-30T03:00:00.000Z", pointCount: 1, avgConfidence: null }]}
      />
    );
    expect(screen.queryByText(/confidence/)).not.toBeInTheDocument();
  });
});
