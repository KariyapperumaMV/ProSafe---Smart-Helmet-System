// Live worker updates over the existing SSE stream: emitted after each
// processed helmet upload and on emergency changes, scoped to the worker
// themselves + admins, with operational data only.
jest.mock("../services/mlService");

const testDb = require("./testDb");
const { createUser } = require("./factories");
const mlService = require("../services/mlService");
const notificationStream = require("../services/notificationStream");
const { processPacket } = require("../services/sensorProcessingService");
const emergencyService = require("../services/emergencyService");
const { compressPredictionTimeline } = require("../services/userSensorService");

beforeAll(testDb.connect);
afterEach(testDb.clearDatabase);
afterAll(testDb.closeDatabase);

function fakeStream() {
  const events = [];
  return {
    events,
    write(chunk) {
      for (const block of chunk.split("\n\n")) {
        const line = block.split("\n").find((l) => l.startsWith("data:"));
        if (line) events.push(JSON.parse(line.slice(5)));
      }
    },
  };
}

const ready = (state, confidence = 0.92) => ({
  systemState: state, modelReady: true, predictedState: state, confidence,
  probabilities: { SAFE: 0, WARNING: 0, CRITICAL: 0, [state]: confidence },
  dataQuality: "VALID", uncertainReason: null, derived: null,
  modelName: "XGBoost", modelVersion: "t", featureSet: "EXTENDED", sessionId: "S-1",
});
const uncertain = (reason) => ({
  systemState: "UNCERTAIN", modelReady: false, predictedState: null, probabilities: null, confidence: null,
  dataQuality: "UNCERTAIN", uncertainReason: reason, uncertainReasons: [reason], derived: null,
  modelName: "XGBoost", modelVersion: "t", featureSet: "EXTENDED", sessionId: "S-1",
});

const T0 = Date.now() - 60 * 1000;
const samples = (n, start = 0) =>
  Array.from({ length: n }, (_, i) => ({
    timestamp: new Date(T0 + (start + i) * 1000).toISOString(),
    heartRate: 80, bodyTemp: 36.7, ambientTemp: 29, noise: 70, gas: 9, uv: 2,
  }));

