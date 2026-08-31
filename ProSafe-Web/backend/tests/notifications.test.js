const request = require("supertest");

jest.mock("../services/mlService");

const app = require("../app");
const testDb = require("./testDb");
const { createUser, authHeader } = require("./factories");
const Notification = require("../models/Notification");
const notificationStream = require("../services/notificationStream");
const mlService = require("../services/mlService");
const { processPacket } = require("../services/sensorProcessingService");

beforeAll(testDb.connect);
afterEach(testDb.clearDatabase);
afterAll(testDb.closeDatabase);

function isoNow() {
  return new Date().toISOString();
}

async function makeNotification(recipientUserId, overrides = {}) {
  return Notification.create({
    recipientUserId,
    type: "USER_CREATED",
    title: "Test",
    message: "Test message",
    ...overrides,
  });
}

describe("GET /api/notifications", () => {
  test("unauthenticated -> 401", async () => {
    const res = await request(app).get("/api/notifications");
    expect(res.status).toBe(401);
  });

  test("returns only the authenticated user's own notifications", async () => {
    const worker = await createUser({ role: "WORKER" });
    const other = await createUser({ role: "WORKER" });
    await makeNotification(worker.userId, { title: "Mine" });
    await makeNotification(other.userId, { title: "Not mine" });

    const res = await request(app).get("/api/notifications").set(authHeader(worker));

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0].title).toBe("Mine");
  });

  test("unreadCount is correct and unread=true filters", async () => {
    const worker = await createUser({ role: "WORKER" });
    await makeNotification(worker.userId, { read: true });
    await makeNotification(worker.userId, { read: false });
    await makeNotification(worker.userId, { read: false });

    const res = await request(app).get("/api/notifications").set(authHeader(worker));
    expect(res.body.unreadCount).toBe(2);

    const unreadOnly = await request(app).get("/api/notifications").query({ unread: "true" }).set(authHeader(worker));
    expect(unreadOnly.body.notifications).toHaveLength(2);
  });

  test("pagination works", async () => {
    const worker = await createUser({ role: "WORKER" });
    for (let i = 0; i < 25; i++) {
      await makeNotification(worker.userId, { title: `N${i}` });
    }

    const res = await request(app).get("/api/notifications").query({ page: 1, limit: 20 }).set(authHeader(worker));
    expect(res.body.notifications).toHaveLength(20);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 20, total: 25, pages: 2 });
  });
});

