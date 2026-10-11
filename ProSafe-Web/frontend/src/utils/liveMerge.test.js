import { describe, expect, test } from "vitest";
import { applyLiveUpdateToPredictionSummary, applyLiveUpdateToUserDetail, applyLiveUpdateToWorkerDashboard } from "./liveMerge";

const event = (workerId, overrides = {}) => ({
  kind: "WORKER_UPDATE",
  workerId,
  status: { operationalState: "WARNING", currentRiskState: "WARNING", emergencyActive: false, dataQualityState: "READY", dataUncertain: false, uncertainReason: null },
  latest: {
    timestamp: "2026-10-09T05:00:10.000Z",
    systemState: "WARNING", predictedState: "WARNING", smoothedState: "WARNING", confidence: 0.84, accepted: true,
    dataQuality: "VALID", uncertainReason: null,
    sensors: { heartRate: 101, bodyTemp: 37.4, ambientTemp: 33, noise: 82, gas: 12, uv: 6 },
  },
  points: [
    { timestamp: "2026-10-09T05:00:09.000Z", state: "UNCERTAIN", systemState: "UNCERTAIN", confidence: null },
    { timestamp: "2026-10-09T05:00:10.000Z", state: "WARNING", systemState: "WARNING", confidence: 0.84 },
  ],
  ...overrides,
});

describe("applyLiveUpdateToUserDetail", () => {
  const detail = {
    user: { userId: "W-001", role: "WORKER" },
    operationalState: "SAFE", currentRiskState: "SAFE",
    latestSensorData: { timestamp: "2026-10-09T05:00:00.000Z", sensors: { heartRate: 80, gps: { lat: 6.9, lon: 79.8 } } },
    online: false,
  };

  test("updates status and latest sensor values, keeping the last GPS fix", () => {
    const next = applyLiveUpdateToUserDetail(detail, event("W-001"));
    expect(next).toMatchObject({ operationalState: "WARNING", currentRiskState: "WARNING", online: true, lastSeenAt: "2026-10-09T05:00:10.000Z" });
    expect(next.latestSensorData.sensors).toEqual({ gps: { lat: 6.9, lon: 79.8 }, heartRate: 101, bodyTemp: 37.4, ambientTemp: 33, noise: 82, gas: 12, uv: 6 });
    expect(next.latestSensorData.prediction).toMatchObject({ systemState: "WARNING", confidence: 0.84 });
    expect(detail.operationalState).toBe("SAFE"); // not mutated
  });

  test("an update for another worker changes nothing", () => {
    expect(applyLiveUpdateToUserDetail(detail, event("W-002"))).toBe(detail);
  });

  test("an older sample never overwrites newer sensor values", () => {
    const newer = { ...detail, latestSensorData: { timestamp: "2026-10-09T06:00:00.000Z", sensors: { heartRate: 70 } } };
    expect(applyLiveUpdateToUserDetail(newer, event("W-001")).latestSensorData.sensors.heartRate).toBe(70);
  });

  test("UNCERTAIN status is applied as-is (never turned into SAFE)", () => {
    const next = applyLiveUpdateToUserDetail(detail, event("W-001", {
      status: { operationalState: "UNCERTAIN", currentRiskState: null, dataUncertain: true, uncertainReason: "BODY_CONTACT_FAILURE", dataQualityState: "UNCERTAIN" },
    }));
    expect(next).toMatchObject({ operationalState: "UNCERTAIN", currentRiskState: null, dataUncertain: true, uncertainReason: "BODY_CONTACT_FAILURE" });
  });
});

describe("applyLiveUpdateToWorkerDashboard", () => {
  const dash = {
    user: { userId: "W-001" },
    status: { operationalState: "SAFE", currentRiskState: "SAFE", emergencyActive: false },
    latestSensors: { timestamp: "2026-10-09T05:00:00.000Z", heartRate: 80, gas: 9 },
    helmet: { helmetId: "PS-H-001", online: false },
  };

  test("status card and sensor values follow the worker's own update", () => {
    const next = applyLiveUpdateToWorkerDashboard(dash, event("W-001"));
    expect(next.status).toMatchObject({ operationalState: "WARNING", emergencyActive: false });
    expect(next.latestSensors).toEqual({ timestamp: "2026-10-09T05:00:10.000Z", heartRate: 101, bodyTemp: 37.4, ambientTemp: 33, noise: 82, gas: 12, uv: 6 });
    expect(next.helmet).toMatchObject({ online: true });
  });

  test("another worker's update is ignored", () => {
    expect(applyLiveUpdateToWorkerDashboard(dash, event("W-009"))).toBe(dash);
  });
});

describe("applyLiveUpdateToPredictionSummary", () => {
  test("latest prediction = last ACCEPTED point; status merged", () => {
    const prev = { operationalState: "SAFE", latestPrediction: { state: "SAFE", confidence: 0.9, timestamp: "2026-10-09T04:00:00.000Z" } };
    const next = applyLiveUpdateToPredictionSummary(prev, event("W-001"));
    expect(next.latestPrediction).toEqual({ state: "WARNING", confidence: 0.84, timestamp: "2026-10-09T05:00:10.000Z" });
    expect(next.operationalState).toBe("WARNING");
  });

  test("only UNCERTAIN points: latest accepted prediction is kept", () => {
    const prev = { latestPrediction: { state: "SAFE", confidence: 0.9, timestamp: "2026-10-09T04:00:00.000Z" } };
    const next = applyLiveUpdateToPredictionSummary(prev, event("W-001", { points: [{ timestamp: "2026-10-09T05:00:11.000Z", state: "UNCERTAIN" }] }));
    expect(next.latestPrediction).toEqual(prev.latestPrediction);
  });
});
