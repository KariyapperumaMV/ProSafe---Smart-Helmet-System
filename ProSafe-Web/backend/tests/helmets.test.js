const request = require("supertest");
const app = require("../app");
const testDb = require("./testDb");
const { createUser, authHeader } = require("./factories");
const Helmet = require("../models/Helmet");

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
});

describe("POST /api/helmets", () => {
  test("admin registers a new helmet", async () => {
    const admin = await createUser({ role: "ADMIN" });

    const res = await request(app).post("/api/helmets").set(authHeader(admin)).send({ helmetId: "PS-H-NEW" });

    expect(res.status).toBe(201);
    expect(res.body.helmet.helmetId).toBe("PS-H-NEW");
  });

  test("rejects a duplicate helmetId", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-DUP" });

    const res = await request(app).post("/api/helmets").set(authHeader(admin)).send({ helmetId: "PS-H-DUP" });

    expect(res.status).toBe(409);
  });
});