describe("live worker updates", () => {
  let admin;
  let workerA;
  let workerB;
  let streams;

  beforeEach(async () => {
    admin = await createUser({ role: "ADMIN" });
    workerA = await createUser({ role: "WORKER", helmetId: "LIVE-A", baselineHeartRate: 72, baselineBodyTemperature: 36.6 });
    workerB = await createUser({ role: "WORKER", helmetId: "LIVE-B", baselineHeartRate: 70, baselineBodyTemperature: 36.5 });
    streams = { admin: fakeStream(), a: fakeStream(), b: fakeStream() };
    notificationStream.subscribe(admin.userId, streams.admin, "ADMIN");
    notificationStream.subscribe(workerA.userId, streams.a, "WORKER");
    notificationStream.subscribe(workerB.userId, streams.b, "WORKER");
  });

  afterEach(() => {
    notificationStream.unsubscribe(admin.userId, streams.admin);
    notificationStream.unsubscribe(workerA.userId, streams.a);
    notificationStream.unsubscribe(workerB.userId, streams.b);
  });

  const liveOf = (stream) => stream.events.filter((e) => e.kind === "WORKER_UPDATE");

  test("a processed upload emits one WORKER_UPDATE with status, latest sample and every trend point", async () => {
    mlService.runRawBatch.mockImplementation(async (readings) => ({ ok: true, results: readings.map(() => ready("WARNING")) }));
    await processPacket({ helmetId: "LIVE-A", samples: samples(3) });

    const [event] = liveOf(streams.admin);
    expect(liveOf(streams.admin)).toHaveLength(1);
    expect(event).toMatchObject({
      kind: "WORKER_UPDATE",
      workerId: workerA.userId,
      helmetId: "LIVE-A",
      ledState: "WARNING",
      status: { operationalState: "WARNING", currentRiskState: "WARNING", dataQualityState: "READY", dataUncertain: false },
      latest: { systemState: "WARNING", smoothedState: "WARNING", confidence: 0.92, dataQuality: "VALID", uncertainReason: null,
        sensors: { heartRate: 80, bodyTemp: 36.7, ambientTemp: 29, noise: 70, gas: 9, uv: 2 } },
    });
    expect(event.points).toHaveLength(3);
    expect(event.points[2]).toMatchObject({ state: "WARNING", confidence: 0.92, dataQuality: "VALID" });
    expect(new Date(event.latest.timestamp).getTime()).toBe(Date.parse(samples(3)[2].timestamp));
  });

  test("UNCERTAIN samples are sent as UNCERTAIN with their reason and no confidence", async () => {
    mlService.runRawBatch.mockImplementation(async (readings) => ({ ok: true, results: readings.map(() => uncertain("SENSOR_WARMUP")) }));
    await processPacket({ helmetId: "LIVE-A", samples: samples(2) });

    const [event] = liveOf(streams.a);
    expect(event.status).toMatchObject({ operationalState: "UNCERTAIN", dataUncertain: true, uncertainReason: "SENSOR_WARMUP" });
    expect(event.latest).toMatchObject({ systemState: "UNCERTAIN", confidence: null, uncertainReason: "SENSOR_WARMUP" });
    expect(event.points.every((p) => p.state === "UNCERTAIN" && p.uncertainReason === "SENSOR_WARMUP" && p.confidence === null)).toBe(true);
  });

  test("updates are scoped: the worker and admins receive them, other workers never do", async () => {
    mlService.runRawBatch.mockImplementation(async (readings) => ({ ok: true, results: readings.map(() => ready("SAFE")) }));
    await processPacket({ helmetId: "LIVE-A", samples: samples(1) });
    await processPacket({ helmetId: "LIVE-B", samples: samples(1, 5) });

    expect(liveOf(streams.admin).map((e) => e.workerId)).toEqual([workerA.userId, workerB.userId]);
    expect(liveOf(streams.a).map((e) => e.workerId)).toEqual([workerA.userId]);
    expect(liveOf(streams.b).map((e) => e.workerId)).toEqual([workerB.userId]);
  });

  test("events carry no personal user data", async () => {
    mlService.runRawBatch.mockImplementation(async (readings) => ({ ok: true, results: readings.map(() => ready("SAFE")) }));
    await processPacket({ helmetId: "LIVE-A", samples: samples(1) });
    const text = JSON.stringify(liveOf(streams.admin)[0]);
    for (const secret of [workerA.name, workerA.email, workerA.nic, "baseline", "passwordHash", "phone"]) {
      expect(text).not.toContain(secret);
    }
  });

  test("emergency activation pushes a status update (EMERGENCY) to the admin", async () => {
    await emergencyService.activateEmergency({ helmetId: "LIVE-A", timestamp: new Date() });
    const event = liveOf(streams.admin).pop();
    expect(event).toMatchObject({ workerId: workerA.userId, status: { operationalState: "EMERGENCY", emergencyActive: true }, latest: null, points: [] });
    expect(liveOf(streams.b)).toHaveLength(0);
  });
});

describe("prediction timeline segments", () => {
  const at = (s) => new Date(Date.UTC(2026, 9, 9, 4, 0, s)).toISOString();

  test("UNCERTAIN periods keep their reason; data quality is summarised per segment", () => {
    const segs = compressPredictionTimeline([
      { timestamp: at(0), state: "UNCERTAIN", uncertainReason: "SENSOR_WARMUP", dataQuality: "UNCERTAIN" },
      { timestamp: at(1), state: "UNCERTAIN", uncertainReason: "SENSOR_WARMUP", dataQuality: "UNCERTAIN" },
      { timestamp: at(2), state: "UNCERTAIN", uncertainReason: "PACKET_LOSS", dataQuality: "UNCERTAIN" },
      { timestamp: at(3), state: "SAFE", confidence: 0.9, dataQuality: "VALID" },
      { timestamp: at(4), state: "SAFE", confidence: 0.8, dataQuality: "IMPUTED" },
    ]);
    expect(segs.map((s) => [s.state, s.uncertainReason, s.pointCount, s.dataQuality])).toEqual([
      ["UNCERTAIN", "SENSOR_WARMUP", 2, "UNCERTAIN"],
      ["UNCERTAIN", "PACKET_LOSS", 1, "UNCERTAIN"],
      ["SAFE", null, 2, "IMPUTED"],
    ]);
    expect(segs[2].avgConfidence).toBeCloseTo(0.85);
  });

  test("a data gap longer than 10 minutes splits an otherwise identical state", () => {
    const segs = compressPredictionTimeline([
      { timestamp: at(0), state: "SAFE", confidence: 0.9 },
      { timestamp: at(300), state: "SAFE", confidence: 0.9 },  // 5 min later: same segment
      { timestamp: at(1000), state: "SAFE", confidence: 0.9 }, // > 10 min later: new segment
    ]);
    expect(segs.map((s) => s.pointCount)).toEqual([2, 1]);
  });
});
