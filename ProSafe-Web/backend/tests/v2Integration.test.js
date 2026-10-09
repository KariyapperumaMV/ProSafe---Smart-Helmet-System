// Backend -> ProSafe ML V2 integration. The real mlService talks HTTP to a
// scripted fake V2 service, so request shape, ordering, failure handling and
// post-processing are exercised end to end without the Python process.
const http = require("http");
const request = require("supertest");

const app = require("../app");
const testDb = require("./testDb");
const { createUser, authHeader } = require("./factories");
const processingConfig = require("../config/processingConfig");
const HelmetData = require("../models/HelmetData");
const WorkerProcessingState = require("../models/WorkerProcessingState");
const HelmetCommand = require("../models/HelmetCommand");
const Alert = require("../models/Alert");
const Notification = require("../models/Notification");
const mlService = require("../services/mlService");

const ID = { model_name: "XGBoost", feature_set: "EXTENDED", model_version: "test-version" };

function v2Ready(cls, p = 0.9, session = "S1") {
  const rest = (1 - p) / 2;
  return {
    ...ID, predicted_class: cls, model_ready: true, data_quality: "VALID", session_id: session,
    probabilities: { SAFE: rest, WARNING: rest, CRITICAL: rest, [cls]: p },
    derived: { hr_deviation_pct: 5, body_temp_deviation_pct: 0.25, noise_critical_exposure_sec: 0,
      hr_warning_exposure_sec: 0, gas_ratio_to_baseline: 1.1, noise_dose_pct: 0.2 },
  };
}
function v2Uncertain(reason, session = "S1", extra = []) {
  return { ...ID, predicted_class: "UNCERTAIN", probabilities: {}, model_ready: false, data_quality: "UNCERTAIN",
    uncertain_reason: reason, uncertain_reasons: [reason, ...extra], session_id: session };
}

// ---------------------------------------------------------------- fake V2
let server;
let calls = [];
let script = () => ({ status: 500, body: {} });
let health = () => ({ status: 200, body: { status: "ok", ...ID, feature_count: 38, raw_endpoint_enabled: true } });

function startFake() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let data = "";
      req.on("data", (c) => { data += c; });
      req.on("end", () => {
        let out;
        if (req.method === "GET" && req.url === "/health") {
          out = health();
        } else if (req.method === "POST" && req.url === "/predict/raw") {
          const { readings } = JSON.parse(data);
          calls.push(readings);
          out = script(readings, calls.length);
        } else {
          out = { status: 404, body: {} };
        }
        res.writeHead(out.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(out.body));
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

// results(readings) -> one V2 result per reading
function respondWith(resultsFor) {
  script = (readings) => {
    const results = resultsFor(readings);
    return { status: 200, body: { results, latest: results[results.length - 1], count: results.length, ...ID } };
  };
}

let fakeUrl;
beforeAll(async () => {
  await testDb.connect();
  fakeUrl = await startFake();
});
beforeEach(() => {
  processingConfig.ml.serviceUrl = fakeUrl;
  calls = [];
});
afterEach(testDb.clearDatabase);
afterAll(async () => {
  await new Promise((r) => server.close(r));
  await testDb.closeDatabase();
});

const T0 = Date.parse("2026-10-09T03:30:00Z"); // 09:00 site time (Asia/Colombo)
function samples(n, startSecond = 0, overrides = {}) {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: new Date(T0 + (startSecond + i) * 1000).toISOString(),
    heartRate: 80, bodyTemp: 36.7, ambientTemp: 29, noise: 70, gas: 9, uv: 3,
    ...overrides,
  }));
}
const post = (body) => request(app).post("/api/helmet/data").send(body);
const stateOf = (workerId) => WorkerProcessingState.findOne({ workerId }).lean();
const led = async (helmetId) => (await HelmetCommand.findOne({ helmetId }).lean())?.risk;

async function worker(helmetId, baselines = { baselineHeartRate: 72, baselineBodyTemperature: 36.6 }) {
  return createUser({ role: "WORKER", helmetId, ...baselines });
}

