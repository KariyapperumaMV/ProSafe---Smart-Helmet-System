// LIVE end-to-end check: backend (in-memory MongoDB, never the real database)
// -> the REAL ProSafe ML V2 service -> storage, LED command, dashboards.
// Skipped unless PROSAFE_V2_LIVE_URL points at a running V2 service, e.g.
//   (ProSafe-ML-V2)  python serve.py
//   (backend)        PROSAFE_V2_LIVE_URL=http://127.0.0.1:8001 npx jest tests/liveV2.e2e.test.js
// Replays real W_001 raw readings (ProSafe-ML-V2/data) as 1 Hz helmet batches.
const fs = require("fs");
const path = require("path");
const request = require("supertest");

const LIVE_URL = process.env.PROSAFE_V2_LIVE_URL;
const describeLive = LIVE_URL ? describe : describe.skip;

const app = require("../app");
const testDb = require("./testDb");
const { createUser, authHeader } = require("./factories");
const processingConfig = require("../config/processingConfig");
const mlService = require("../services/mlService");
const User = require("../models/User");
const HelmetData = require("../models/HelmetData");
const HelmetCommand = require("../models/HelmetCommand");
const Alert = require("../models/Alert");

jest.setTimeout(300000);

function loadW001(n, offset = 0) {
  const file = path.resolve(__dirname, "../../../ProSafe-ML-V2/data/prosafe_W001_ml_ready.csv");
  const [header, ...lines] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const cols = header.split(",");
  const idx = (c) => cols.indexOf(c);
  const num = (v) => (v === "" || v === undefined ? null : Number(v));
  const rows = lines.slice(offset, offset + n).map((l) => l.split(","));
  const hrBl = rows.map((r) => num(r[idx("heart_rate")]) - num(r[idx("hr_deviation_bpm")])).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
  const btBl = rows.map((r) => num(r[idx("body_temperature")]) - num(r[idx("body_temp_deviation_c")])).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
  return {
    hrBaseline: Math.round(hrBl * 100) / 100,
    btBaseline: Math.round(btBl * 100) / 100,
    rows: rows.map((r) => ({
      heartRate: num(r[idx("heart_rate")]), bodyTemp: num(r[idx("body_temperature")]),
      ambientTemp: num(r[idx("ambient_temperature")]), noise: num(r[idx("noise")]),
      gas: num(r[idx("gas")]), uv: num(r[idx("uv_index")]), label: r[idx("risk_level")],
    })),
  };
}

