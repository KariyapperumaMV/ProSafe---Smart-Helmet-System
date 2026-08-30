const request = require("supertest");
const app = require("../app");
const testDb = require("./testDb");
const { createUser, authHeader } = require("./factories");
const HelmetData = require("../models/HelmetData");
const WorkerProcessingState = require("../models/WorkerProcessingState");

beforeAll(testDb.connect);
afterEach(testDb.clearDatabase);
afterAll(testDb.closeDatabase);

function minutesAgo(n) {
  return new Date(Date.now() - n * 60 * 1000);
}

async function packet(workerId, overrides = {}) {
  return HelmetData.create({
    helmetId: "PS-H-TEST",
    workerId,
    timestamp: overrides.timestamp || minutesAgo(5),
    raw: {
      heartRate: 90,
      bodyTemp: 37,
      ambientTemp: 30,
      noise: 80,
      gas: 100,
      uv: 4,
      ...overrides.raw,
    },
    prediction: overrides.prediction || {},
  });
}

describe("RBAC — GET /api/users/:id/sensors/*", () => {
  test("admin can access a worker's sensor history", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });
    await packet(worker.userId);

    const res = await request(app).get(`/api/users/${worker.userId}/sensors/noise`).set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.sensor).toBe("noise");
  });

  test("worker can access their own sensor history", async () => {
    const worker = await createUser({ role: "WORKER" });
    await packet(worker.userId);

    const res = await request(app).get(`/api/users/${worker.userId}/sensors/noise`).set(authHeader(worker));

    expect(res.status).toBe(200);
  });

  test("worker cannot access another worker's sensor history (403)", async () => {
    const worker = await createUser({ role: "WORKER" });
    const other = await createUser({ role: "WORKER" });
    await packet(other.userId);

    const res = await request(app).get(`/api/users/${other.userId}/sensors/noise`).set(authHeader(worker));

    expect(res.status).toBe(403);
  });

  test("targeting an ADMIN user's id returns 400, not sensor data", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const otherAdmin = await createUser({ role: "ADMIN" });

    const res = await request(app).get(`/api/users/${otherAdmin.userId}/sensors/noise`).set(authHeader(admin));

    expect(res.status).toBe(400);
  });

  test("rejects requests with no token", async () => {
    const worker = await createUser({ role: "WORKER" });
    const res = await request(app).get(`/api/users/${worker.userId}/sensors/noise`);
    expect(res.status).toBe(401);
  });

  test("same RBAC applies to /safety-predictions", async () => {
    const worker = await createUser({ role: "WORKER" });
    const other = await createUser({ role: "WORKER" });

    const res = await request(app).get(`/api/users/${other.userId}/safety-predictions`).set(authHeader(worker));
    expect(res.status).toBe(403);
  });
});

describe("Environmental sensors — no data / no helmet", () => {
  test("worker with no HelmetData at all gets a graceful empty response, not an error", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER", helmetId: null });

    const res = await request(app).get(`/api/users/${worker.userId}/sensors/gas`).set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.current).toBeNull();
    expect(res.body.category).toBeNull();
    expect(res.body.dailyAverages).toEqual([]);
  });
});

describe("Environmental sensors — current value, category, ranges", () => {
  test("noise: returns current value, category, ranges, and standard", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });
    await packet(worker.userId, { raw: { noise: 83 } });

    const res = await request(app).get(`/api/users/${worker.userId}/sensors/noise`).set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.current.value).toBe(83);
    expect(res.body.category).toBe("WARNING");
    expect(res.body.standard).toBe("OSHA PEL");
    expect(res.body.ranges.critical.label).toBe("≥ 85 dB");
    expect(res.body.configurable).toBe(true);
  });

  test("gas: SAFE example", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });
    await packet(worker.userId, { raw: { gas: 90 } });

    const res = await request(app).get(`/api/users/${worker.userId}/sensors/gas`).set(authHeader(admin));
    expect(res.body.category).toBe("SAFE");
  });

  test("uv: CRITICAL example", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });
    await packet(worker.userId, { raw: { uv: 9 } });

    const res = await request(app).get(`/api/users/${worker.userId}/sensors/uv`).set(authHeader(admin));
    expect(res.body.category).toBe("CRITICAL");
  });

  test("ambient-temperature: WARNING example, uses the ambientTemp raw field", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });
    await packet(worker.userId, { raw: { ambientTemp: 30 } });

    const res = await request(app)
      .get(`/api/users/${worker.userId}/sensors/ambient-temperature`)
      .set(authHeader(admin));

    expect(res.body.sensor).toBe("ambientTemperature");
    expect(res.body.current.value).toBe(30);
    expect(res.body.category).toBe("WARNING");
  });
});

describe("Daily averages — aggregation correctness", () => {
  test("averages only valid readings, excludes null, includes sampleCount", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });

    await packet(worker.userId, { timestamp: minutesAgo(30), raw: { noise: 70 } });
    await packet(worker.userId, { timestamp: minutesAgo(20), raw: { noise: 80 } });
    await packet(worker.userId, { timestamp: minutesAgo(10), raw: { noise: 90 } });
    // A packet with a missing noise reading — must not drag the average down
    // or inflate sampleCount.
    await packet(worker.userId, { timestamp: minutesAgo(5), raw: { noise: null } });

    const res = await request(app).get(`/api/users/${worker.userId}/sensors/noise`).set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.dailyAverages).toHaveLength(1);
    expect(res.body.dailyAverages[0].average).toBe(80);
    expect(res.body.dailyAverages[0].sampleCount).toBe(3);
  });

  test("a day with zero valid readings is omitted entirely, not returned as zero", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });
    // Only an invalid (null) reading exists — no HelmetData with a real value.
    await packet(worker.userId, { raw: { noise: null } });

    const res = await request(app).get(`/api/users/${worker.userId}/sensors/noise`).set(authHeader(admin));

    expect(res.body.dailyAverages).toEqual([]);
  });

  test("groups by local (Asia/Colombo) calendar day, not raw UTC day", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });

    // 19:00 UTC today -> 00:30 the *next* day in Asia/Colombo (+05:30) —
    // guaranteed to land on a different calendar date than plain UTC.
    const t = new Date();
    t.setUTCHours(19, 0, 0, 0);
    const utcDateStr = t.toISOString().slice(0, 10);
    const colomboDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(t);
    expect(colomboDateStr).not.toBe(utcDateStr);

    await packet(worker.userId, { timestamp: t, raw: { noise: 50 } });

    const res = await request(app).get(`/api/users/${worker.userId}/sensors/noise`).set(authHeader(admin));

    const dates = res.body.dailyAverages.map((d) => d.date);
    expect(dates).toContain(colomboDateStr);
    expect(dates).not.toContain(utcDateStr);
  });
});