describe("batch transport and request contract", () => {
  test("samples are forwarded in received order as raw readings with site-local timestamps and baseline context", async () => {
    const w = await worker("H-1");
    respondWith((rs) => rs.map(() => v2Ready("SAFE")));

    const res = await post({ helmetId: "H-1", samples: samples(3, 0, { gas: -1, noise: null }) });
    expect(res.status).toBe(201);
    expect(calls).toHaveLength(1);
    const sent = calls[0];
    expect(sent.map((r) => r.timestamp)).toEqual([
      "2026-10-09T09:00:00.000+05:30", "2026-10-09T09:00:01.000+05:30", "2026-10-09T09:00:02.000+05:30",
    ]);
    // Raw channels + identity + baseline context only — the backend builds no features.
    expect(Object.keys(sent[0]).sort()).toEqual([
      "ambient_temperature", "baseline_body_temperature", "baseline_hr", "body_temperature", "gas",
      "heart_rate", "helmet_id", "noise", "timestamp", "uv_index", "worker_id",
    ]);
    expect(sent[0]).toMatchObject({ worker_id: w.userId, helmet_id: "H-1", baseline_hr: 72, baseline_body_temperature: 36.6, gas: null, noise: null, heart_rate: 80 });

    const docs = await HelmetData.find({ workerId: w.userId }).sort({ timestamp: 1 }).lean();
    expect(docs).toHaveLength(3);
    expect(docs[0].raw).toMatchObject({ gas: null, noise: null, heartRate: 80 });
    expect(docs[0].prediction).toMatchObject({ systemState: "SAFE", modelName: "XGBoost", featureSet: "EXTENDED", modelReady: true, accepted: true });
    expect(docs[0].processed).toMatchObject({ heartRateDeviation: 5, bodyTempDeviation: 0.25 });
    expect(res.body).toMatchObject({ samplesReceived: 3, samplesProcessed: 3, currentRiskState: "SAFE", riskState: "SAFE" });
    expect(await led("H-1")).toBe("SAFE");
  });

  test("legacy single-sample packet is still accepted", async () => {
    await worker("H-2");
    respondWith((rs) => rs.map(() => v2Ready("SAFE")));
    const res = await post({ helmetId: "H-2", ...samples(1)[0] });
    expect(res.status).toBe(201);
    expect(res.body.format).toBe("single");
    expect(calls[0]).toHaveLength(1);
  });

  test("only identity/structure is validated: implausible or missing channel values pass through as data", async () => {
    await worker("H-3");
    respondWith((rs) => rs.map(() => v2Uncertain("SENSOR_UNAVAILABLE")));
    const res = await post({ helmetId: "H-3", samples: samples(1, 0, { heartRate: 999, uv: "bad", bodyTemp: -1 }) });
    expect(res.status).toBe(201);
    expect(calls[0][0]).toMatchObject({ heart_rate: 999, uv_index: null, body_temperature: null });
  });

  test("structural errors are rejected; unassigned helmet is 404", async () => {
    await worker("H-4");
    expect((await post({ samples: samples(1) })).status).toBe(400);
    expect((await post({ helmetId: "H-4", samples: [] })).status).toBe(400);
    expect((await post({ helmetId: "H-4", samples: [{ heartRate: 80 }] })).status).toBe(400);
    expect((await post({ helmetId: "H-4", samples: [{ timestamp: "not a date" }] })).status).toBe(400);
    expect((await post({ helmetId: "NOBODY", samples: samples(1) })).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  test("out-of-order samples are forwarded unchanged and stored as V2 decides (UNCERTAIN)", async () => {
    const w = await worker("H-5");
    respondWith((rs) => rs.map((r, i) => (i === 1 ? v2Uncertain("OUT_OF_ORDER_TIMESTAMP") : v2Ready("SAFE"))));
    const [a, b] = samples(2);
    await post({ helmetId: "H-5", samples: [b, a] });
    expect(calls[0].map((r) => r.timestamp)).toEqual([
      "2026-10-09T09:00:01.000+05:30", "2026-10-09T09:00:00.000+05:30",
    ]);
    const late = await HelmetData.findOne({ workerId: w.userId, timestamp: new Date(a.timestamp) }).lean();
    expect(late.prediction).toMatchObject({ systemState: "UNCERTAIN", uncertainReason: "OUT_OF_ORDER_TIMESTAMP" });
  });

  test("a retried batch is not stored or sent twice", async () => {
    const w = await worker("H-6");
    respondWith((rs) => rs.map(() => v2Ready("SAFE")));
    const batch = { helmetId: "H-6", samples: samples(3) };
    expect((await post(batch)).status).toBe(201);
    const again = await post(batch);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ samplesProcessed: 0, duplicatesSkipped: 3 });
    expect(calls).toHaveLength(1);
    expect(await HelmetData.countDocuments({ workerId: w.userId })).toBe(3);
  });
});

describe("UNCERTAIN handling", () => {
  test("warm-up is UNCERTAIN (never SAFE), then READY predictions establish the risk state", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const w = await worker("H-10");
    respondWith((rs) => rs.map(() => v2Uncertain("SENSOR_WARMUP")));
    await post({ helmetId: "H-10", samples: samples(5) });

    const doc = await HelmetData.findOne({ workerId: w.userId }).lean();
    expect(doc.prediction).toMatchObject({ systemState: "UNCERTAIN", uncertainReason: "SENSOR_WARMUP", ranMl: false, predictedState: null, probabilities: null });
    expect(await led("H-10")).toBe("UNCERTAIN");
    let state = await stateOf(w.userId);
    expect(state.currentRiskState).toBeNull();
    const counts = (await request(app).get("/api/dashboard/admin").set(authHeader(admin))).body.workerStatus;
    expect(counts).toMatchObject({ uncertain: 1, safe: 0 });

    respondWith((rs) => rs.map(() => v2Ready("WARNING")));
    const res = await post({ helmetId: "H-10", samples: samples(3, 5) });
    expect(res.body).toMatchObject({ stateChanged: true, alertGenerated: true, currentRiskState: "WARNING" });
    state = await stateOf(w.userId);
    expect(state.dataQualityState).toBe("READY");
    expect(await led("H-10")).toBe("WARNING");
    const alerts = await Alert.find({ workerId: w.userId }).lean();
    expect(alerts.map((a) => [a.type, a.previousRiskState, a.currentRiskState])).toEqual([["TRANSITION", null, "WARNING"]]);
  });

  test("missing baseline: null baseline sent, UNCERTAIN, one deduplicated DATA_QUALITY alert after 30 s", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const w = await worker("H-11", {});
    respondWith((rs) => rs.map(() => v2Uncertain("BASELINE_UNAVAILABLE", "S1", ["SENSOR_WARMUP"])));

    await post({ helmetId: "H-11", samples: samples(20) });
    expect(calls[0][0]).toMatchObject({ baseline_hr: null, baseline_body_temperature: null });
    expect(await Alert.countDocuments({ type: "DATA_QUALITY" })).toBe(0); // 19 s so far

    const res = await post({ helmetId: "H-11", samples: samples(20, 20) });
    expect(res.body.dataQualityAlertGenerated).toBe(true);
    await post({ helmetId: "H-11", samples: samples(40, 40) });

    const dq = await Alert.find({ type: "DATA_QUALITY" }).lean();
    expect(dq).toHaveLength(1);
    expect(dq[0]).toMatchObject({ workerId: w.userId, dataQualityReason: "BASELINE_UNAVAILABLE" });
    expect(await Notification.countDocuments({ recipientUserId: admin.userId, type: "DATA_QUALITY_ALERT" })).toBe(1);
    const list = await request(app).get("/api/alerts?type=DATA_QUALITY").set(authHeader(admin));
    expect(list.body.alerts[0].label).toBe("Data quality: worker baseline not set");
  });

  test("safety guidance for an UNCERTAIN worker is never worded as safe", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const w = await worker("H-18");
    respondWith((rs) => rs.map(() => v2Uncertain("SENSOR_WARMUP")));
    const now = Date.now() - 5000;
    const benign = Array.from({ length: 3 }, (_, i) => ({ timestamp: new Date(now + i * 1000).toISOString(), heartRate: 72, bodyTemp: 36.6, ambientTemp: 25, noise: 50, gas: 5, uv: 0 }));
    await post({ helmetId: "H-18", samples: benign });
    const res = await request(app).get(`/api/users/${w.userId}/safety-guidance`).set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ operationalState: "UNCERTAIN", mlRiskState: null, dataUncertain: true, uncertainReason: "SENSOR_WARMUP" });
    expect(res.body.summary.title).toBe("Safety status uncertain");
    expect(JSON.stringify(res.body.guidance)).not.toMatch(/within expected operating conditions/);
  });

  test("warm-up alone never raises a DATA_QUALITY alert", async () => {
    await worker("H-12");
    respondWith((rs) => rs.map(() => v2Uncertain("SENSOR_WARMUP", "S1", ["INSUFFICIENT_HISTORY"])));
    await post({ helmetId: "H-12", samples: samples(120) });
    expect(await Alert.countDocuments({ type: "DATA_QUALITY" })).toBe(0);
  });

  test("ML service HTTP error -> samples stored UNCERTAIN / ML_SERVICE_UNAVAILABLE, never SAFE", async () => {
    const w = await worker("H-13");
    script = () => ({ status: 500, body: { message: "boom" } });
    const res = await post({ helmetId: "H-13", samples: samples(3) });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ mlAvailable: false, riskState: "UNCERTAIN", operationalState: "UNCERTAIN", currentRiskState: null });
    const docs = await HelmetData.find({ workerId: w.userId }).lean();
    expect(docs).toHaveLength(3);
    expect(docs.every((d) => d.prediction.systemState === "UNCERTAIN" && d.prediction.uncertainReason === "ML_SERVICE_UNAVAILABLE")).toBe(true);
    expect(await led("H-13")).toBe("UNCERTAIN");
  });

  test("ML service unreachable after a confirmed SAFE -> UNCERTAIN, not SAFE", async () => {
    await worker("H-14");
    respondWith((rs) => rs.map(() => v2Ready("SAFE")));
    await post({ helmetId: "H-14", samples: samples(3) });
    expect(await led("H-14")).toBe("SAFE");

    processingConfig.ml.serviceUrl = "http://127.0.0.1:9"; // nothing listens there
    const res = await post({ helmetId: "H-14", samples: samples(2, 3) });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ riskState: "UNCERTAIN", operationalState: "UNCERTAIN" });
    expect(await led("H-14")).toBe("UNCERTAIN");
  });

  test("a confirmed CRITICAL is not hidden by later uncertain data", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const w = await worker("H-15");
    respondWith((rs) => rs.map(() => v2Ready("CRITICAL")));
    await post({ helmetId: "H-15", samples: samples(3) });
    respondWith((rs) => rs.map(() => v2Uncertain("BODY_CONTACT_FAILURE")));
    const res = await post({ helmetId: "H-15", samples: samples(2, 3) });
    expect(res.body).toMatchObject({ operationalState: "CRITICAL", dataQualityState: "UNCERTAIN", riskState: "CRITICAL" });
    const detail = await request(app).get(`/api/users/${w.userId}`).set(authHeader(admin));
    expect(detail.body).toMatchObject({ operationalState: "CRITICAL", dataUncertain: true, uncertainReason: "BODY_CONTACT_FAILURE" });
  });

  test("a response from the wrong model is refused", async () => {
    const w = await worker("H-16");
    script = (rs) => ({ status: 200, body: { results: rs.map(() => ({ ...v2Ready("SAFE"), model_name: "Logistic Regression" })), model_name: "Logistic Regression", feature_set: "EXTENDED" } });
    await post({ helmetId: "H-16", samples: samples(2) });
    const doc = await HelmetData.findOne({ workerId: w.userId }).lean();
    expect(doc.prediction).toMatchObject({ systemState: "UNCERTAIN", uncertainReason: "ML_SERVICE_UNAVAILABLE" });
  });

  test("low confidence (< 0.70) is stored with its real probabilities as UNCERTAIN / LOW_CONFIDENCE and does not vote", async () => {
    const w = await worker("H-17");
    respondWith((rs) => rs.map(() => v2Ready("CRITICAL", 0.55)));
    await post({ helmetId: "H-17", samples: samples(2) });
    const doc = await HelmetData.findOne({ workerId: w.userId }).lean();
    expect(doc.prediction).toMatchObject({ systemState: "UNCERTAIN", uncertainReason: "LOW_CONFIDENCE", predictedState: "CRITICAL", accepted: false, ranMl: true });
    expect(doc.prediction.probabilities.CRITICAL).toBeCloseTo(0.55);
    const state = await stateOf(w.userId);
    expect(state.predictionHistory).toHaveLength(0);
    expect(state.currentRiskState).toBeNull();
  });
});

