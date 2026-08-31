const testDb = require("./testDb");
const { createUser } = require("./factories");
const HelmetData = require("../models/HelmetData");
const WorkerProcessingState = require("../models/WorkerProcessingState");
const safetyGuidanceService = require("../services/safetyGuidanceService");

beforeAll(testDb.connect);
afterEach(testDb.clearDatabase);
afterAll(testDb.closeDatabase);

function minutesAgo(n) {
  return new Date(Date.now() - n * 60 * 1000);
}

async function packet(workerId, helmetId, overrides = {}) {
  return HelmetData.create({
    helmetId,
    workerId,
    timestamp: overrides.timestamp || minutesAgo(1),
    raw: {
      heartRate: 75,
      bodyTemp: 37,
      ambientTemp: 25,
      noise: 60,
      gas: 100,
      uv: 2,
      ...overrides.raw,
    },
  });
}

async function state(workerId, overrides = {}) {
  return WorkerProcessingState.create({ workerId, currentRiskState: "SAFE", emergencyActive: false, ...overrides });
}

describe("safetyGuidanceService.getSafetyGuidance — target validation", () => {
  test("unknown/inactive user -> 404", async () => {
    const res = await safetyGuidanceService.getSafetyGuidance("NO-SUCH-USER", "ADMIN");
    expect(res).toEqual({ ok: false, status: 404, message: "User not found" });
  });

  test("ADMIN target rejected with 400", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await safetyGuidanceService.getSafetyGuidance(admin.userId, "ADMIN");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });
});

describe("no helmet / no data states", () => {
  test("worker with no helmet -> NO_HELMET, empty factors/guidance", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: null });
    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");

    expect(res.ok).toBe(true);
    expect(res.body.operationalState).toBe("NO_HELMET");
    expect(res.body.factors).toEqual([]);
    expect(res.body.guidance).toEqual([]);
    expect(res.body.summary.title).toBe("No helmet assigned");
  });

  test("helmet assigned, never sent a packet -> NO_DATA", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");

    expect(res.body.operationalState).toBe("NO_DATA");
    expect(res.body.factors).toEqual([]);
    expect(res.body.guidance).toEqual([]);
    expect(res.body.summary.title).toBe("Waiting for sensor data");
  });

  test("emergency active even with zero packets ever received -> EMERGENCY overrides NO_DATA", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await state(worker.userId, { emergencyActive: true });

    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");
    expect(res.body.operationalState).toBe("EMERGENCY");
  });
});

describe("no WorkerProcessingState yet — never defaults to SAFE", () => {
  test("packet received but ML pipeline hasn't produced a currentRiskState yet -> UNKNOWN, not SAFE", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await packet(worker.userId, worker.helmetId); // all-safe readings, but no WorkerProcessingState doc at all

    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");
    expect(res.body.mlRiskState).toBeNull();
    expect(res.body.operationalState).toBe("UNKNOWN");
  });
});

describe("environmental factor thresholds — exact boundaries reused from sensorRanges", () => {
  test("noise 79 -> no factor (SAFE, below range)", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await state(worker.userId, { currentRiskState: "SAFE" });
    await packet(worker.userId, worker.helmetId, { raw: { noise: 79 } });

    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");
    expect(res.body.factors.find((f) => f.sensor === "noise")).toBeUndefined();
    expect(res.body.operationalState).toBe("SAFE");
  });

  test("noise 80 -> WARNING factor", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await packet(worker.userId, worker.helmetId, { raw: { noise: 80 } });

    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");
    const factor = res.body.factors.find((f) => f.sensor === "noise");
    expect(factor.severity).toBe("WARNING");
    expect(res.body.operationalState).toBe("WARNING");
  });

  test("noise 85 -> CRITICAL factor", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await packet(worker.userId, worker.helmetId, { raw: { noise: 85 } });

    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");
    const factor = res.body.factors.find((f) => f.sensor === "noise");
    expect(factor.severity).toBe("CRITICAL");
    expect(res.body.operationalState).toBe("CRITICAL");
  });

  test("gas 149 -> SAFE (no factor)", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await packet(worker.userId, worker.helmetId, { raw: { gas: 149 } });

    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");
    expect(res.body.factors.find((f) => f.sensor === "gas")).toBeUndefined();
  });

  test("gas 150 -> WARNING factor", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await packet(worker.userId, worker.helmetId, { raw: { gas: 150 } });

    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");
    expect(res.body.factors.find((f) => f.sensor === "gas").severity).toBe("WARNING");
  });

  test("gas 301 -> CRITICAL factor", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await packet(worker.userId, worker.helmetId, { raw: { gas: 301 } });

    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");
    expect(res.body.factors.find((f) => f.sensor === "gas").severity).toBe("CRITICAL");
  });
});

