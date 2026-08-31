const request = require("supertest");

jest.mock("../services/weatherService", () => ({
  getWeather: jest.fn(),
}));

const app = require("../app");
const testDb = require("./testDb");
const { createUser, authHeader } = require("./factories");
const Helmet = require("../models/Helmet");
const HelmetData = require("../models/HelmetData");
const WorkerProcessingState = require("../models/WorkerProcessingState");
const Alert = require("../models/Alert");
const weatherService = require("../services/weatherService");

beforeAll(testDb.connect);
afterEach(() => {
  jest.clearAllMocks();
  weatherService.getWeather.mockResolvedValue({ available: true, temperature: 30 });
  return testDb.clearDatabase();
});
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
      heartRate: 80,
      bodyTemp: 37,
      ambientTemp: 30,
      noise: 70,
      gas: 100,
      uv: 3,
      ...overrides.raw,
    },
  });
}

describe("GET /api/dashboard/admin — RBAC", () => {
  test("unauthenticated -> 401", async () => {
    const res = await request(app).get("/api/dashboard/admin");
    expect(res.status).toBe(401);
  });

  test("worker -> 403", async () => {
    const worker = await createUser({ role: "WORKER" });
    const res = await request(app).get("/api/dashboard/admin").set(authHeader(worker));
    expect(res.status).toBe(403);
  });

  test("admin -> 200", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app).get("/api/dashboard/admin").set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(res.body.workerStatus).toBeDefined();
    expect(res.body.helmetStatus).toBeDefined();
  });
});

describe("GET /api/dashboard/admin — worker status counts", () => {
  test("totalWorkers only counts active WORKER users", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createUser({ role: "WORKER" });
    await createUser({ role: "WORKER" });
    await createUser({ role: "ADMIN" }); // must not be counted
    await createUser({ role: "WORKER", active: false }); // soft-deleted, must not be counted

    const res = await request(app).get("/api/dashboard/admin").set(authHeader(admin));
    expect(res.body.summary.totalWorkers).toBe(2);
    expect(res.body.workerStatus.total).toBe(2);
  });

  test("safe/warning/critical/emergency/unknown are correct and mutually exclusive", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const safeWorker = await createUser({ role: "WORKER" });
    const warningWorker = await createUser({ role: "WORKER" });
    const criticalWorker = await createUser({ role: "WORKER" });
    const emergencyWorker = await createUser({ role: "WORKER" });
    const unknownWorker = await createUser({ role: "WORKER" }); // no state doc at all

    await WorkerProcessingState.create({ workerId: safeWorker.userId, currentRiskState: "SAFE", emergencyActive: false });
    await WorkerProcessingState.create({ workerId: warningWorker.userId, currentRiskState: "WARNING", emergencyActive: false });
    await WorkerProcessingState.create({ workerId: criticalWorker.userId, currentRiskState: "CRITICAL", emergencyActive: false });
    // Emergency worker has a CRITICAL risk state on record too — emergency
    // must win, never double-counted under CRITICAL as well (#7).
    await WorkerProcessingState.create({ workerId: emergencyWorker.userId, currentRiskState: "CRITICAL", emergencyActive: true });

    const res = await request(app).get("/api/dashboard/admin").set(authHeader(admin));
    const { workerStatus } = res.body;

    expect(workerStatus).toMatchObject({ total: 5, safe: 1, warning: 1, critical: 1, emergency: 1, unknown: 1 });
    expect(workerStatus.safe + workerStatus.warning + workerStatus.critical + workerStatus.emergency + workerStatus.unknown).toBe(
      workerStatus.total
    );
    expect(res.body.summary.safeWorkers).toBe(1);

    void unknownWorker;
  });

  test("a worker with a processing state but no assigned helmet is still counted", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER", helmetId: null });
    await WorkerProcessingState.create({ workerId: worker.userId, currentRiskState: "SAFE", emergencyActive: false });

    const res = await request(app).get("/api/dashboard/admin").set(authHeader(admin));
    expect(res.body.workerStatus.safe).toBe(1);
  });
});

