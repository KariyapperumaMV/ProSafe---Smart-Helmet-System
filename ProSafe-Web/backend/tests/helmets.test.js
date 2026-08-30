const request = require("supertest");
const app = require("../app");
const testDb = require("./testDb");
const { createUser, authHeader } = require("./factories");
const Helmet = require("../models/Helmet");
const HelmetData = require("../models/HelmetData");
const HelmetCommand = require("../models/HelmetCommand");
const WorkerProcessingState = require("../models/WorkerProcessingState");

beforeAll(testDb.connect);
afterEach(testDb.clearDatabase);
afterAll(testDb.closeDatabase);

describe("GET /api/helmets/assignable", () => {
  test("returns only unassigned active helmets", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-A" });
    await Helmet.create({ helmetId: "PS-H-B" });
    await createUser({ role: "WORKER", helmetId: "PS-H-B" });

    const res = await request(app).get("/api/helmets/assignable").set(authHeader(admin));

    expect(res.status).toBe(200);
    const ids = res.body.helmets.map((h) => h.helmetId);
    expect(ids).toContain("PS-H-A");
    expect(ids).not.toContain("PS-H-B");
  });

  test("currentHelmetId keeps the user's own helmet in the list even though it's assigned", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-C" });
    await createUser({ role: "WORKER", helmetId: "PS-H-C" });

    const res = await request(app)
      .get("/api/helmets/assignable")
      .query({ currentHelmetId: "PS-H-C" })
      .set(authHeader(admin));

    expect(res.body.helmets.map((h) => h.helmetId)).toContain("PS-H-C");
  });

  test("worker cannot access the helmets endpoint", async () => {
    const worker = await createUser({ role: "WORKER" });

    const res = await request(app).get("/api/helmets/assignable").set(authHeader(worker));

    expect(res.status).toBe(403);
  });

  test("a soft-deleted helmet never appears, even if otherwise unassigned", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-DELETED", active: false, deletedAt: new Date() });

    const res = await request(app).get("/api/helmets/assignable").set(authHeader(admin));

    expect(res.body.helmets.map((h) => h.helmetId)).not.toContain("PS-H-DELETED");
  });
});