describe("heart-rate / body-temperature — never an invented severity band", () => {
  test("heart rate 27.8% above baseline -> INFO severity, attention true, no CRITICAL/WARNING label", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    worker.baselineHeartRate = 72;
    await worker.save();
    await packet(worker.userId, worker.helmetId, { raw: { heartRate: 92 } });

    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");
    const factor = res.body.factors.find((f) => f.sensor === "heartRate");
    expect(factor.severity).toBe("INFO");
    expect(factor.attention).toBe(true);
    expect(factor.detail).toMatch(/27\.8% above personal baseline/);
  });

  test("heart rate 5% above baseline -> attention false, still shown factually", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    worker.baselineHeartRate = 72;
    await worker.save();
    await packet(worker.userId, worker.helmetId, { raw: { heartRate: 75.6 } });

    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");
    const factor = res.body.factors.find((f) => f.sensor === "heartRate");
    expect(factor.attention).toBe(false);
  });

  test("body temperature never gets a severity beyond INFO or an attention flag, regardless of deviation size", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    worker.baselineBodyTemperature = 36.6;
    await worker.save();
    await packet(worker.userId, worker.helmetId, { raw: { bodyTemp: 39.9 } }); // large deviation

    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");
    const factor = res.body.factors.find((f) => f.sensor === "bodyTemperature");
    expect(factor.severity).toBe("INFO");
    expect(factor.attention).toBeUndefined();
    expect(res.body.guidance.some((g) => /bodyTemp/i.test(g.text))).toBe(false);
  });

  test("missing baseline -> factor omitted entirely, never fabricated", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" }); // no baselines set
    await packet(worker.userId, worker.helmetId, { raw: { heartRate: 100, bodyTemp: 38 } });

    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");
    expect(res.body.factors.find((f) => f.sensor === "heartRate")).toBeUndefined();
    expect(res.body.factors.find((f) => f.sensor === "bodyTemperature")).toBeUndefined();
  });
});

describe("ML risk state and environmental sensors are evaluated independently (#3/#15)", () => {
  test("ML=SAFE, noise=CRITICAL -> overall CRITICAL, noise factor and guidance present", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await state(worker.userId, { currentRiskState: "SAFE" });
    await packet(worker.userId, worker.helmetId, { raw: { noise: 90 } });

    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");
    expect(res.body.mlRiskState).toBe("SAFE");
    expect(res.body.operationalState).toBe("CRITICAL");
    expect(res.body.factors.some((f) => f.sensor === "noise" && f.severity === "CRITICAL")).toBe(true);
    expect(res.body.guidance.length).toBeGreaterThan(0);
  });

  test("ML=CRITICAL, all environmental sensors SAFE -> overall stays CRITICAL, guidance still generated (fallback)", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await state(worker.userId, { currentRiskState: "CRITICAL" });
    await packet(worker.userId, worker.helmetId); // all-SAFE defaults

    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");
    expect(res.body.mlRiskState).toBe("CRITICAL");
    expect(res.body.operationalState).toBe("CRITICAL");
    expect(res.body.factors.every((f) => f.severity !== "CRITICAL" && f.severity !== "WARNING")).toBe(true);
    expect(res.body.guidance.length).toBeGreaterThan(0);
  });

  test("ML=WARNING, environmental all safe, heart-rate deviation elevated -> guidance mentions checking the worker, deduped to one action", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    worker.baselineHeartRate = 70;
    await worker.save();
    await state(worker.userId, { currentRiskState: "WARNING" });
    await packet(worker.userId, worker.helmetId, { raw: { heartRate: 95 } }); // >20% deviation, env all safe

    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");
    expect(res.body.operationalState).toBe("WARNING");
    const checkActions = res.body.guidance.filter((g) => /check|assess|monitor/i.test(g.text));
    // The heart-rate-attention rule and the "unexplained WARNING" fallback
    // share one dedupeKey — must collapse into exactly one action, not two.
    expect(checkActions.length).toBe(1);
  });
});

