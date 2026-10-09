// Worker physiological baselines through User Management (create / update /
// view), role rules and authorization. Baselines are worker context for
// ProSafe ML V2, never model features, and never defaulted.
const request = require("supertest");

const app = require("../app");
const testDb = require("./testDb");
const { createUser, authHeader } = require("./factories");
const User = require("../models/User");
const { getWorkerBaseline } = require("../services/baselineService");

beforeAll(testDb.connect);
afterEach(testDb.clearDatabase);
afterAll(testDb.closeDatabase);

let seq = 0;
function newWorker(extra = {}) {
  seq += 1;
  return {
    name: `Baseline Worker ${seq}`, email: `bl${seq}@test.com`, nic: `${200000000000 + seq}`,
    phone: "0771234567", role: "WORKER", password: "Passw0rd1", ...extra,
  };
}

describe("create", () => {
  test("worker with both baselines stores them; GET returns them", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app).post("/api/users").set(authHeader(admin))
      .send(newWorker({ baselineHeartRate: 74, baselineBodyTemperature: 36.6 }));
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ baselineHeartRate: 74, baselineBodyTemperature: 36.6 });
    const view = await request(app).get(`/api/users/${res.body.user.userId}`).set(authHeader(admin));
    expect(view.body.user).toMatchObject({ baselineHeartRate: 74, baselineBodyTemperature: 36.6 });
    const bl = await getWorkerBaseline(res.body.user.userId);
    expect(bl).toMatchObject({ hasBaseline: true, unavailableReason: null });
  });

  test("multipart string values (the real form) are parsed", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const fields = newWorker({ baselineHeartRate: "68", baselineBodyTemperature: "36.4" });
    let req = request(app).post("/api/users").set(authHeader(admin));
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    const res = await req;
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ baselineHeartRate: 68, baselineBodyTemperature: 36.4 });
  });

  test("worker without baselines is allowed (null, never a default) and reports BASELINE_UNAVAILABLE", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app).post("/api/users").set(authHeader(admin))
      .send(newWorker({ baselineHeartRate: "", baselineBodyTemperature: "" }));
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ baselineHeartRate: null, baselineBodyTemperature: null });
    expect(await getWorkerBaseline(res.body.user.userId)).toMatchObject({
      hasBaseline: false, baselineHeartRate: null, unavailableReason: "BASELINE_UNAVAILABLE",
    });
  });

  test.each([
    [{ baselineHeartRate: 74 }, "baselineBodyTemperature"],
    [{ baselineHeartRate: 10, baselineBodyTemperature: 36.6 }, "baselineHeartRate"],
    [{ baselineHeartRate: 74, baselineBodyTemperature: 45 }, "baselineBodyTemperature"],
    [{ baselineHeartRate: "fast", baselineBodyTemperature: 36.6 }, "baselineHeartRate"],
  ])("invalid baselines %j are rejected (400, %s)", async (baselines, field) => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app).post("/api/users").set(authHeader(admin)).send(newWorker(baselines));
    expect(res.status).toBe(400);
    expect(res.body.errors[field]).toBeDefined();
    expect(await User.countDocuments({ role: "WORKER" })).toBe(0);
  });

  test("an ADMIN account cannot carry baselines", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app).post("/api/users").set(authHeader(admin))
      .send(newWorker({ role: "ADMIN", baselineHeartRate: 70, baselineBodyTemperature: 36.5 }));
    expect(res.status).toBe(400);
    expect(res.body.errors.baselineHeartRate).toMatch(/worker accounts only/);
  });
});

describe("update", () => {
  test("admin edits a worker's baseline; omitted fields are kept; explicit null clears both", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const w = await createUser({ role: "WORKER", baselineHeartRate: 70, baselineBodyTemperature: 36.5 });

    let res = await request(app).put(`/api/users/${w.userId}`).set(authHeader(admin)).send({ baselineHeartRate: 76, baselineBodyTemperature: 36.5 });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ baselineHeartRate: 76, baselineBodyTemperature: 36.5 });

    res = await request(app).put(`/api/users/${w.userId}`).set(authHeader(admin)).send({ name: "Renamed" });
    expect(res.body.user).toMatchObject({ name: "Renamed", baselineHeartRate: 76, baselineBodyTemperature: 36.5 });

    res = await request(app).put(`/api/users/${w.userId}`).set(authHeader(admin)).send({ baselineHeartRate: 80 }).expect(200);
    expect(res.body.user.baselineHeartRate).toBe(80);

    res = await request(app).put(`/api/users/${w.userId}`).set(authHeader(admin)).send({ baselineHeartRate: null });
    expect(res.status).toBe(400); // would leave only body temperature set

    res = await request(app).put(`/api/users/${w.userId}`).set(authHeader(admin)).send({ baselineHeartRate: null, baselineBodyTemperature: null });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ baselineHeartRate: null, baselineBodyTemperature: null });
  });

  test("role change WORKER -> ADMIN clears the baselines (and the helmet)", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const w = await createUser({ role: "WORKER", baselineHeartRate: 70, baselineBodyTemperature: 36.5 });
    const res = await request(app).put(`/api/users/${w.userId}`).set(authHeader(admin)).send({ role: "ADMIN" });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: "ADMIN", baselineHeartRate: null, baselineBodyTemperature: null, helmetId: null });
  });

  test("existing users with null baselines stay valid and editable (no migration needed)", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const legacy = await createUser({ role: "WORKER" });
    const res = await request(app).put(`/api/users/${legacy.userId}`).set(authHeader(admin)).send({ phone: "0779999999" });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ baselineHeartRate: null, baselineBodyTemperature: null });
  });
});

describe("authorization", () => {
  test("a worker cannot change their own baseline via /me", async () => {
    const w = await createUser({ role: "WORKER", baselineHeartRate: 70, baselineBodyTemperature: 36.5 });
    const res = await request(app).patch("/api/users/me").set(authHeader(w)).send({ baselineHeartRate: 60 });
    expect(res.status).toBe(400);
    expect((await User.findOne({ userId: w.userId })).baselineHeartRate).toBe(70);
  });

  test("a worker cannot use the admin update endpoint; unauthenticated requests are refused", async () => {
    const w = await createUser({ role: "WORKER", baselineHeartRate: 70, baselineBodyTemperature: 36.5 });
    expect((await request(app).put(`/api/users/${w.userId}`).set(authHeader(w)).send({ baselineHeartRate: 60 })).status).toBe(403);
    expect((await request(app).put(`/api/users/${w.userId}`).send({ baselineHeartRate: 60 })).status).toBe(401);
    expect((await User.findOne({ userId: w.userId })).baselineHeartRate).toBe(70);
  });
});