describe("smoothing and sessions", () => {
  test("UNCERTAIN never votes; a new V2 session clears history and the confirmed state", async () => {
    const w = await worker("H-20");
    respondWith((rs) => rs.map(() => v2Ready("WARNING")));
    await post({ helmetId: "H-20", samples: samples(3) });

    respondWith(() => [v2Uncertain("PACKET_LOSS"), v2Uncertain("PACKET_LOSS"), v2Uncertain("PACKET_LOSS"), v2Ready("SAFE"), v2Ready("SAFE")]);
    await post({ helmetId: "H-20", samples: samples(5, 3) });
    let state = await stateOf(w.userId);
    expect(state.predictionHistory.map((h) => h.riskLevel)).toEqual(["WARNING", "WARNING", "WARNING", "SAFE", "SAFE"]);
    expect(state.currentRiskState).toBe("WARNING"); // 3 of 5 votes

    respondWith((rs) => rs.map(() => v2Ready("SAFE", 0.9, "S2")));
    await post({ helmetId: "H-20", samples: samples(1, 8) });
    state = await stateOf(w.userId);
    expect(state.lastSessionId).toBe("S2");
    expect(state.predictionHistory.map((h) => h.riskLevel)).toEqual(["SAFE"]);
    expect(state.currentRiskState).toBe("SAFE");
    // Only the first elevation alerted; SAFE established in a fresh session is not an event.
    expect((await Alert.find({ workerId: w.userId }).lean()).map((a) => a.currentRiskState)).toEqual(["WARNING"]);
  });

  test("today's prediction timeline includes UNCERTAIN segments", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const w = await worker("H-21");
    const now = Date.now() - 60 * 1000;
    const recent = (n, start) => Array.from({ length: n }, (_, i) => ({ timestamp: new Date(now + (start + i) * 1000).toISOString(), heartRate: 80, bodyTemp: 36.7, ambientTemp: 29, noise: 70, gas: 9, uv: 3 }));
    respondWith((rs) => rs.map(() => v2Uncertain("SENSOR_WARMUP")));
    await post({ helmetId: "H-21", samples: recent(3, 0) });
    respondWith((rs) => rs.map(() => v2Ready("SAFE")));
    await post({ helmetId: "H-21", samples: recent(3, 3) });
    const res = await request(app).get(`/api/users/${w.userId}/safety-predictions`).set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.todayHistory.map((s) => s.state)).toEqual(["UNCERTAIN", "SAFE"]);
  });
});