describe("emergency overrides everything", () => {
  test("emergencyActive true -> operationalState EMERGENCY regardless of SAFE ML/sensors, only emergency guidance shown", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await state(worker.userId, { currentRiskState: "SAFE", emergencyActive: true });
    await packet(worker.userId, worker.helmetId); // all-safe readings

    const adminRes = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");
    expect(adminRes.body.operationalState).toBe("EMERGENCY");
    expect(adminRes.body.guidance.map((g) => g.text)).toEqual([
      "Locate and check on the worker immediately.",
      "Follow the site emergency procedure.",
      "Use the emergency-reset workflow only after the worker has been checked.",
    ]);

    const workerRes = await safetyGuidanceService.getSafetyGuidance(worker.userId, "WORKER");
    expect(workerRes.body.guidance.map((g) => g.text)).toEqual([
      "Follow the site emergency procedure.",
      "Seek immediate assistance.",
      "Remain in a safe location if possible.",
    ]);
  });
});

describe("ADMIN vs WORKER wording differs for the same non-emergency scenario", () => {
  test("noise CRITICAL: admin phrasing differs from worker phrasing", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await packet(worker.userId, worker.helmetId, { raw: { noise: 90 } });

    const adminRes = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");
    const workerRes = await safetyGuidanceService.getSafetyGuidance(worker.userId, "WORKER");

    expect(adminRes.body.guidance[0].text).not.toBe(workerRes.body.guidance[0].text);
    expect(adminRes.body.guidance[0].text).toMatch(/Advise the worker/);
    expect(workerRes.body.guidance[0].text).not.toMatch(/Advise the worker/);
  });
});

describe("offline helmet — stale data must be labeled, never presented as live", () => {
  test("helmet offline, last packet old -> readingsLabel 'Last known readings', communication factor + action", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await packet(worker.userId, worker.helmetId, { timestamp: minutesAgo(30) }); // beyond default 180s offline threshold

    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");
    expect(res.body.online).toBe(false);
    expect(res.body.readingsLabel).toBe("Last known readings");
    expect(res.body.factors.some((f) => f.sensor === "helmetCommunication")).toBe(true);
    expect(res.body.guidance.some((g) => /communication/i.test(g.text))).toBe(true);
  });

  test("helmet online, recent packet -> readingsLabel 'Current readings', no communication factor", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await packet(worker.userId, worker.helmetId, { timestamp: minutesAgo(1) });

    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");
    expect(res.body.online).toBe(true);
    expect(res.body.readingsLabel).toBe("Current readings");
    expect(res.body.factors.some((f) => f.sensor === "helmetCommunication")).toBe(false);
  });
});

describe("dedup keeps the higher-priority phrasing", () => {
  test("multiple simultaneous CRITICAL factors stay within the 1-4 factor cap and produce distinct actions", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    worker.baselineHeartRate = 70;
    worker.baselineBodyTemperature = 36.5;
    await worker.save();
    await packet(worker.userId, worker.helmetId, {
      raw: { noise: 90, gas: 350, ambientTemp: 40, uv: 10, heartRate: 100, bodyTemp: 39 },
    });

    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "ADMIN");
    expect(res.body.factors.length).toBeLessThanOrEqual(4);
    expect(res.body.operationalState).toBe("CRITICAL");
    // Four distinct CRITICAL environmental actions, each with its own text.
    const uniqueTexts = new Set(res.body.guidance.map((g) => g.text));
    expect(uniqueTexts.size).toBe(res.body.guidance.length);
    expect(res.body.guidance.length).toBeLessThanOrEqual(5);
  });
});

describe("SAFE state — minimal messaging, single default action", () => {
  test("everything nominal -> SAFE, no factors, one default action", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await state(worker.userId, { currentRiskState: "SAFE" });
    await packet(worker.userId, worker.helmetId);

    const res = await safetyGuidanceService.getSafetyGuidance(worker.userId, "WORKER");
    expect(res.body.operationalState).toBe("SAFE");
    expect(res.body.factors).toEqual([]);
    expect(res.body.guidance).toHaveLength(1);
    expect(res.body.guidance[0].text).toMatch(/within expected operating conditions/);
  });
});
