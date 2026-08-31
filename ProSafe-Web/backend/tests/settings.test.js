const path = require("path");
const request = require("supertest");
const app = require("../app");
const testDb = require("./testDb");
const { createUser, authHeader } = require("./factories");
const User = require("../models/User");

const SAMPLE_IMAGE = path.join(__dirname, "..", "assets", "prosafe-logo.png");

beforeAll(testDb.connect);
afterEach(testDb.clearDatabase);
afterAll(testDb.closeDatabase);

describe("PATCH /api/users/me — account self-service", () => {
  test("unauthenticated -> 401", async () => {
    const res = await request(app).patch("/api/users/me").send({ name: "New Name" });
    expect(res.status).toBe(401);
  });

  test("a worker can update their own name/phone/address", async () => {
    const worker = await createUser({ role: "WORKER", name: "Old Name" });

    const res = await request(app)
      .patch("/api/users/me")
      .set(authHeader(worker))
      .send({ name: "New Name", phone: "0779998888", address: "123 New Street" });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("New Name");
    expect(res.body.user.phone).toBe("0779998888");
    expect(res.body.user.address).toBe("123 New Street");
  });

  test("invalid account data (bad phone) is rejected", async () => {
    const worker = await createUser({ role: "WORKER" });
    const res = await request(app).patch("/api/users/me").set(authHeader(worker)).send({ phone: "not-a-phone" });
    expect(res.status).toBe(400);
    expect(res.body.errors.phone).toBeDefined();
  });

  test.each([
    ["role", "ADMIN"],
    ["userId", "ADM-999"],
    ["email", "new@test.com"],
    ["nic", "200011112222"],
    ["helmetId", "PS-H-STOLEN"],
    ["baselineHeartRate", 999],
    ["baselineBodyTemperature", 50],
    ["passwordHash", "$2a$10$hacked"],
  ])("a worker sending %s is rejected with 400, and the field is left unchanged", async (field, value) => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-ORIGINAL" });

    const res = await request(app).patch("/api/users/me").set(authHeader(worker)).send({ [field]: value });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("One or more fields cannot be changed from Settings.");

    const stored = await User.findOne({ userId: worker.userId });
    expect(stored.role).toBe("WORKER");
    expect(stored.helmetId).toBe("PS-H-ORIGINAL");
  });

  test("an admin sending role/helmetId/baseline fields is rejected the same way — Settings is never a privilege-escalation path for anyone", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app).patch("/api/users/me").set(authHeader(admin)).send({ role: "WORKER" });
    expect(res.status).toBe(400);
  });

  test("updates notification preferences, leaving unspecified keys untouched", async () => {
    const worker = await createUser({ role: "WORKER" });

    const res = await request(app)
      .patch("/api/users/me")
      .set(authHeader(worker))
      .send({ notificationPreferences: { safetyAlerts: false } });

    expect(res.status).toBe(200);
    expect(res.body.user.preferences.notifications.safetyAlerts).toBe(false);
    expect(res.body.user.preferences.notifications.emergencyAlerts).toBe(true); // untouched, still default
  });

  test("non-boolean or unknown notification preference keys are ignored, not stored verbatim", async () => {
    const worker = await createUser({ role: "WORKER" });

    const res = await request(app)
      .patch("/api/users/me")
      .set(authHeader(worker))
      .send({ notificationPreferences: { safetyAlerts: "yes please", notARealKey: true } });

    expect(res.status).toBe(200);
    expect(res.body.user.preferences.notifications.safetyAlerts).toBe(true); // unchanged — "yes please" isn't boolean
    expect(res.body.user.preferences.notifications.notARealKey).toBeUndefined();
  });

  test("uploads a profile image via the same uploadProfileImage middleware Edit User uses, alongside a text field", async () => {
    const worker = await createUser({ role: "WORKER" });

    const res = await request(app)
      .patch("/api/users/me")
      .set(authHeader(worker))
      .field("name", "Photo Worker")
      .attach("profileImage", SAMPLE_IMAGE);

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("Photo Worker");
    expect(res.body.user.profileImageUrl).toMatch(/^\/uploads\/profile-images\/.+\.png$/);
  });

  test("a User document saved before the preferences field existed still returns full defaults", async () => {
    const worker = await createUser({ role: "WORKER" });
    // Bypass Mongoose entirely (native driver) so no schema defaults apply
    // at write time — simulates a genuinely pre-existing historical document.
    await User.collection.updateOne({ userId: worker.userId }, { $unset: { preferences: "" } });

    const raw = await User.collection.findOne({ userId: worker.userId });
    expect(raw.preferences).toBeUndefined(); // confirms the simulated "old" state

    const res = await request(app).get("/api/users/me").set(authHeader(worker));
    expect(res.status).toBe(200);
    expect(res.body.user.preferences.notifications).toEqual({
      safetyAlerts: true, emergencyAlerts: true, emergencyResetUpdates: true,
      accountNotifications: true, reportNotifications: true,
    });
  });
});

