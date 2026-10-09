import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { OperationalStatus, RiskBadge } from "./StatusBadge";
import { WorkerSafetyCard } from "../dashboard/WorkerSafetyCard";
import { WorkerStatusSummary } from "../dashboard/WorkerStatusSummary";
import { PredictionTimelineChart } from "../users/sensors/PredictionTimelineChart";

// UNCERTAIN = no trustworthy risk decision. It must render as its own grey
// state with a reason — never as Safe, and never as plain "Unknown".
describe("UNCERTAIN status display", () => {
  test("RiskBadge renders UNCERTAIN with the uncertain tone, not green", () => {
    const { container } = render(<RiskBadge state="UNCERTAIN" />);
    expect(screen.getByText("Uncertain")).toBeInTheDocument();
    expect(container.querySelector(".ps-badge-uncertain")).not.toBeNull();
    expect(container.querySelector(".ps-badge-green")).toBeNull();
  });

  test("OperationalStatus shows the reason for an UNCERTAIN worker", () => {
    render(<OperationalStatus status={{ operationalState: "UNCERTAIN", currentRiskState: null, dataUncertain: true, uncertainReason: "BASELINE_UNAVAILABLE" }} />);
    expect(screen.getByText("Uncertain")).toBeInTheDocument();
    expect(screen.getByText("Worker baseline not set")).toBeInTheDocument();
  });

  test("a confirmed CRITICAL with uncertain data stays CRITICAL and says the data are uncertain", () => {
    render(<OperationalStatus status={{ operationalState: "CRITICAL", currentRiskState: "CRITICAL", dataUncertain: true, uncertainReason: "BODY_CONTACT_FAILURE" }} />);
    expect(screen.getByText("CRITICAL")).toBeInTheDocument();
    expect(screen.getByText("Data uncertain: Sensor skin contact lost")).toBeInTheDocument();
  });

  test("WorkerSafetyCard displays the server's operational state (UNCERTAIN), not the stale risk state", () => {
    render(<WorkerSafetyCard status={{ operationalState: "UNCERTAIN", currentRiskState: null, emergencyActive: false, dataUncertain: true, uncertainReason: "SENSOR_WARMUP" }} />);
    expect(screen.getByText("Uncertain")).toBeInTheDocument();
    expect(screen.getByText("Sensor warm-up")).toBeInTheDocument();
    expect(screen.queryByText("SAFE")).not.toBeInTheDocument();
  });

  test("WorkerStatusSummary lists Uncertain as its own category", () => {
    render(<WorkerStatusSummary workerStatus={{ total: 3, safe: 1, warning: 0, critical: 0, emergency: 0, uncertain: 2, unknown: 0 }} />);
    expect(screen.getByText("Uncertain")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  test("the prediction timeline draws UNCERTAIN segments with their own style", () => {
    const { container } = render(
      <PredictionTimelineChart
        segments={[
          { state: "UNCERTAIN", from: "2026-10-09T03:30:00.000Z", to: "2026-10-09T03:33:00.000Z", pointCount: 180, avgConfidence: null },
          { state: "SAFE", from: "2026-10-09T03:33:00.000Z", to: "2026-10-09T04:00:00.000Z", pointCount: 1620, avgConfidence: 0.93 },
        ]}
      />
    );
    expect(screen.getByText("UNCERTAIN")).toBeInTheDocument();
    expect(container.querySelector(".ps-timeline-segment.ps-timeline-uncertain")).not.toBeNull();
  });
});
