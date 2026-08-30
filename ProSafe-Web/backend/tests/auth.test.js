const request = require("supertest");
const app = require("../app");
const testDb = require("./testDb");
const { createUser } = require("./factories");

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