describe("POST /api/helmets", () => {
  test("admin registers a new helmet", async () => {
    const admin = await createUser({ role: "ADMIN" });

    const res = await request(app).post("/api/helmets").set(authHeader(admin)).send({ helmetId: "PS-H-NEW" });

    expect(res.status).toBe(201);
    expect(res.body.helmet.helmetId).toBe("PS-H-NEW");
    expect(res.body.helmet.assigned).toBe(false);
  });

  test("rejects a duplicate helmetId", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-DUP" });

    const res = await request(app).post("/api/helmets").set(authHeader(admin)).send({ helmetId: "PS-H-DUP" });

    expect(res.status).toBe(409);
  });

  test("rejects a missing helmetId", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app).post("/api/helmets").set(authHeader(admin)).send({});
    expect(res.status).toBe(400);
  });

  test.each(["", "   ", "ab", "has spaces", "semi;colon", "a".repeat(41)])(
    "rejects an invalid helmetId %p",
    async (helmetId) => {
      const admin = await createUser({ role: "ADMIN" });
      const res = await request(app).post("/api/helmets").set(authHeader(admin)).send({ helmetId });
      expect(res.status).toBe(400);
    }
  );

  test("worker cannot create a helmet", async () => {
    const worker = await createUser({ role: "WORKER" });
    const res = await request(app).post("/api/helmets").set(authHeader(worker)).send({ helmetId: "PS-H-X" });
    expect(res.status).toBe(403);
  });

  test("unauthenticated request is rejected", async () => {
    const res = await request(app).post("/api/helmets").send({ helmetId: "PS-H-X" });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/helmets (list)", () => {
  test("unauthenticated -> 401, worker -> 403, admin -> 200", async () => {
    await Helmet.create({ helmetId: "PS-H-001" });
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });

    expect((await request(app).get("/api/helmets")).status).toBe(401);
    expect((await request(app).get("/api/helmets").set(authHeader(worker))).status).toBe(403);

    const res = await request(app).get("/api/helmets").set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.pagination).toBeDefined();
  });

  test("includes assignedTo (userId + name only) for assigned helmets", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-010" });
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-010", name: "Nirmani Silva" });

    const res = await request(app).get("/api/helmets").set(authHeader(admin));
    const row = res.body.helmets.find((h) => h.helmetId === "PS-H-010");

    expect(row.assigned).toBe(true);
    expect(row.assignedTo).toEqual({ userId: worker.userId, name: "Nirmani Silva" });
    // No private user fields ever leak into the helmet list.
    expect(JSON.stringify(row)).not.toMatch(/passwordHash|email|nic|phone/i);
  });

  test("unassigned helmet reports assigned:false, assignedTo:null", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-011" });

    const res = await request(app).get("/api/helmets").set(authHeader(admin));
    const row = res.body.helmets.find((h) => h.helmetId === "PS-H-011");

    expect(row.assigned).toBe(false);
    expect(row.assignedTo).toBeNull();
  });

  test("search matches by helmetId", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-SEARCH" });
    await Helmet.create({ helmetId: "PS-H-OTHER" });

    const res = await request(app).get("/api/helmets").query({ search: "SEARCH" }).set(authHeader(admin));
    const ids = res.body.helmets.map((h) => h.helmetId);
    expect(ids).toEqual(["PS-H-SEARCH"]);
  });

  test("search matches by assigned worker name", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-020" });
    await createUser({ role: "WORKER", helmetId: "PS-H-020", name: "Kasun Perera" });
    await Helmet.create({ helmetId: "PS-H-021" });

    const res = await request(app).get("/api/helmets").query({ search: "Kasun" }).set(authHeader(admin));
    expect(res.body.helmets.map((h) => h.helmetId)).toEqual(["PS-H-020"]);
  });

  test("assignment=assigned filters to assigned helmets only", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-030" });
    await Helmet.create({ helmetId: "PS-H-031" });
    await createUser({ role: "WORKER", helmetId: "PS-H-030" });

    const res = await request(app).get("/api/helmets").query({ assignment: "assigned" }).set(authHeader(admin));
    expect(res.body.helmets.map((h) => h.helmetId)).toEqual(["PS-H-030"]);
  });

  test("assignment=unassigned filters to unassigned helmets only", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-040" });
    await Helmet.create({ helmetId: "PS-H-041" });
    await createUser({ role: "WORKER", helmetId: "PS-H-040" });

    const res = await request(app).get("/api/helmets").query({ assignment: "unassigned" }).set(authHeader(admin));
    expect(res.body.helmets.map((h) => h.helmetId)).toEqual(["PS-H-041"]);
  });

  test("status filter narrows to ACTIVE or INACTIVE", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-050", status: "ACTIVE" });
    await Helmet.create({ helmetId: "PS-H-051", status: "INACTIVE" });

    const res = await request(app).get("/api/helmets").query({ status: "INACTIVE" }).set(authHeader(admin));
    expect(res.body.helmets.map((h) => h.helmetId)).toEqual(["PS-H-051"]);
  });

  test("pagination works", async () => {
    const admin = await createUser({ role: "ADMIN" });
    for (let i = 0; i < 15; i++) {
      await Helmet.create({ helmetId: `PS-H-PAGE-${String(i).padStart(2, "0")}` });
    }

    const page1 = await request(app).get("/api/helmets").query({ page: 1, limit: 10 }).set(authHeader(admin));
    expect(page1.body.helmets).toHaveLength(10);
    expect(page1.body.pagination).toMatchObject({ page: 1, limit: 10, total: 15, pages: 2 });

    const page2 = await request(app).get("/api/helmets").query({ page: 2, limit: 10 }).set(authHeader(admin));
    expect(page2.body.helmets).toHaveLength(5);
  });

  test("a soft-deleted helmet is excluded from the list", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-060", active: false, deletedAt: new Date() });

    const res = await request(app).get("/api/helmets").set(authHeader(admin));
    expect(res.body.helmets.map((h) => h.helmetId)).not.toContain("PS-H-060");
  });
});