describe("critical backstop integration point", () => {
  const backstop = require("../services/criticalBackstopService");
  afterEach(() => jest.restoreAllMocks());

  test("is a no-op by default (no thresholds defined)", () => {
    expect(backstop.evaluate({ raw: { uv: 15 } }, {})).toBeNull();
  });

  test("a backstop result can only raise severity and is flagged on the sample", async () => {
    const w = await worker("H-30");
    jest.spyOn(backstop, "evaluate").mockReturnValue("CRITICAL");
    respondWith(() => [v2Ready("WARNING"), v2Uncertain("SENSOR_WARMUP"), v2Ready("WARNING")]);
    await post({ helmetId: "H-30", samples: samples(3) });
    const docs = await HelmetData.find({ workerId: w.userId }).sort({ timestamp: 1 }).lean();
    expect(docs.map((d) => [d.prediction.systemState, d.prediction.backstopState, d.prediction.predictedState])).toEqual([
      ["CRITICAL", "CRITICAL", "WARNING"],
      ["CRITICAL", "CRITICAL", null],
      ["CRITICAL", "CRITICAL", "WARNING"],
    ]);
    expect((await stateOf(w.userId)).currentRiskState).toBe("CRITICAL");

    backstop.evaluate.mockReturnValue("SAFE"); // never lowers a decision
    respondWith(() => [v2Ready("CRITICAL")]);
    await post({ helmetId: "H-30", samples: samples(1, 3) });
    const last = await HelmetData.findOne({ workerId: w.userId }).sort({ timestamp: -1 }).lean();
    expect(last.prediction).toMatchObject({ systemState: "CRITICAL", backstopState: null });
  });
});

describe("mlService helpers", () => {
  test("checkHealth accepts only the expected model", async () => {
    expect((await mlService.checkHealth()).ok).toBe(true);
    health = () => ({ status: 200, body: { status: "ok", ...ID, feature_count: 26, raw_endpoint_enabled: true } });
    const bad = await mlService.checkHealth();
    expect(bad.ok).toBe(false);
    expect(bad.problems.join(" ")).toMatch(/feature_count/);
    health = () => ({ status: 503, body: { status: "unhealthy", ...ID, feature_count: 38, problems: ["x"] } });
    expect((await mlService.checkHealth()).ok).toBe(false);
  });

  test("timestamps are sent in site-local time with an explicit offset", () => {
    expect(mlService.toSiteIsoString(new Date("2026-10-09T18:45:30.250Z"))).toBe("2026-10-10T00:15:30.250+05:30");
  });
});
