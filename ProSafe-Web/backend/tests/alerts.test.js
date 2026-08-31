const request = require("supertest");

jest.mock("../services/weatherService", () => ({ getWeather: jest.fn().mockResolvedValue({ available: false }) }));

const app = require("../app");
const testDb = require("./testDb");
const { createUser, authHeader } = require("./factories");
const Alert = require("../models/Alert");
const WorkerProcessingState = require("../models/WorkerProcessingState");

beforeAll(testDb.connect);
afterEach(testDb.clearDatabase);
afterAll(testDb.closeDatabase);

function minutesAgo(n) {
  return new Date(Date.now() - n * 60 * 1000);
}

async function makeAlert(overrides = {}) {
  return Alert.create({
    type: "TRANSITION",
    workerId: "W-DEFAULT",
    helmetId: "PS-H-1",
    timestamp: minutesAgo(5),
    previousRiskState: "SAFE",
    currentRiskState: "WARNING",
    ...overrides,
  });
}

describe("GET /api/alerts — RBAC and self-scoping", () => {
  test("unauthenticated -> 401", async () => {
    const res = await request(app).get("/api/alerts");
    expect(res.status).toBe(401);
  });

  test("admin sees organization-wide alerts", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });
    const other = await createUser({ role: "WORKER" });
    await makeAlert({ workerId: worker.userId });
    await makeAlert({ workerId: other.userId });

    const res = await request(app).get("/api/alerts").set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(2);
  });

  test("worker is forcibly scoped to their own alerts, ignoring any workerId query param", async () => {
    const worker = await createUser({ role: "WORKER" });
    const other = await createUser({ role: "WORKER" });
    await makeAlert({ workerId: worker.userId });
    await makeAlert({ workerId: other.userId });

    const res = await request(app).get("/api/alerts").query({ workerId: other.userId }).set(authHeader(worker));
    expect(res.body.alerts).toHaveLength(1);
    expect(res.body.alerts[0].workerId).toBe(worker.userId);
  });
});

describe("GET /api/alerts — filtering", () => {
  test("type=EMERGENCY", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await makeAlert({ type: "EMERGENCY", previousRiskState: null, currentRiskState: null });
    await makeAlert({ type: "TRANSITION" });

    const res = await request(app).get("/api/alerts").query({ type: "EMERGENCY" }).set(authHeader(admin));
    expect(res.body.alerts).toHaveLength(1);
    expect(res.body.alerts[0].type).toBe("EMERGENCY");
  });

  test("risk=WARNING and risk=CRITICAL", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await makeAlert({ currentRiskState: "WARNING" });
    await makeAlert({ currentRiskState: "CRITICAL" });

    const warningRes = await request(app).get("/api/alerts").query({ risk: "WARNING" }).set(authHeader(admin));
    expect(warningRes.body.alerts).toHaveLength(1);
    expect(warningRes.body.alerts[0].currentRiskState).toBe("WARNING");

    const criticalRes = await request(app).get("/api/alerts").query({ risk: "CRITICAL" }).set(authHeader(admin));
    expect(criticalRes.body.alerts).toHaveLength(1);
  });

  test("acknowledged=false (Unread)", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await makeAlert({ acknowledged: true });
    await makeAlert({ acknowledged: false });

    const res = await request(app).get("/api/alerts").query({ acknowledged: "false" }).set(authHeader(admin));
    expect(res.body.alerts).toHaveLength(1);
    expect(res.body.alerts[0].acknowledged).toBe(false);
  });

  test("resolved=true / resolved=false", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await makeAlert({ resolved: true });
    await makeAlert({ resolved: false });

    const resolvedRes = await request(app).get("/api/alerts").query({ resolved: "true" }).set(authHeader(admin));
    expect(resolvedRes.body.alerts).toHaveLength(1);
    expect(resolvedRes.body.alerts[0].resolved).toBe(true);

    const unresolvedRes = await request(app).get("/api/alerts").query({ resolved: "false" }).set(authHeader(admin));
    expect(unresolvedRes.body.alerts).toHaveLength(1);
  });

  test("combined filters (type + acknowledged)", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await makeAlert({ type: "EMERGENCY", previousRiskState: null, currentRiskState: null, acknowledged: false });
    await makeAlert({ type: "EMERGENCY", previousRiskState: null, currentRiskState: null, acknowledged: true });
    await makeAlert({ type: "TRANSITION", acknowledged: false });

    const res = await request(app)
      .get("/api/alerts")
      .query({ type: "EMERGENCY", acknowledged: "false" })
      .set(authHeader(admin));
    expect(res.body.alerts).toHaveLength(1);
    expect(res.body.alerts[0].type).toBe("EMERGENCY");
    expect(res.body.alerts[0].acknowledged).toBe(false);
  });

  test("days=7 bounds the query; omitting days returns full history", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await makeAlert({ timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) });
    await makeAlert({ timestamp: minutesAgo(5) });

    const bounded = await request(app).get("/api/alerts").query({ days: 7 }).set(authHeader(admin));
    expect(bounded.body.alerts).toHaveLength(1);

    const full = await request(app).get("/api/alerts").set(authHeader(admin));
    expect(full.body.alerts).toHaveLength(2);
  });

  test("pagination works", async () => {
    const admin = await createUser({ role: "ADMIN" });
    for (let i = 0; i < 15; i++) {
      await makeAlert({ timestamp: minutesAgo(i) });
    }

    const res = await request(app).get("/api/alerts").query({ page: 1, limit: 10 }).set(authHeader(admin));
    expect(res.body.alerts).toHaveLength(10);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 10, total: 15, pages: 2 });
  });
});