describe("GET /api/helmets/:helmetId (details)", () => {
  test("unauthenticated -> 401, worker -> 403", async () => {
    await Helmet.create({ helmetId: "PS-H-070" });
    const worker = await createUser({ role: "WORKER" });

    expect((await request(app).get("/api/helmets/PS-H-070")).status).toBe(401);
    expect((await request(app).get("/api/helmets/PS-H-070").set(authHeader(worker))).status).toBe(403);
  });

  test("unknown helmet -> 404", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app).get("/api/helmets/PS-H-NOPE").set(authHeader(admin));
    expect(res.status).toBe(404);
  });

  test("unassigned helmet with no telemetry: assigned:false, online:null, workerSafety:null", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-080" });

    const res = await request(app).get("/api/helmets/PS-H-080").set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.assigned).toBe(false);
    expect(res.body.assignedTo).toBeNull();
    expect(res.body.online).toBeNull();
    expect(res.body.lastSeenAt).toBeNull();
    expect(res.body.workerSafety).toBeNull();
  });

  test("assigned helmet returns the assigned worker, risk state, and emergency status", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-090" });
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-090", name: "Nirmani Silva" });
    await WorkerProcessingState.create({ workerId: worker.userId, currentRiskState: "WARNING", emergencyActive: false });

    const res = await request(app).get("/api/helmets/PS-H-090").set(authHeader(admin));

    expect(res.body.assigned).toBe(true);
    expect(res.body.assignedTo).toEqual({ userId: worker.userId, name: "Nirmani Silva" });
    expect(res.body.workerSafety).toEqual({ currentRiskState: "WARNING", emergencyActive: false });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/i);
  });

  test("emergencyActive is reported even when currentRiskState is SAFE", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-091" });
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-091" });
    await WorkerProcessingState.create({ workerId: worker.userId, currentRiskState: "SAFE", emergencyActive: true });

    const res = await request(app).get("/api/helmets/PS-H-091").set(authHeader(admin));
    expect(res.body.workerSafety).toEqual({ currentRiskState: "SAFE", emergencyActive: true });
  });

  test("online: true when the latest packet is within the offline threshold", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-100" });
    await HelmetData.create({
      helmetId: "PS-H-100",
      workerId: "W-ANY",
      timestamp: new Date(Date.now() - 30 * 1000),
      raw: { heartRate: 80, bodyTemp: 37, ambientTemp: 30, noise: 70, gas: 100, uv: 3 },
    });

    const res = await request(app).get("/api/helmets/PS-H-100").set(authHeader(admin));
    expect(res.body.online).toBe(true);
    expect(res.body.lastSeenAt).toBeTruthy();
  });

  test("online: false when the latest packet is older than the offline threshold", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-101" });
    await HelmetData.create({
      helmetId: "PS-H-101",
      workerId: "W-ANY",
      timestamp: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago > 180s default
      raw: { heartRate: 80, bodyTemp: 37, ambientTemp: 30, noise: 70, gas: 100, uv: 3 },
    });

    const res = await request(app).get("/api/helmets/PS-H-101").set(authHeader(admin));
    expect(res.body.online).toBe(false);
  });

  test("latestCommand reflects the helmet's current HelmetCommand", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-110" });
    await HelmetCommand.create({ helmetId: "PS-H-110", command: "SET_RISK", risk: "CRITICAL" });

    const res = await request(app).get("/api/helmets/PS-H-110").set(authHeader(admin));
    expect(res.body.latestCommand).toEqual({ command: "SET_RISK", risk: "CRITICAL" });
  });

  test("a soft-deleted helmet returns 404, not stale details", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-120", active: false, deletedAt: new Date() });

    const res = await request(app).get("/api/helmets/PS-H-120").set(authHeader(admin));
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/helmets/:helmetId", () => {
  test("deleting an unassigned helmet succeeds (soft delete)", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-130" });

    const res = await request(app).delete("/api/helmets/PS-H-130").set(authHeader(admin));
    expect(res.status).toBe(200);

    const stored = await Helmet.findOne({ helmetId: "PS-H-130" });
    expect(stored.active).toBe(false);
    expect(stored.deletedAt).not.toBeNull();
  });

  test("deleting an assigned helmet is blocked with 409 and a useful message", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-140" });
    await createUser({ role: "WORKER", helmetId: "PS-H-140", name: "Nirmani Silva" });

    const res = await request(app).delete("/api/helmets/PS-H-140").set(authHeader(admin));

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/unassign/i);

    const stored = await Helmet.findOne({ helmetId: "PS-H-140" });
    expect(stored.active).toBe(true); // not deleted
  });

  test("deleting an unknown helmet -> 404", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app).delete("/api/helmets/PS-H-NOPE").set(authHeader(admin));
    expect(res.status).toBe(404);
  });

  test("worker cannot delete a helmet", async () => {
    const worker = await createUser({ role: "WORKER" });
    await Helmet.create({ helmetId: "PS-H-150" });
    const res = await request(app).delete("/api/helmets/PS-H-150").set(authHeader(worker));
    expect(res.status).toBe(403);
  });

  test("a deleted helmet disappears from both the list and the assignable endpoint", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-160" });

    await request(app).delete("/api/helmets/PS-H-160").set(authHeader(admin));

    const list = await request(app).get("/api/helmets").set(authHeader(admin));
    expect(list.body.helmets.map((h) => h.helmetId)).not.toContain("PS-H-160");

    const assignable = await request(app).get("/api/helmets/assignable").set(authHeader(admin));
    expect(assignable.body.helmets.map((h) => h.helmetId)).not.toContain("PS-H-160");
  });
});

