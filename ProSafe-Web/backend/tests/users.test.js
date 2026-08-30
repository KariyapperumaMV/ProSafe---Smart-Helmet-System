const request = require("supertest");
const app = require("../app");
const testDb = require("./testDb");
const { createUser, authHeader } = require("./factories");
const Helmet = require("../models/Helmet");
const User = require("../models/User");

beforeAll(testDb.connect);
afterEach(testDb.clearDatabase);
afterAll(testDb.closeDatabase);

describe("GET /api/users", () => {
  test("admin lists users", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createUser({ role: "WORKER" });

    const res = await request(app).get("/api/users").set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(2);
    expect(res.body.pagination.total).toBe(2);
  });

  test("worker cannot list users", async () => {
    const worker = await createUser({ role: "WORKER" });

    const res = await request(app).get("/api/users").set(authHeader(worker));

    expect(res.status).toBe(403);
  });

  test("rejects requests with no token at all", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/users", () => {
  test("admin creates an ADMIN user", async () => {
    const admin = await createUser({ role: "ADMIN" });

    const res = await request(app).post("/api/users").set(authHeader(admin)).send({
      name: "New Admin",
      email: "newadmin@test.com",
      nic: "200011122233",
      phone: "0771112233",
      role: "ADMIN",
      password: "Passw0rd1",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("ADMIN");
    expect(res.body.user.userId).toMatch(/^ADM-/);
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  test("admin creates a WORKER user", async () => {
    const admin = await createUser({ role: "ADMIN" });

    const res = await request(app).post("/api/users").set(authHeader(admin)).send({
      name: "New Worker",
      email: "newworker@test.com",
      nic: "200011122234",
      phone: "0771112234",
      role: "WORKER",
      password: "Passw0rd1",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("WORKER");
    expect(res.body.user.userId).toMatch(/^W-/);
  });

  test("worker cannot create users", async () => {
    const worker = await createUser({ role: "WORKER" });

    const res = await request(app).post("/api/users").set(authHeader(worker)).send({
      name: "Nope",
      email: "nope@test.com",
      nic: "200011122299",
      phone: "0771112299",
      role: "WORKER",
      password: "Passw0rd1",
    });

    expect(res.status).toBe(403);
  });

  test("rejects a duplicate email with 409", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createUser({ email: "taken@test.com" });

    const res = await request(app).post("/api/users").set(authHeader(admin)).send({
      name: "Dup",
      email: "taken@test.com",
      nic: "200011122235",
      phone: "0771112235",
      role: "WORKER",
      password: "Passw0rd1",
    });

    expect(res.status).toBe(409);
    expect(res.body.errors.email).toBeDefined();
  });

  test("rejects a duplicate NIC with 409", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createUser({ nic: "200099988877" });

    const res = await request(app).post("/api/users").set(authHeader(admin)).send({
      name: "Dup",
      email: "dupnic@test.com",
      nic: "200099988877",
      phone: "0771112236",
      role: "WORKER",
      password: "Passw0rd1",
    });

    expect(res.status).toBe(409);
    expect(res.body.errors.nic).toBeDefined();
  });

  test("worker helmet assignment succeeds", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-100" });

    const res = await request(app).post("/api/users").set(authHeader(admin)).send({
      name: "Helmeted Worker",
      email: "helmeted@test.com",
      nic: "200011122237",
      phone: "0771112237",
      role: "WORKER",
      password: "Passw0rd1",
      helmetId: "PS-H-100",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.helmetId).toBe("PS-H-100");
  });

  test("rejects assigning a helmet already held by another active worker", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-101" });
    await createUser({ role: "WORKER", helmetId: "PS-H-101" });

    const res = await request(app).post("/api/users").set(authHeader(admin)).send({
      name: "Second Worker",
      email: "second@test.com",
      nic: "200011122238",
      phone: "0771112238",
      role: "WORKER",
      password: "Passw0rd1",
      helmetId: "PS-H-101",
    });

    expect(res.status).toBe(409);
  });

  test("rejects assigning a helmet to an ADMIN user", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-102" });

    const res = await request(app).post("/api/users").set(authHeader(admin)).send({
      name: "Bad Admin",
      email: "badadmin@test.com",
      nic: "200011122239",
      phone: "0771112239",
      role: "ADMIN",
      password: "Passw0rd1",
      helmetId: "PS-H-102",
    });

    expect(res.status).toBe(409);
  });
});

describe("PUT /api/users/:id", () => {
  test("admin edits a worker", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER", name: "Old Name" });

    const res = await request(app)
      .put(`/api/users/${worker.userId}`)
      .set(authHeader(admin))
      .send({ name: "New Name" });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("New Name");
  });

  test("role change WORKER -> ADMIN clears the helmet assignment", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-200" });
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-200" });

    const res = await request(app)
      .put(`/api/users/${worker.userId}`)
      .set(authHeader(admin))
      .send({ role: "ADMIN" });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("ADMIN");
    expect(res.body.user.helmetId).toBeNull();

    const helmetFreedRes = await request(app)
      .get("/api/helmets/assignable")
      .set(authHeader(admin));
    expect(helmetFreedRes.body.helmets.map((h) => h.helmetId)).toContain("PS-H-200");
  });

  test("worker cannot edit another user", async () => {
    const worker = await createUser({ role: "WORKER" });
    const otherWorker = await createUser({ role: "WORKER" });

    const res = await request(app)
      .put(`/api/users/${otherWorker.userId}`)
      .set(authHeader(worker))
      .send({ name: "Hacked" });

    expect(res.status).toBe(403);
  });

  test("a worker sending role: ADMIN in the body cannot self-promote (no PUT access at all)", async () => {
    const worker = await createUser({ role: "WORKER" });

    const res = await request(app)
      .put(`/api/users/${worker.userId}`)
      .set(authHeader(worker))
      .send({ role: "ADMIN" });

    expect(res.status).toBe(403);
    const stored = await User.findOne({ userId: worker.userId });
    expect(stored.role).toBe("WORKER");
  });
});