describe("PATCH /api/notifications/:id/read", () => {
  test("marks the caller's own notification read", async () => {
    const worker = await createUser({ role: "WORKER" });
    const notification = await makeNotification(worker.userId);

    const res = await request(app).patch(`/api/notifications/${notification._id}/read`).set(authHeader(worker));

    expect(res.status).toBe(200);
    const stored = await Notification.findById(notification._id);
    expect(stored.read).toBe(true);
    expect(stored.readAt).not.toBeNull();
  });

  test("a worker cannot mark another user's notification as read (404, not leaked)", async () => {
    const worker = await createUser({ role: "WORKER" });
    const other = await createUser({ role: "WORKER" });
    const notification = await makeNotification(other.userId);

    const res = await request(app).patch(`/api/notifications/${notification._id}/read`).set(authHeader(worker));

    expect(res.status).toBe(404);
    const stored = await Notification.findById(notification._id);
    expect(stored.read).toBe(false); // untouched
  });

  test("unknown notification id -> 404, not a 500", async () => {
    const worker = await createUser({ role: "WORKER" });
    const res = await request(app)
      .patch("/api/notifications/6a0000000000000000000000/read")
      .set(authHeader(worker));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/notifications/read-all", () => {
  test("marks all of the caller's unread notifications read, leaves other users' untouched", async () => {
    const worker = await createUser({ role: "WORKER" });
    const other = await createUser({ role: "WORKER" });
    await makeNotification(worker.userId, { read: false });
    await makeNotification(worker.userId, { read: false });
    const otherNotification = await makeNotification(other.userId, { read: false });

    const res = await request(app).patch("/api/notifications/read-all").set(authHeader(worker));
    expect(res.status).toBe(200);

    const mineUnread = await Notification.countDocuments({ recipientUserId: worker.userId, read: false });
    expect(mineUnread).toBe(0);

    const othersStillUnread = await Notification.findById(otherNotification._id);
    expect(othersStillUnread.read).toBe(false);
  });
});

describe("GET /api/notifications/stream", () => {
  test("unauthenticated -> 401 (never opens the stream)", async () => {
    const res = await request(app).get("/api/notifications/stream");
    expect(res.status).toBe(401);
  });
});

describe("notificationStream (SSE pub/sub plumbing)", () => {
  test("publish delivers only to the intended recipient's subscribers", () => {
    const adminRes = { write: jest.fn() };
    const workerRes = { write: jest.fn() };
    notificationStream.subscribe("ADM-STREAM", adminRes);
    notificationStream.subscribe("W-STREAM", workerRes);

    notificationStream.publish("ADM-STREAM", { type: "TEST", title: "For admin" });

    expect(adminRes.write).toHaveBeenCalledTimes(1);
    expect(adminRes.write.mock.calls[0][0]).toContain("For admin");
    expect(workerRes.write).not.toHaveBeenCalled();

    notificationStream.unsubscribe("ADM-STREAM", adminRes);
    notificationStream.unsubscribe("W-STREAM", workerRes);
  });

  test("unsubscribe removes the subscriber — a disconnected client receives nothing further", () => {
    const res = { write: jest.fn() };
    notificationStream.subscribe("W-DISCONNECT", res);
    expect(notificationStream.subscriberCount("W-DISCONNECT")).toBe(1);

    notificationStream.unsubscribe("W-DISCONNECT", res);
    expect(notificationStream.subscriberCount("W-DISCONNECT")).toBe(0);

    notificationStream.publish("W-DISCONNECT", { type: "TEST", title: "After disconnect" });
    expect(res.write).not.toHaveBeenCalled();
  });

  test("publishing to a userId with no open connection is a safe no-op", () => {
    expect(() => notificationStream.publish("W-NEVER-CONNECTED", { type: "TEST", title: "x" })).not.toThrow();
  });
});

describe("Notification generation — emergency workflow", () => {
  test("emergency activation notifies all active admins (EMERGENCY_ALERT), not the pressing worker", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-EMRG-N", name: "Nirmani Silva" });

    await request(app)
      .post("/api/helmet/emergency")
      .send({ helmetId: "PS-H-EMRG-N", timestamp: isoNow(), emergency: true });

    const adminNotifs = await Notification.find({ recipientUserId: admin.userId, type: "EMERGENCY_ALERT" });
    expect(adminNotifs).toHaveLength(1);
    expect(adminNotifs[0].message).toMatch(/Nirmani Silva/);

    const workerNotifs = await Notification.find({ recipientUserId: worker.userId, type: "EMERGENCY_ALERT" });
    expect(workerNotifs).toHaveLength(0);
  });

  test("a retried/duplicate emergency packet does not duplicate the notification (#12)", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createUser({ role: "WORKER", helmetId: "PS-H-EMRG-DUP" });

    const body = { helmetId: "PS-H-EMRG-DUP", timestamp: isoNow(), emergency: true };
    await request(app).post("/api/helmet/emergency").send(body);
    await request(app).post("/api/helmet/emergency").send(body); // retry

    const adminNotifs = await Notification.find({ recipientUserId: admin.userId, type: "EMERGENCY_ALERT" });
    expect(adminNotifs).toHaveLength(1);
  });

  test("reset request notifies admins and the affected worker (EMERGENCY_RESET_REQUESTED)", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-RESET-N" });

    await request(app)
      .post("/api/helmet/emergency")
      .send({ helmetId: "PS-H-RESET-N", timestamp: isoNow(), emergency: true });

    await request(app).post("/api/helmet/PS-H-RESET-N/emergency/reset").set(authHeader(admin));

    const adminNotifs = await Notification.find({ recipientUserId: admin.userId, type: "EMERGENCY_RESET_REQUESTED" });
    const workerNotifs = await Notification.find({ recipientUserId: worker.userId, type: "EMERGENCY_RESET_REQUESTED" });
    expect(adminNotifs).toHaveLength(1);
    expect(workerNotifs).toHaveLength(1);
  });

  test("repeated reset requests do not duplicate the notification (#12)", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createUser({ role: "WORKER", helmetId: "PS-H-RESET-DUP" });

    await request(app)
      .post("/api/helmet/emergency")
      .send({ helmetId: "PS-H-RESET-DUP", timestamp: isoNow(), emergency: true });

    await request(app).post("/api/helmet/PS-H-RESET-DUP/emergency/reset").set(authHeader(admin));
    await request(app).post("/api/helmet/PS-H-RESET-DUP/emergency/reset").set(authHeader(admin)); // retry

    const adminNotifs = await Notification.find({ recipientUserId: admin.userId, type: "EMERGENCY_RESET_REQUESTED" });
    expect(adminNotifs).toHaveLength(1);
  });

  test("helmet ack resolving the emergency notifies admins and worker (EMERGENCY_RESOLVED)", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-ACK-N" });

    await request(app)
      .post("/api/helmet/emergency")
      .send({ helmetId: "PS-H-ACK-N", timestamp: isoNow(), emergency: true });
    await request(app).post("/api/helmet/PS-H-ACK-N/emergency/reset").set(authHeader(admin));
    await request(app).post("/api/helmet/PS-H-ACK-N/emergency/reset/ack");

    const adminNotifs = await Notification.find({ recipientUserId: admin.userId, type: "EMERGENCY_RESOLVED" });
    const workerNotifs = await Notification.find({ recipientUserId: worker.userId, type: "EMERGENCY_RESOLVED" });
    expect(adminNotifs).toHaveLength(1);
    expect(workerNotifs).toHaveLength(1);
  });

  test("a stale/duplicate ack does not duplicate the resolved notification (#12)", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createUser({ role: "WORKER", helmetId: "PS-H-ACK-DUP" });

    await request(app)
      .post("/api/helmet/emergency")
      .send({ helmetId: "PS-H-ACK-DUP", timestamp: isoNow(), emergency: true });
    await request(app).post("/api/helmet/PS-H-ACK-DUP/emergency/reset").set(authHeader(admin));
    await request(app).post("/api/helmet/PS-H-ACK-DUP/emergency/reset/ack");
    await request(app).post("/api/helmet/PS-H-ACK-DUP/emergency/reset/ack"); // stale retry

    const adminNotifs = await Notification.find({ recipientUserId: admin.userId, type: "EMERGENCY_RESOLVED" });
    expect(adminNotifs).toHaveLength(1);
  });

  test("the reset-request endpoint itself is now ADMIN-only (regression guard for the auth fix)", async () => {
    const worker = await createUser({ role: "WORKER", helmetId: "PS-H-AUTHFIX" });
    await request(app)
      .post("/api/helmet/emergency")
      .send({ helmetId: "PS-H-AUTHFIX", timestamp: isoNow(), emergency: true });

    expect((await request(app).post("/api/helmet/PS-H-AUTHFIX/emergency/reset")).status).toBe(401);
    expect(
      (await request(app).post("/api/helmet/PS-H-AUTHFIX/emergency/reset").set(authHeader(worker))).status
    ).toBe(403);
  });
});