describe("Integration — create, assign, view, unassign lifecycle (#33)", () => {
  test("create -> appears in /assignable -> assign -> disappears -> view shows worker -> unassign -> reappears", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER", name: "Nirmani Silva" });

    // 1. Create the helmet through the real API.
    const createRes = await request(app).post("/api/helmets").set(authHeader(admin)).send({ helmetId: "PS-H-LIFECYCLE" });
    expect(createRes.status).toBe(201);

    // 2. It appears in /assignable.
    const assignable1 = await request(app).get("/api/helmets/assignable").set(authHeader(admin));
    expect(assignable1.body.helmets.map((h) => h.helmetId)).toContain("PS-H-LIFECYCLE");

    // 3. Assign it to the worker through the real User module PUT endpoint.
    const assignRes = await request(app)
      .put(`/api/users/${worker.userId}`)
      .set(authHeader(admin))
      .send({ helmetId: "PS-H-LIFECYCLE" });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.user.helmetId).toBe("PS-H-LIFECYCLE");

    // 4. It disappears from /assignable.
    const assignable2 = await request(app).get("/api/helmets/assignable").set(authHeader(admin));
    expect(assignable2.body.helmets.map((h) => h.helmetId)).not.toContain("PS-H-LIFECYCLE");

    // 5. Helmet view shows the assigned worker.
    const detailsRes = await request(app).get("/api/helmets/PS-H-LIFECYCLE").set(authHeader(admin));
    expect(detailsRes.body.assigned).toBe(true);
    expect(detailsRes.body.assignedTo).toEqual({ userId: worker.userId, name: "Nirmani Silva" });

    // Also can't be deleted while assigned.
    const blockedDelete = await request(app).delete("/api/helmets/PS-H-LIFECYCLE").set(authHeader(admin));
    expect(blockedDelete.status).toBe(409);

    // 6. Unassign through the User module.
    const unassignRes = await request(app)
      .put(`/api/users/${worker.userId}`)
      .set(authHeader(admin))
      .send({ helmetId: "" });
    expect(unassignRes.status).toBe(200);
    expect(unassignRes.body.user.helmetId).toBeNull();

    // 7. Back in /assignable.
    const assignable3 = await request(app).get("/api/helmets/assignable").set(authHeader(admin));
    expect(assignable3.body.helmets.map((h) => h.helmetId)).toContain("PS-H-LIFECYCLE");

    // Now deletable.
    const finalDelete = await request(app).delete("/api/helmets/PS-H-LIFECYCLE").set(authHeader(admin));
    expect(finalDelete.status).toBe(200);
  });
});