describe("PATCH /api/alerts/:alertId/acknowledge", () => {
  test("unauthenticated -> 401, worker -> 403", async () => {
    const worker = await createUser({ role: "WORKER" });
    const alert = await makeAlert({ workerId: worker.userId });

    expect((await request(app).patch(`/api/alerts/${alert._id}/acknowledge`)).status).toBe(401);
    expect((await request(app).patch(`/api/alerts/${alert._id}/acknowledge`).set(authHeader(worker))).status).toBe(403);
  });

  test("admin acknowledges an alert; acknowledgedAt/By are set", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const alert = await makeAlert();

    const res = await request(app).patch(`/api/alerts/${alert._id}/acknowledge`).set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.alert.acknowledged).toBe(true);
    expect(res.body.alert.acknowledgedBy).toBe(admin.userId);
    expect(res.body.alert.acknowledgedAt).toBeTruthy();
  });

  test("is idempotent — first acknowledgement wins, a second call does not replace acknowledgedAt/By", async () => {
    const admin1 = await createUser({ role: "ADMIN" });
    const admin2 = await createUser({ role: "ADMIN" });
    const alert = await makeAlert();

    const first = await request(app).patch(`/api/alerts/${alert._id}/acknowledge`).set(authHeader(admin1));
    const firstAckAt = first.body.alert.acknowledgedAt;

    await new Promise((resolve) => setTimeout(resolve, 10));

    const second = await request(app).patch(`/api/alerts/${alert._id}/acknowledge`).set(authHeader(admin2));

    expect(second.status).toBe(200);
    expect(second.body.alert.acknowledgedBy).toBe(admin1.userId); // still the FIRST admin
    expect(second.body.alert.acknowledgedAt).toBe(firstAckAt); // unchanged
  });

  test("unknown alert id -> 404", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app)
      .patch("/api/alerts/6a0000000000000000000000/acknowledge")
      .set(authHeader(admin));
    expect(res.status).toBe(404);
  });

  test("malformed alert id -> 404, not a 500", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app).patch("/api/alerts/not-a-valid-id/acknowledge").set(authHeader(admin));
    expect(res.status).toBe(404);
  });
});

describe("Alert retention — no physical deletion (#4/#33)", () => {
  test("an alert older than 7 days remains in the database and is retrievable via GET /api/alerts", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const oldAlert = await makeAlert({ timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) });

    const stillThere = await Alert.findById(oldAlert._id);
    expect(stillThere).not.toBeNull();

    const res = await request(app).get("/api/alerts").set(authHeader(admin));
    expect(res.body.alerts.map((a) => a.id)).toContain(String(oldAlert._id));
  });
});

describe("Alert.resetRequested — emergency interim state", () => {
  test("an unresolved EMERGENCY alert reflects WorkerProcessingState.resetRequested", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });
    const alert = await makeAlert({
      type: "EMERGENCY",
      workerId: worker.userId,
      previousRiskState: null,
      currentRiskState: null,
      resolved: false,
    });
    await WorkerProcessingState.create({ workerId: worker.userId, emergencyActive: true, resetRequested: true });

    const res = await request(app).get("/api/alerts").set(authHeader(admin));
    const found = res.body.alerts.find((a) => a.id === String(alert._id));
    expect(found.resetRequested).toBe(true);
  });

  test("a resolved EMERGENCY alert never reports resetRequested, even if the flag is stale-true", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });
    const alert = await makeAlert({
      type: "EMERGENCY",
      workerId: worker.userId,
      previousRiskState: null,
      currentRiskState: null,
      resolved: true,
    });
    await WorkerProcessingState.create({ workerId: worker.userId, resetRequested: true });

    const res = await request(app).get("/api/alerts").set(authHeader(admin));
    const found = res.body.alerts.find((a) => a.id === String(alert._id));
    expect(found.resetRequested).toBe(false);
  });

  test("a TRANSITION alert always reports resetRequested: false", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await makeAlert({ type: "TRANSITION" });

    const res = await request(app).get("/api/alerts").set(authHeader(admin));
    expect(res.body.alerts.every((a) => a.resetRequested === false)).toBe(true);
  });
});

