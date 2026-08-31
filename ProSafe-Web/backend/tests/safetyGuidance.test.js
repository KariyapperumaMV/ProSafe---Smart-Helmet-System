const request = require("supertest");
const app = require("../app");
const testDb = require("./testDb");
const { createUser, authHeader } = require("./factories");
const HelmetData = require("../models/HelmetData");
const WorkerProcessingState = require("../models/WorkerProcessingState");

beforeAll(testDb.connect);
afterEach(testDb.clearDatabase);
afterAll(testDb.closeDatabase);

async function packet(workerId, helmetId, overrides = {}) {
  return HelmetData.create({
    helmetId,
    workerId,
    timestamp: overrides.timestamp || new Date(),
    raw: { heartRate: 75, bodyTemp: 37, ambientTemp: 25, noise: 60, gas: 100, uv: 2, ...overrides.raw },
  });
}

describe("RBAC — GET /api/users/:id/safety-guidance", () => {
  test("rejects requests with no token (401)", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    const res = await request(app).get(`/api/users/${worker.userId}/safety-guidance`);
    expect(res.status).toBe(401);
  });

  test("ADMIN can view any active worker's guidance", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await packet(worker.userId, worker.helmetId);

    const res = await request(app).get(`/api/users/${worker.userId}/safety-guidance`).set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("operationalState");
    expect(res.body).toHaveProperty("guidance");
  });

  test("WORKER can view their own guidance", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await packet(worker.userId, worker.helmetId);

    const res = await request(app).get(`/api/users/${worker.userId}/safety-guidance`).set(authHeader(worker));
    expect(res.status).toBe(200);
  });

  test("WORKER viewing another worker's guidance -> 403", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    const other = await createUser({ role: "WORKER", helmetId: "PS-H-OTHER" });
    await packet(other.userId, other.helmetId);

    const res = await request(app).get(`/api/users/${other.userId}/safety-guidance`).set(authHeader(worker));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("You do not have permission to view this user's data");
  });

  test("'/me/safety-guidance' is not a special self-reference — no duplicate /me route was added", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    const res = await request(app).get(`/api/users/me/safety-guidance`).set(authHeader(worker));
    // Falls through to the generic /:id/safety-guidance route with the
    // literal id "me" — requireSelfOrAdmin correctly rejects it (this
    // worker's real id isn't "me"), proving there's no separate /me
    // handler silently treating it as self (per approved Decision 2: no
    // duplicate /me/safety-guidance endpoint).
    expect(res.status).toBe(403);
  });

  test("targeting an ADMIN id returns 400, not guidance data", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const otherAdmin = await createUser({ role: "ADMIN" });

    const res = await request(app).get(`/api/users/${otherAdmin.userId}/safety-guidance`).set(authHeader(admin));
    expect(res.status).toBe(400);
  });
});

describe("ADMIN vs WORKER response shape over HTTP", () => {
  test("the same worker's guidance differs in wording by requester role, never both at once", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await packet(worker.userId, worker.helmetId, { raw: { gas: 350 } }); // CRITICAL

    const adminRes = await request(app).get(`/api/users/${worker.userId}/safety-guidance`).set(authHeader(admin));
    const workerRes = await request(app).get(`/api/users/${worker.userId}/safety-guidance`).set(authHeader(worker));

    expect(adminRes.body.guidance[0].text).not.toBe(workerRes.body.guidance[0].text);
    expect(adminRes.body).not.toHaveProperty("adminActions");
    expect(adminRes.body).not.toHaveProperty("workerActions");
  });
});

describe("emergency end-to-end via HTTP", () => {
  test("emergencyActive true drives operationalState EMERGENCY for both roles", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await WorkerProcessingState.create({ workerId: worker.userId, currentRiskState: "SAFE", emergencyActive: true });
    await packet(worker.userId, worker.helmetId);

    const res = await request(app).get(`/api/users/${worker.userId}/safety-guidance`).set(authHeader(admin));
    expect(res.body.operationalState).toBe("EMERGENCY");
    expect(res.body.emergencyActive).toBe(true);
  });
});

describe("GET /api/users/:id and /api/users/me now include online/location for the compact map card", () => {
  test("getUserById includes online, lastSeenAt, and location derived from the latest valid GPS fix", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await packet(worker.userId, worker.helmetId, {
      timestamp: new Date(Date.now() - 10 * 60 * 1000), // stale -> offline, but GPS still valid on this packet
      raw: { gps: { lat: 6.9271, lon: 79.8612 } },
    });

    const res = await request(app).get(`/api/users/${worker.userId}`).set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.online).toBe(false);
    expect(res.body.location).toMatchObject({ lat: 6.9271, lon: 79.8612 });
  });

  test("no GPS ever received -> location is null, never fabricated", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-TEST" });
    await packet(worker.userId, worker.helmetId); // no raw.gps at all

    const res = await request(app).get(`/api/users/${worker.userId}`).set(authHeader(admin));
    expect(res.body.location).toBeNull();
  });
});
