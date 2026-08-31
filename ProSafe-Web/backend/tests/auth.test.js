const request = require("supertest");
const app = require("../app");
const testDb = require("./testDb");
const { createUser, authHeader } = require("./factories");

beforeAll(testDb.connect);
afterEach(testDb.clearDatabase);
afterAll(testDb.closeDatabase);

describe("POST /api/auth/login", () => {
  test("logs in with correct email + password and never returns the password hash", async () => {
    await createUser({ email: "admin@test.com", password: "Passw0rd1", role: "ADMIN" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin@test.com", password: "Passw0rd1" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.password).toBeUndefined();
  });

  test("logs in with userId as the username too", async () => {
    const user = await createUser({ userId: "W-777", password: "Passw0rd1" });

    const res = await request(app).post("/api/auth/login").send({ username: user.userId, password: "Passw0rd1" });

    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe("W-777");
  });

  test("rejects a wrong password", async () => {
    await createUser({ email: "admin@test.com", password: "Passw0rd1" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin@test.com", password: "WrongPass1" });

    expect(res.status).toBe(401);
  });

  test("rejects an unknown username", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "nobody@test.com", password: "Passw0rd1" });

    expect(res.status).toBe(401);
  });

  test("rejects a soft-deleted user even with the correct password", async () => {
    await createUser({ email: "gone@test.com", password: "Passw0rd1", active: false });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "gone@test.com", password: "Passw0rd1" });

    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/auth/password", () => {
  test("unauthenticated -> 401", async () => {
    const res = await request(app).patch("/api/auth/password").send({ currentPassword: "x", newPassword: "y" });
    expect(res.status).toBe(401);
  });

  test("correct current password changes the password, and the new password works on next login", async () => {
    const user = await createUser({ email: "changeme@test.com", password: "Passw0rd1" });

    const res = await request(app)
      .patch("/api/auth/password")
      .set(authHeader(user))
      .send({ currentPassword: "Passw0rd1", newPassword: "NewPassw0rd2" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Password changed successfully");
    expect(res.body.passwordHash).toBeUndefined();

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "changeme@test.com", password: "NewPassw0rd2" });
    expect(loginRes.status).toBe(200);

    const oldLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "changeme@test.com", password: "Passw0rd1" });
    expect(oldLoginRes.status).toBe(401);
  });

  test("wrong current password is rejected and nothing changes", async () => {
    const user = await createUser({ email: "wrongcur@test.com", password: "Passw0rd1" });

    const res = await request(app)
      .patch("/api/auth/password")
      .set(authHeader(user))
      .send({ currentPassword: "NotTheRealOne1", newPassword: "NewPassw0rd2" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Current password is incorrect");

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "wrongcur@test.com", password: "Passw0rd1" });
    expect(loginRes.status).toBe(200); // original password still works
  });

  test("new password failing the password policy is rejected", async () => {
    const user = await createUser({ email: "weakpass@test.com", password: "Passw0rd1" });

    const res = await request(app)
      .patch("/api/auth/password")
      .set(authHeader(user))
      .send({ currentPassword: "Passw0rd1", newPassword: "short" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Password does not meet requirements");
  });

  test("new password identical to the current password is rejected", async () => {
    const user = await createUser({ email: "samepass@test.com", password: "Passw0rd1" });

    const res = await request(app)
      .patch("/api/auth/password")
      .set(authHeader(user))
      .send({ currentPassword: "Passw0rd1", newPassword: "Passw0rd1" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("New password must be different from your current password");
  });

  test("the JWT issued before the password change remains valid afterward (no revocation in this phase)", async () => {
    const user = await createUser({ email: "keepalive@test.com", password: "Passw0rd1" });
    const headerFromBeforeChange = authHeader(user);

    await request(app)
      .patch("/api/auth/password")
      .set(headerFromBeforeChange)
      .send({ currentPassword: "Passw0rd1", newPassword: "NewPassw0rd2" });

    // The exact same (pre-change) token still authenticates successfully.
    const res = await request(app).get("/api/users/me").set(headerFromBeforeChange);
    expect(res.status).toBe(200);
  });
});