describe("Personalized sensors — baseline and deviation", () => {
  test("heart rate: computes deviation from the worker's actual stored baseline", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });
    worker.baselineHeartRate = 72;
    await worker.save();
    await packet(worker.userId, { raw: { heartRate: 92 } });

    const res = await request(app).get(`/api/users/${worker.userId}/sensors/heart-rate`).set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.current.value).toBe(92);
    expect(res.body.baseline).toBe(72);
    // (92-72)/72*100 = 27.777... -> rounded to 27.78
    expect(res.body.deviationPercent).toBeCloseTo(27.78, 1);
  });

  test("body temperature: missing baseline -> baseline null, deviation unavailable (never fabricated)", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" }); // baselineBodyTemperature left unset
    await packet(worker.userId, { raw: { bodyTemp: 37.8 } });

    const res = await request(app)
      .get(`/api/users/${worker.userId}/sensors/body-temperature`)
      .set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.current.value).toBe(37.8);
    expect(res.body.baseline).toBeNull();
    expect(res.body.deviationPercent).toBeNull();
  });

  test("no HelmetData at all: current is null, baseline is still reported if configured", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });
    worker.baselineHeartRate = 70;
    await worker.save();

    const res = await request(app).get(`/api/users/${worker.userId}/sensors/heart-rate`).set(authHeader(admin));

    expect(res.body.current).toBeNull();
    expect(res.body.baseline).toBe(70);
    expect(res.body.deviationPercent).toBeNull();
  });
});

describe("Safety prediction history", () => {
  test("returns currentRiskState, latest accepted prediction, and today's compressed timeline", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });

    await WorkerProcessingState.create({
      workerId: worker.userId,
      currentRiskState: "WARNING",
      emergencyActive: false,
      predictionHistory: [
        { riskLevel: "SAFE", confidence: 0.96, at: minutesAgo(20) },
        { riskLevel: "WARNING", confidence: 0.88, at: minutesAgo(5) },
      ],
    });

    // Two consecutive SAFE packets, then a WARNING packet -> 2 segments.
    await packet(worker.userId, {
      timestamp: minutesAgo(30),
      prediction: { ranMl: true, accepted: true, smoothedState: "SAFE", confidence: 0.96, predictedState: "SAFE" },
    });
    await packet(worker.userId, {
      timestamp: minutesAgo(25),
      prediction: { ranMl: true, accepted: true, smoothedState: "SAFE", confidence: 0.94, predictedState: "SAFE" },
    });
    await packet(worker.userId, {
      timestamp: minutesAgo(5),
      prediction: { ranMl: true, accepted: true, smoothedState: "WARNING", confidence: 0.88, predictedState: "WARNING" },
    });
    // Not accepted — must be excluded from the timeline entirely.
    await packet(worker.userId, {
      timestamp: minutesAgo(2),
      prediction: { ranMl: true, accepted: false, smoothedState: null, confidence: 0.4, predictedState: "WARNING" },
    });

    const res = await request(app).get(`/api/users/${worker.userId}/safety-predictions`).set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.currentRiskState).toBe("WARNING");
    expect(res.body.latestPrediction).toEqual({ state: "WARNING", confidence: 0.88, timestamp: expect.any(String) });

    expect(res.body.todayHistory).toHaveLength(2);
    expect(res.body.todayHistory[0]).toMatchObject({ state: "SAFE", pointCount: 2 });
    expect(res.body.todayHistory[0].avgConfidence).toBeCloseTo(0.95, 2);
    expect(res.body.todayHistory[1]).toMatchObject({ state: "WARNING", pointCount: 1 });
  });

  test("emergencyActive is reported separately and is never injected into the ML timeline", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });

    await WorkerProcessingState.create({
      workerId: worker.userId,
      currentRiskState: "SAFE",
      emergencyActive: true,
    });
    await packet(worker.userId, {
      timestamp: minutesAgo(5),
      prediction: { ranMl: true, accepted: true, smoothedState: "SAFE", confidence: 0.97, predictedState: "SAFE" },
    });

    const res = await request(app).get(`/api/users/${worker.userId}/safety-predictions`).set(authHeader(admin));

    expect(res.body.emergencyActive).toBe(true);
    expect(res.body.currentRiskState).toBe("SAFE");
    for (const segment of res.body.todayHistory) {
      expect(segment.state).not.toBe("EMERGENCY");
    }
  });

  test("worker with no WorkerProcessingState yet gets nulls, not an error", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });

    const res = await request(app).get(`/api/users/${worker.userId}/safety-predictions`).set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.currentRiskState).toBeNull();
    expect(res.body.emergencyActive).toBe(false);
    expect(res.body.latestPrediction).toBeNull();
    expect(res.body.todayHistory).toEqual([]);
  });
});
