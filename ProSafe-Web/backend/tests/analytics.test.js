const request = require("supertest");
const app = require("../app");
const testDb = require("./testDb");
const { createUser, authHeader } = require("./factories");
const Alert = require("../models/Alert");

beforeAll(testDb.connect);
afterEach(testDb.clearDatabase);
afterAll(testDb.closeDatabase);

describe("GET /api/analytics — RBAC", () => {
  test("unauthenticated -> 401", async () => {
    const res = await request(app).get("/api/analytics").query({ period: "weekly", date: "2026-08-31" });
    expect(res.status).toBe(401);
  });

  test("WORKER -> 403", async () => {
    const worker = await createUser({ role: "WORKER" });
    const res = await request(app)
      .get("/api/analytics")
      .query({ period: "weekly", date: "2026-08-31" })
      .set(authHeader(worker));
    expect(res.status).toBe(403);
  });

  test("ADMIN -> 200", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app)
      .get("/api/analytics")
      .query({ period: "weekly", date: "2026-08-31" })
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.period.type).toBe("weekly");
  });
});

describe("GET /api/analytics — validation", () => {
  test("missing period -> 400", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app).get("/api/analytics").query({ date: "2026-08-31" }).set(authHeader(admin));
    expect(res.status).toBe(400);
  });

  test("invalid period -> 400", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app)
      .get("/api/analytics")
      .query({ period: "yearly", date: "2026-08-31" })
      .set(authHeader(admin));
    expect(res.status).toBe(400);
  });

  test("malformed explicit date -> 400, never silently falls back to today", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app)
      .get("/api/analytics")
      .query({ period: "daily", date: "31-08-2026" })
      .set(authHeader(admin));
    expect(res.status).toBe(400);
  });

  test("an impossible calendar date -> 400", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app)
      .get("/api/analytics")
      .query({ period: "monthly", date: "2026-02-30" })
      .set(authHeader(admin));
    expect(res.status).toBe(400);
  });

  test("omitted date defaults to today, not a 400", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app).get("/api/analytics").query({ period: "daily" }).set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.period.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("GET /api/analytics — empty period", () => {
  test("a period with genuinely no data still returns 200 with zero-filled/empty structures, never 404", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app)
      .get("/api/analytics")
      .query({ period: "monthly", date: "2020-01-15" }) // far in the past, guaranteed empty
      .set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.summary.totalAlerts).toBe(0);
    expect(res.body.alertDistribution).toEqual({ warning: 0, critical: 0, emergency: 0 });
    expect(res.body.workersRequiringAttention).toEqual([]);
    expect(res.body.insights).toEqual([]);
    expect(res.body.alertResponse.avgAcknowledgementMinutes).toBeNull();
    expect(res.body.riskTrend.length).toBeGreaterThan(0); // still zero-filled, not empty
  });
});

describe("GET /api/analytics — fresh bypasses the cache", () => {
  test("fresh=true reflects a change made after the first (cached) request", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const date = "2021-06-15"; // isolated, guaranteed-unique period for this test

    const first = await request(app).get("/api/analytics").query({ period: "daily", date }).set(authHeader(admin));
    expect(first.body.summary.totalAlerts).toBe(0);

    await Alert.create({
      type: "TRANSITION", workerId: "W-FRESH", helmetId: "PS-FRESH",
      timestamp: new Date(`${date}T10:00:00.000Z`), previousRiskState: "SAFE", currentRiskState: "WARNING",
    });

    const cached = await request(app).get("/api/analytics").query({ period: "daily", date }).set(authHeader(admin));
    expect(cached.body.summary.totalAlerts).toBe(0); // still cached

    const fresh = await request(app)
      .get("/api/analytics")
      .query({ period: "daily", date, fresh: "true" })
      .set(authHeader(admin));
    expect(fresh.body.summary.totalAlerts).toBe(1);
  });
});