describe("GET /api/dashboard/admin — helmet status summary", () => {
  test("registered/online/offline/assigned/unassigned match Helmet Management's own logic", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-ONLINE" });
    await Helmet.create({ helmetId: "PS-H-OFFLINE" });
    await Helmet.create({ helmetId: "PS-H-UNASSIGNED" });
    await Helmet.create({ helmetId: "PS-H-DELETED", active: false, deletedAt: new Date() });

    await createUser({ role: "WORKER", helmetId: "PS-H-ONLINE" });
    await createUser({ role: "WORKER", helmetId: "PS-H-OFFLINE" });

    await packet("W-ANY-1", "PS-H-ONLINE", { timestamp: minutesAgo(1) });
    await packet("W-ANY-2", "PS-H-OFFLINE", { timestamp: minutesAgo(30) }); // > 180s threshold

    const res = await request(app).get("/api/dashboard/admin").set(authHeader(admin));
    const { helmetStatus } = res.body;

    expect(helmetStatus.registered).toBe(3); // soft-deleted excluded
    expect(helmetStatus.online).toBe(1);
    expect(helmetStatus.offline).toBe(2);
    expect(helmetStatus.assigned).toBe(2);
    expect(helmetStatus.unassigned).toBe(1);
    expect(helmetStatus.onlinePercent).toBe(33);
  });

  test("zero registered helmets is handled safely (no division by zero)", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app).get("/api/dashboard/admin").set(authHeader(admin));
    expect(res.body.helmetStatus).toEqual({ registered: 0, online: 0, offline: 0, assigned: 0, unassigned: 0, onlinePercent: null });
  });
});

describe("GET /api/dashboard/admin — alertsToday timezone boundary", () => {
  test("an alert just before UTC midnight but after Colombo midnight counts as today", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });

    // 19:00 UTC today -> 00:30 the *next* Colombo day (+05:30) — same
    // deliberate cross-midnight construction already used in the
    // sensor-history tests.
    const t = new Date();
    t.setUTCHours(19, 0, 0, 0);
    const colomboDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(t);
    const todayColombo = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date());

    await Alert.create({
      type: "TRANSITION",
      workerId: worker.userId,
      helmetId: "PS-H-X",
      timestamp: t,
      previousRiskState: "SAFE",
      currentRiskState: "WARNING",
    });

    const res = await request(app).get("/api/dashboard/admin").set(authHeader(admin));

    if (colomboDateStr === todayColombo) {
      expect(res.body.summary.alertsToday).toBe(1);
    } else {
      // Test run happened to straddle the boundary the other way — still a
      // meaningful assertion: it must NOT be counted as today.
      expect(res.body.summary.alertsToday).toBe(0);
    }
  });
});

describe("GET /api/dashboard/admin — recent alerts", () => {
  test("sorted newest first, includes acknowledged/resolved and a factual label", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER", name: "Nirmani Silva" });

    await Alert.create({
      type: "TRANSITION", workerId: worker.userId, helmetId: "PS-H-1", timestamp: minutesAgo(10),
      previousRiskState: "SAFE", currentRiskState: "WARNING",
    });
    await Alert.create({
      type: "EMERGENCY", workerId: worker.userId, helmetId: "PS-H-1", timestamp: minutesAgo(2),
      acknowledged: true, resolved: true,
    });

    const res = await request(app).get("/api/dashboard/admin").set(authHeader(admin));
    const alerts = res.body.recentAlerts;

    expect(alerts).toHaveLength(2);
    expect(alerts[0].type).toBe("EMERGENCY");
    expect(alerts[0].label).toBe("Emergency button pressed");
    expect(alerts[0].acknowledged).toBe(true);
    expect(alerts[0].resolved).toBe(true);
    expect(alerts[0].workerName).toBe("Nirmani Silva");
    expect(alerts[1].label).toBe("Risk changed: SAFE → WARNING");
    expect(new Date(alerts[0].timestamp).getTime()).toBeGreaterThan(new Date(alerts[1].timestamp).getTime());
  });

  test("an orphaned alert (workerId with no matching User at all) still appears, using the raw workerId", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Alert.create({
      type: "TRANSITION", workerId: "W-GHOST", helmetId: "PS-H-1", timestamp: minutesAgo(5),
      previousRiskState: "SAFE", currentRiskState: "CRITICAL",
    });

    const res = await request(app).get("/api/dashboard/admin").set(authHeader(admin));
    const alert = res.body.recentAlerts.find((a) => a.workerId === "W-GHOST");
    expect(alert).toBeDefined();
    expect(alert.workerName).toBe("W-GHOST");
  });

  test("no passwordHash or other private user fields ever leak via recentAlerts", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });
    await Alert.create({
      type: "TRANSITION", workerId: worker.userId, helmetId: "PS-H-1", timestamp: minutesAgo(1),
      previousRiskState: "SAFE", currentRiskState: "WARNING",
    });

    const res = await request(app).get("/api/dashboard/admin").set(authHeader(admin));
    expect(JSON.stringify(res.body.recentAlerts)).not.toMatch(/passwordHash|email|nic|phone/i);
  });
});