describeLive("LIVE backend -> ProSafe ML V2", () => {
  let admin;
  const data = LIVE_URL ? loadW001(460) : null;
  const elevated = LIVE_URL ? loadW001(700, 5517) : null; // W_001 rows 5517-6216: 613 Warning, 87 Critical labels
  // V2 keeps per-worker streaming state in memory across runs (a replay of
  // already-seen timestamps is correctly OUT_OF_ORDER): a per-run worker number
  // (unique per second, 25 h cycle) keeps reruns from touching a previous run's state.
  const runNo = 1000 + (Math.floor(Date.now() / 1000) % 90000);
  const start = Date.now() - 20 * 60 * 1000;

  beforeAll(async () => {
    await testDb.connect();
    processingConfig.ml.serviceUrl = LIVE_URL;
    admin = await createUser({ role: "ADMIN" });
    await User.create({ userId: `W-${runNo}`, name: "seq", email: `seq${runNo}@x.com`, passwordHash: "x", nic: "123456789V", phone: "0771234567", role: "WORKER", active: false });
  });
  afterAll(testDb.closeDatabase);

  const sample = (i, row) => ({ timestamp: new Date(start + i * 1000).toISOString(), heartRate: row.heartRate, bodyTemp: row.bodyTemp, ambientTemp: row.ambientTemp, noise: row.noise, gas: row.gas, uv: row.uv });
  async function upload(helmetId, from, to, rows) {
    const out = [];
    for (let s = from; s < to; s += 5) {
      const samples = [];
      for (let i = s; i < Math.min(s + 5, to); i++) samples.push(sample(i, rows[i]));
      const res = await request(app).post("/api/helmet/data").send({ helmetId, samples });
      expect(res.status).toBe(201);
      out.push(...res.body.results);
    }
    return out;
  }

  test("health: the backend accepts the running V2 model", async () => {
    const h = await mlService.checkHealth();
    console.log("V2 health:", JSON.stringify(h.health));
    expect(h.ok).toBe(true);
  });

  test("CRUD -> 1 Hz replay -> warm-up UNCERTAIN -> READY XGBoost predictions -> baseline edit restarts the session", async () => {
    const helmetId = `LIVE-H-${runNo}`;
    expect((await request(app).post("/api/helmets").set(authHeader(admin)).send({ helmetId })).status).toBe(201);
    const created = await request(app).post("/api/users").set(authHeader(admin)).send({
      name: "Live Worker", email: `live${runNo}@example.com`, nic: "200012345678", phone: "0771234567",
      role: "WORKER", password: "Passw0rd1", helmetId,
      baselineHeartRate: data.hrBaseline, baselineBodyTemperature: data.btBaseline,
    });
    expect(created.status).toBe(201);
    const workerId = created.body.user.userId;
    expect(created.body.user).toMatchObject({ baselineHeartRate: data.hrBaseline, baselineBodyTemperature: data.btBaseline });

    const results = await upload(helmetId, 0, 400, data.rows);
    const firstReady = results.findIndex((r) => r.systemState !== "UNCERTAIN");
    const warmupReasons = new Set(results.slice(0, firstReady).map((r) => r.uncertainReason));
    const readyStates = results.slice(firstReady).reduce((m, r) => ({ ...m, [r.systemState]: (m[r.systemState] || 0) + 1 }), {});
    const labels = data.rows.slice(firstReady, 400).reduce((m, r) => ({ ...m, [r.label]: (m[r.label] || 0) + 1 }), {});
    console.log(`worker ${workerId}: first READY at sample ${firstReady}; warm-up reasons ${[...warmupReasons]}; READY system states ${JSON.stringify(readyStates)}; offline labels ${JSON.stringify(labels)}`);
    expect(firstReady).toBeGreaterThanOrEqual(180);
    expect([...warmupReasons]).toContain("SENSOR_WARMUP");

    const docs = await HelmetData.find({ workerId }).sort({ timestamp: 1 }).lean();
    expect(docs).toHaveLength(400);
    expect(docs[0].prediction).toMatchObject({ systemState: "UNCERTAIN", probabilities: null, ranMl: false });
    const ready = docs.find((d) => d.prediction.ranMl);
    expect(ready.prediction).toMatchObject({ modelName: "XGBoost", featureSet: "EXTENDED", modelVersion: "prosafe-ml-v2-xgboost-extended-exp2-2026-10-09" });
    expect(typeof ready.processed.heartRateDeviation).toBe("number");

    const detail = await request(app).get(`/api/users/${workerId}`).set(authHeader(admin));
    console.log("operational status:", JSON.stringify({ op: detail.body.operationalState, risk: detail.body.currentRiskState, dq: detail.body.dataQualityState }));
    expect(["SAFE", "WARNING", "CRITICAL"]).toContain(detail.body.operationalState);
    const led = (await HelmetCommand.findOne({ helmetId }).lean()).risk;
    expect(led).toBe(detail.body.operationalState);
    const sessionBefore = docs[docs.length - 1].prediction.sessionId;

    // Admin edits the baseline mid-session -> V2 restarts only this worker's session.
    const edited = await request(app).put(`/api/users/${workerId}`).set(authHeader(admin)).send({ baselineHeartRate: data.hrBaseline + 5, baselineBodyTemperature: data.btBaseline });
    expect(edited.status).toBe(200);
    const after = await upload(helmetId, 400, 430, data.rows);
    const afterDocs = await HelmetData.find({ workerId, timestamp: { $gte: new Date(start + 400 * 1000) } }).sort({ timestamp: 1 }).lean();
    console.log(`after baseline edit: first reasons ${after.slice(0, 3).map((r) => r.uncertainReason)}; READY again at +${after.findIndex((r) => r.systemState !== "UNCERTAIN")} s; session ${sessionBefore} -> ${afterDocs[0].prediction.sessionId}`);
    expect(afterDocs[0].prediction.sessionId).not.toBe(sessionBefore);
    expect(after[0].uncertainReason).toBe("INSUFFICIENT_HISTORY");
    expect(after.some((r) => r.systemState !== "UNCERTAIN")).toBe(true);
  });

  test("worker without a baseline stays UNCERTAIN (BASELINE_UNAVAILABLE) and raises one DATA_QUALITY alert", async () => {
    const helmetId = `LIVE-NB-${runNo}`;
    await request(app).post("/api/helmets").set(authHeader(admin)).send({ helmetId });
    const created = await request(app).post("/api/users").set(authHeader(admin)).send({
      name: "No Baseline", email: `nb${runNo}@example.com`, nic: "200012345679", phone: "0771234567",
      role: "WORKER", password: "Passw0rd1", helmetId,
    });
    expect(created.status).toBe(201);
    const workerId = created.body.user.userId;
    const results = await upload(helmetId, 0, 240, data.rows);
    expect(results.every((r) => r.systemState === "UNCERTAIN")).toBe(true);
    const doc = await HelmetData.findOne({ workerId }).sort({ timestamp: -1 }).lean();
    expect(doc.prediction.uncertainReasons).toContain("BASELINE_UNAVAILABLE");
    const alerts = await Alert.find({ workerId, type: "DATA_QUALITY" }).lean();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].dataQualityReason).toBe("BASELINE_UNAVAILABLE");
    const led = (await HelmetCommand.findOne({ helmetId }).lean()).risk;
    expect(led).toBe("UNCERTAIN");
    const dash = await request(app).get("/api/dashboard/admin").set(authHeader(admin));
    console.log("admin worker status counts:", JSON.stringify(dash.body.workerStatus));
    expect(dash.body.workerStatus.uncertain).toBeGreaterThanOrEqual(1);
  });

  test("a W_001 segment with Warning/Critical labels: predictions, transition alerts and LED follow V2", async () => {
    const helmetId = `LIVE-EL-${runNo}`;
    await request(app).post("/api/helmets").set(authHeader(admin)).send({ helmetId });
    const created = await request(app).post("/api/users").set(authHeader(admin)).send({
      name: "Elevated Replay", email: `el${runNo}@example.com`, nic: "200012345670", phone: "0771234567",
      role: "WORKER", password: "Passw0rd1", helmetId,
      baselineHeartRate: elevated.hrBaseline, baselineBodyTemperature: elevated.btBaseline,
    });
    expect(created.status).toBe(201);
    const workerId = created.body.user.userId;
    const results = await upload(helmetId, 0, 700, elevated.rows);
    const firstReady = results.findIndex((r) => r.systemState !== "UNCERTAIN");
    const count = (xs) => xs.reduce((m, x) => ({ ...m, [x]: (m[x] || 0) + 1 }), {});
    const ready = results.slice(firstReady);
    const labels = elevated.rows.slice(firstReady, 700).map((r) => r.label.toUpperCase());
    const agree = ready.filter((r, i) => r.systemState === labels[i]).length;
    const alerts = await Alert.find({ workerId }).sort({ timestamp: 1 }).lean();
    const led = (await HelmetCommand.findOne({ helmetId }).lean()).risk;
    console.log(`elevated replay: first READY ${firstReady}; system states ${JSON.stringify(count(ready.map((r) => r.systemState)))}; ` +
      `labels ${JSON.stringify(count(labels))}; per-sample agreement ${agree}/${ready.length}; ` +
      `alerts ${JSON.stringify(alerts.map((a) => `${a.type}:${a.previousRiskState}->${a.currentRiskState || a.dataQualityReason}`))}; LED ${led}; ` +
      `UNCERTAIN reasons after warm-up ${JSON.stringify(count(ready.filter((r) => r.systemState === "UNCERTAIN").map((r) => r.uncertainReason)))}`);
    expect(firstReady).toBeGreaterThanOrEqual(180);
    expect(ready.some((r) => r.systemState === "WARNING" || r.systemState === "CRITICAL")).toBe(true);
    expect(alerts.some((a) => a.type === "TRANSITION")).toBe(true);
    const state = (await request(app).get(`/api/users/${workerId}`).set(authHeader(admin))).body;
    expect(led).toBe(state.operationalState === "EMERGENCY" ? led : state.operationalState);
  });
});
