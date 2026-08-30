import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { SensorHistoryChart } from "./SensorHistoryChart";

describe("SensorHistoryChart", () => {
  test("renders without crashing given daily-average data", () => {
    render(
      <SensorHistoryChart
        data={[
          { date: "2026-08-24", average: 74.1, sampleCount: 1380 },
          { date: "2026-08-25", average: 76.2, sampleCount: 1400 },
        ]}
        unit="BPM"
      />
    );
    expect(screen.getByRole("img", { name: /past 7 days daily average chart/i })).toBeInTheDocument();
  });
});