describe("GET /api/users/me and /api/users/:id", () => {
  test("worker can view their own profile via /me", async () => {
    const worker = await createUser({ role: "WORKER", name: "Self Viewer" });

    const res = await request(app).get("/api/users/me").set(authHeader(worker));

    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe(worker.userId);
  });

  test("worker cannot view another user by id", async () => {
    const worker = await createUser({ role: "WORKER" });
    const other = await createUser({ role: "WORKER" });

    const res = await request(app).get(`/api/users/${other.userId}`).set(authHeader(worker));

    expect(res.status).toBe(403);
  });

  test("admin viewing a worker WITH a helmet gets the aggregated operational fields", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-400" });
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-400" });

    const res = await request(app).get(`/api/users/${worker.userId}`).set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("currentRiskState");
    expect(res.body).toHaveProperty("emergencyActive");
    expect(res.body).toHaveProperty("latestSensorData");
  });

  test("admin viewing a worker with NO helmet gets no operational fields (#15)", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });

    const res = await request(app).get(`/api/users/${worker.userId}`).set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("currentRiskState");
    expect(res.body).not.toHaveProperty("latestSensorData");
  });
});

describe("DELETE /api/users/:id", () => {
  test("admin deletes a user (soft delete)", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER" });

    const res = await request(app).delete(`/api/users/${worker.userId}`).set(authHeader(admin));

    expect(res.status).toBe(200);

    const stored = await User.findOne({ userId: worker.userId });
    expect(stored.active).toBe(false);
    expect(stored.deletedAt).not.toBeNull();
  });

  test("deleting a worker frees their helmet for reassignment", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await Helmet.create({ helmetId: "PS-H-300" });
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-300" });

    await request(app).delete(`/api/users/${worker.userId}`).set(authHeader(admin));

    const stored = await User.findOne({ userId: worker.userId });
    expect(stored.helmetId).toBeNull();

    const assignableRes = await request(app).get("/api/helmets/assignable").set(authHeader(admin));
    expect(assignableRes.body.helmets.map((h) => h.helmetId)).toContain("PS-H-300");
  });

  test("a deleted user can no longer log in", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER", email: "todelete@test.com", password: "Passw0rd1" });

    await request(app).delete(`/api/users/${worker.userId}`).set(authHeader(admin));

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "todelete@test.com", password: "Passw0rd1" });

    expect(loginRes.status).toBe(401);
  });

  test("worker cannot delete users", async () => {
    const worker = await createUser({ role: "WORKER" });
    const other = await createUser({ role: "WORKER" });

    const res = await request(app).delete(`/api/users/${other.userId}`).set(authHeader(worker));

    expect(res.status).toBe(403);
  });
});