describe("GET /api/dashboard/admin — worker location summary", () => {
  test("only recent valid GPS counts as currently reporting", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const recentWorker = await createUser({ role: "WORKER" });
    const staleWorker = await createUser({ role: "WORKER" });
    const noGpsWorker = await createUser({ role: "WORKER" });

    await packet(recentWorker.userId, "PS-H-1", { timestamp: minutesAgo(1), raw: { gps: { lat: 6.9, lon: 79.8 } } });
    // 3 days old — must NOT count as currently reporting (#15).
    await packet(staleWorker.userId, "PS-H-2", {
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      raw: { gps: { lat: 6.9, lon: 79.8 } },
    });
    await packet(noGpsWorker.userId, "PS-H-3", { timestamp: minutesAgo(1) }); // no gps field

    const res = await request(app).get("/api/dashboard/admin").set(authHeader(admin));
    expect(res.body.locations).toEqual({ reportingCount: 1, totalWorkers: 3 });
  });
});

describe("GET /api/dashboard/admin — weather resilience", () => {
  test("dashboard still returns 200 with real internal data when weather fails", async () => {
    weatherService.getWeather.mockResolvedValue({ available: false });
    const admin = await createUser({ role: "ADMIN" });
    await createUser({ role: "WORKER" });

    const res = await request(app).get("/api/dashboard/admin").set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.weather).toEqual({ available: false });
    expect(res.body.summary.totalWorkers).toBe(1);
  });
});

describe("GET /api/dashboard/worker", () => {
  test("unauthenticated -> 401, admin -> 403", async () => {
    const admin = await createUser({ role: "ADMIN" });
    expect((await request(app).get("/api/dashboard/worker")).status).toBe(401);
    expect((await request(app).get("/api/dashboard/worker").set(authHeader(admin))).status).toBe(403);
  });

  test("worker sees their own dashboard, identity taken only from the token", async () => {
    const worker = await createUser({ role: "WORKER", name: "Nirmani Silva" });
    const res = await request(app).get("/api/dashboard/worker").set(authHeader(worker));

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ userId: worker.userId, name: "Nirmani Silva" });
  });

  test("worker without a helmet: helmet is null, not fabricated", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: null });
    const res = await request(app).get("/api/dashboard/worker").set(authHeader(worker));
    expect(res.body.helmet).toBeNull();
    expect(res.body.latestSensors).toBeNull();
  });

  test("worker without a processing state -> operationalState UNKNOWN, not SAFE", async () => {
    const worker = await createUser({ role: "WORKER" });
    const res = await request(app).get("/api/dashboard/worker").set(authHeader(worker));
    expect(res.body.status).toEqual({ operationalState: "UNKNOWN", currentRiskState: null, emergencyActive: false });
  });

  test("worker in emergency -> operationalState EMERGENCY even if currentRiskState is SAFE", async () => {
    const worker = await createUser({ role: "WORKER" });
    await WorkerProcessingState.create({ workerId: worker.userId, currentRiskState: "SAFE", emergencyActive: true });

    const res = await request(app).get("/api/dashboard/worker").set(authHeader(worker));
    expect(res.body.status.operationalState).toBe("EMERGENCY");
    expect(res.body.status.currentRiskState).toBe("SAFE");
  });

  test("worker sees only their own alerts, never another worker's", async () => {
    const worker = await createUser({ role: "WORKER" });
    const other = await createUser({ role: "WORKER" });

    await Alert.create({
      type: "TRANSITION", workerId: worker.userId, helmetId: "PS-H-1", timestamp: minutesAgo(5),
      previousRiskState: "SAFE", currentRiskState: "WARNING",
    });
    await Alert.create({
      type: "TRANSITION", workerId: other.userId, helmetId: "PS-H-2", timestamp: minutesAgo(1),
      previousRiskState: "SAFE", currentRiskState: "CRITICAL",
    });

    const res = await request(app).get("/api/dashboard/worker").set(authHeader(worker));
    expect(res.body.recentAlerts).toHaveLength(1);
    expect(res.body.recentAlerts[0].workerId).toBe(worker.userId);
  });

  test("assigned helmet's online status and latest sensors are reported", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-1" });
    await Helmet.create({ helmetId: "PS-H-1" });
    await packet(worker.userId, "PS-H-1", { timestamp: minutesAgo(1), raw: { heartRate: 95 } });

    const res = await request(app).get("/api/dashboard/worker").set(authHeader(worker));
    expect(res.body.helmet).toMatchObject({ helmetId: "PS-H-1", online: true });
    expect(res.body.latestSensors.heartRate).toBe(95);
  });

  test("weather failure does not break the worker dashboard either", async () => {
    weatherService.getWeather.mockResolvedValue({ available: false });
    const worker = await createUser({ role: "WORKER" });
    const res = await request(app).get("/api/dashboard/worker").set(authHeader(worker));
    expect(res.status).toBe(200);
    expect(res.body.weather).toEqual({ available: false });
  });
});