describe("Alert.resolvedAt — emergency resolution timestamp (Analytics #1/#39)", () => {
  function isoNow() {
    return new Date().toISOString();
  }

  test("activating an emergency and requesting a reset never sets resolvedAt", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createUser({ role: "WORKER", helmetId: "PS-H-RESOLVEDAT-1" });

    await request(app)
      .post("/api/helmet/emergency")
      .send({ helmetId: "PS-H-RESOLVEDAT-1", timestamp: isoNow(), emergency: true });
    await request(app).post("/api/helmet/PS-H-RESOLVEDAT-1/emergency/reset").set(authHeader(admin));

    const alert = await Alert.findOne({ helmetId: "PS-H-RESOLVEDAT-1", type: "EMERGENCY" });
    expect(alert.resolved).toBe(false);
    expect(alert.resolvedAt).toBeNull();
  });

  test("the helmet's ACK sets resolved=true and populates resolvedAt", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createUser({ role: "WORKER", helmetId: "PS-H-RESOLVEDAT-2" });

    await request(app)
      .post("/api/helmet/emergency")
      .send({ helmetId: "PS-H-RESOLVEDAT-2", timestamp: isoNow(), emergency: true });
    await request(app).post("/api/helmet/PS-H-RESOLVEDAT-2/emergency/reset").set(authHeader(admin));
    const before = new Date();
    await request(app).post("/api/helmet/PS-H-RESOLVEDAT-2/emergency/reset/ack");

    const alert = await Alert.findOne({ helmetId: "PS-H-RESOLVEDAT-2", type: "EMERGENCY" });
    expect(alert.resolved).toBe(true);
    expect(alert.resolvedAt).not.toBeNull();
    expect(alert.resolvedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
  });

  test("a duplicate/stale ACK never rewrites the historical resolvedAt", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createUser({ role: "WORKER", helmetId: "PS-H-RESOLVEDAT-3" });

    await request(app)
      .post("/api/helmet/emergency")
      .send({ helmetId: "PS-H-RESOLVEDAT-3", timestamp: isoNow(), emergency: true });
    await request(app).post("/api/helmet/PS-H-RESOLVEDAT-3/emergency/reset").set(authHeader(admin));
    await request(app).post("/api/helmet/PS-H-RESOLVEDAT-3/emergency/reset/ack");

    const firstResolvedAt = (await Alert.findOne({ helmetId: "PS-H-RESOLVEDAT-3", type: "EMERGENCY" })).resolvedAt;

    await new Promise((resolve) => setTimeout(resolve, 10));
    await request(app).post("/api/helmet/PS-H-RESOLVEDAT-3/emergency/reset/ack"); // stale retry

    const secondResolvedAt = (await Alert.findOne({ helmetId: "PS-H-RESOLVEDAT-3", type: "EMERGENCY" })).resolvedAt;
    expect(secondResolvedAt.getTime()).toBe(firstResolvedAt.getTime());
  });

  test("a historical alert with resolved=true and resolvedAt=null (pre-existing data) remains valid", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const legacy = await makeAlert({ type: "EMERGENCY", previousRiskState: null, currentRiskState: null, resolved: true });
    expect(legacy.resolvedAt).toBeNull();

    const res = await request(app).get("/api/alerts").set(authHeader(admin));
    const found = res.body.alerts.find((a) => a.id === String(legacy._id));
    expect(found.resolved).toBe(true);
    expect(found.resolvedAt).toBeNull();
  });
});

describe("Orphaned historical alerts (#30)", () => {
  test("an alert whose User has since been removed is not deleted and still uses the workerId fallback", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const orphan = await makeAlert({ workerId: "W-LONG-GONE" });

    const res = await request(app).get("/api/alerts").set(authHeader(admin));
    const found = res.body.alerts.find((a) => a.id === String(orphan._id));
    expect(found.workerName).toBe("W-LONG-GONE");
  });
});