describe("Notification generation — user creation", () => {
  test("creating a user notifies other admins (USER_CREATED), excluding the creator", async () => {
    const creator = await createUser({ role: "ADMIN" });
    const otherAdmin = await createUser({ role: "ADMIN" });

    const res = await request(app).post("/api/users").set(authHeader(creator)).send({
      name: "New Worker", email: "newworker-notif@test.com", nic: "200011122266",
      phone: "0771112266", role: "WORKER", password: "Passw0rd1",
    });
    expect(res.status).toBe(201);

    const creatorNotifs = await Notification.find({ recipientUserId: creator.userId, type: "USER_CREATED" });
    const otherNotifs = await Notification.find({ recipientUserId: otherAdmin.userId, type: "USER_CREATED" });
    expect(creatorNotifs).toHaveLength(0);
    expect(otherNotifs).toHaveLength(1);
    expect(otherNotifs[0].message).toMatch(/New Worker/);
  });

  test("user creation still succeeds even though notification generation runs afterward", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app).post("/api/users").set(authHeader(admin)).send({
      name: "Another Worker", email: "another-notif@test.com", nic: "200011122277",
      phone: "0771112277", role: "WORKER", password: "Passw0rd1",
    });
    expect(res.status).toBe(201);
    expect(res.body.user.userId).toBeDefined();
  });
});