describe("Notification preferences never suppress inbox delivery (#6/#7)", () => {
  test("an admin with emergencyAlerts=false still receives the EMERGENCY_ALERT Notification document", async () => {
    const Notification = require("../models/Notification");
    const admin = await createUser({ role: "ADMIN" });
    await User.updateOne({ userId: admin.userId }, { $set: { "preferences.notifications.emergencyAlerts": false } });
    await createUser({ role: "WORKER", helmetId: "PS-H-PREF-TEST" });

    await request(app)
      .post("/api/helmet/emergency")
      .send({ helmetId: "PS-H-PREF-TEST", timestamp: new Date().toISOString(), emergency: true });

    const notifications = await Notification.find({ recipientUserId: admin.userId, type: "EMERGENCY_ALERT" });
    // The preference only ever controls the frontend toast — inbox/SSE
    // delivery is unconditional in notificationService, regardless of what
    // any stored preference says.
    expect(notifications).toHaveLength(1);
  });
});

describe("GET /api/settings/system-info", () => {
  test("unauthenticated -> 401", async () => {
    const res = await request(app).get("/api/settings/system-info");
    expect(res.status).toBe(401);
  });

  test("returns safe info for the requesting user, worker or admin", async () => {
    const worker = await createUser({ role: "WORKER" });
    const res = await request(app).get("/api/settings/system-info").set(authHeader(worker));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      appName: "ProSafe Smart Helmet",
      role: "WORKER",
      userId: worker.userId,
      apiStatus: "ok",
    });
    expect(typeof res.body.mlServiceConfigured).toBe("boolean");
    expect(res.body.timezone).toBeDefined();
  });

  test("never leaks internal configuration", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app).get("/api/settings/system-info").set(authHeader(admin));

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/ML_SERVICE_URL|serviceUrl|mongodb(\+srv)?:\/\/|JWT_SECRET|DB_URI/i);
  });
});

describe("GET /api/settings/site", () => {
  test("unauthenticated -> 401", async () => {
    const res = await request(app).get("/api/settings/site");
    expect(res.status).toBe(401);
  });

  test("worker -> 403", async () => {
    const worker = await createUser({ role: "WORKER" });
    const res = await request(app).get("/api/settings/site").set(authHeader(worker));
    expect(res.status).toBe(403);
  });

  test("admin can read safe site settings", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app).get("/api/settings/site").set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("siteName");
    expect(res.body).toHaveProperty("siteLatitude");
    expect(res.body).toHaveProperty("siteLongitude");
    expect(res.body).toHaveProperty("siteTimezone");
    expect(res.body).toHaveProperty("helmetOfflineAfterSeconds");
  });

  test("never leaks internal configuration", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app).get("/api/settings/site").set(authHeader(admin));

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/ML_SERVICE_URL|JWT_SECRET|mongodb(\+srv)?:\/\//i);
  });
});