describe("Notification generation — transition alert (ML mocked)", () => {
  test("an accepted risk transition notifies admins and the affected worker (NEW_ALERT)", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const worker = await createUser({
      role: "WORKER", helmetId: "PS-H-TRANS-N",
      baselineHeartRate: 70, baselineBodyTemperature: 36.5,
    });

    mlService.runPrediction.mockResolvedValue({
      ok: true, predictedState: "WARNING", confidence: 0.95, probabilities: { WARNING: 0.95 },
    });

    const result = await processPacket({
      helmetId: "PS-H-TRANS-N",
      timestamp: isoNow(),
      heartRate: 95, bodyTemp: 37.2, ambientTemp: 30, noise: 80, gas: 100, uv: 4,
    });
    expect(result.responseBody.stateChanged).toBe(true);

    const adminNotifs = await Notification.find({ recipientUserId: admin.userId, type: "NEW_ALERT" });
    const workerNotifs = await Notification.find({ recipientUserId: worker.userId, type: "NEW_ALERT" });
    expect(adminNotifs).toHaveLength(1);
    expect(workerNotifs).toHaveLength(1);
  });

  test("repeated packets that don't change risk state do not duplicate NEW_ALERT (#12)", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createUser({
      role: "WORKER", helmetId: "PS-H-TRANS-DUP",
      baselineHeartRate: 70, baselineBodyTemperature: 36.5,
    });

    mlService.runPrediction.mockResolvedValue({
      ok: true, predictedState: "WARNING", confidence: 0.95, probabilities: { WARNING: 0.95 },
    });

    const packet = {
      helmetId: "PS-H-TRANS-DUP",
      timestamp: isoNow(),
      heartRate: 95, bodyTemp: 37.2, ambientTemp: 30, noise: 80, gas: 100, uv: 4,
    };
    const first = await processPacket(packet);
    const second = await processPacket({ ...packet, timestamp: isoNow() }); // same predicted state again

    expect(first.responseBody.stateChanged).toBe(true);
    expect(second.responseBody.stateChanged).toBe(false); // no new transition

    const adminNotifs = await Notification.find({ recipientUserId: admin.userId, type: "NEW_ALERT" });
    expect(adminNotifs).toHaveLength(1);
  });

  test("a failure inside notification creation itself does not stop packet processing from succeeding (#32)", async () => {
    // Mocks the actual failure boundary — Notification.create() throwing —
    // rather than the outer notifyAdmins/notifyUser functions, which already
    // never throw by construction (see notificationService.safeCreate). This
    // exercises that real safety net instead of bypassing it.
    await createUser({
      role: "WORKER", helmetId: "PS-H-TRANS-FAIL",
      baselineHeartRate: 70, baselineBodyTemperature: 36.5,
    });
    mlService.runPrediction.mockResolvedValue({
      ok: true, predictedState: "CRITICAL", confidence: 0.95, probabilities: { CRITICAL: 0.95 },
    });

    const createSpy = jest.spyOn(Notification, "create").mockRejectedValue(new Error("boom"));

    const result = await processPacket({
      helmetId: "PS-H-TRANS-FAIL",
      timestamp: isoNow(),
      heartRate: 130, bodyTemp: 38.5, ambientTemp: 30, noise: 80, gas: 100, uv: 4,
    });

    expect(result.httpStatus).toBe(201);
    expect(result.responseBody.stateChanged).toBe(true);

    createSpy.mockRestore();

    const count = await Notification.countDocuments({});
    expect(count).toBe(0); // every attempted create failed, none silently half-written
  });
});
