const testDb = require("./testDb");
const Alert = require("../models/Alert");
const HelmetData = require("../models/HelmetData");
const Helmet = require("../models/Helmet");
const { createUser } = require("./factories");
const periodService = require("../services/analyticsPeriodService");
const analyticsService = require("../services/analyticsService");

const TZ = "Asia/Colombo";

beforeAll(testDb.connect);
afterEach(testDb.clearDatabase);
afterAll(testDb.closeDatabase);

// Resolves a definitely-in-the-past Monday-Sunday week (so Helmet-reliability
// "now" clamping never interferes) by asking periodService for the week
// containing "21 days ago" — never hardcoding a specific calendar date, so
// this test suite stays correct no matter when it's run.
function pastWeek() {
  const past = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(past);
  return periodService.getPeriodBoundaries("weekly", dateStr, TZ);
}

function hoursFrom(start, hours) {
  return new Date(start.getTime() + hours * 60 * 60 * 1000);
}

async function makeAlert(overrides) {
  return Alert.create({
    type: "TRANSITION",
    workerId: "W-DEFAULT",
    helmetId: "PS-DEFAULT",
    timestamp: new Date(),
    previousRiskState: "SAFE",
    currentRiskState: "WARNING",
    ...overrides,
  });
}

async function makePacket(overrides) {
  return HelmetData.create({
    helmetId: "PS-DEFAULT",
    workerId: "W-DEFAULT",
    timestamp: new Date(),
    raw: {},
    processed: {},
    prediction: {},
    ...overrides,
  });
}

describe("analyticsService — period metadata", () => {
  test("weekly result's period block matches periodService's own boundaries", async () => {
    const week = pastWeek();
    const dateStr = week.weekStart;
    const result = await analyticsService.computeAnalytics("weekly", dateStr);

    expect(result.period.type).toBe("weekly");
    expect(result.period.label).toBe(week.label);
    expect(new Date(result.period.start).getTime()).toBe(week.start.getTime());
    expect(new Date(result.period.end).getTime()).toBe(week.end.getTime());
    expect(result.period.timezone).toBe(TZ);
  });
});

describe("analyticsService — alert distribution + summary + worker ranking", () => {
  test("known alert set produces exact distribution, summary totals, and a severity-first worker ranking", async () => {
    const week = pastWeek();
    const { start } = week;
    await createUser({ role: "WORKER", userId: "W-A", name: "Worker A" });
    await createUser({ role: "WORKER", userId: "W-B", name: "Worker B" });
    await createUser({ role: "WORKER", userId: "W-C", name: "Worker C" });

    // W-A: 2 warning, 1 critical, 1 emergency -> total 4 (ranked #1: has an emergency)
    await makeAlert({ workerId: "W-A", helmetId: "PS-A", timestamp: hoursFrom(start, 13), currentRiskState: "WARNING" });
    await makeAlert({ workerId: "W-A", helmetId: "PS-A", timestamp: hoursFrom(start, 33), currentRiskState: "WARNING" }); // Tue 09:00
    await makeAlert({ workerId: "W-A", helmetId: "PS-A", timestamp: hoursFrom(start, 13.25), currentRiskState: "CRITICAL" });
    await makeAlert({
      workerId: "W-A", helmetId: "PS-A", type: "EMERGENCY", previousRiskState: null, currentRiskState: null,
      timestamp: hoursFrom(start, 13.5), acknowledged: true, acknowledgedAt: hoursFrom(start, 13.5 + 2 / 60),
      resolved: true, resolvedAt: hoursFrom(start, 13.5 + 10 / 60),
    });

    // W-B: 1 warning, 2 critical, 0 emergency -> total 3 (ranked #2: no emergency, but has critical)
    await makeAlert({ workerId: "W-B", helmetId: "PS-B", timestamp: hoursFrom(start, 13.75), currentRiskState: "CRITICAL" });
    await makeAlert({ workerId: "W-B", helmetId: "PS-B", timestamp: hoursFrom(start, 57), currentRiskState: "CRITICAL" }); // Wed 09:00
    await makeAlert({ workerId: "W-B", helmetId: "PS-B", timestamp: hoursFrom(start, 57.5), currentRiskState: "WARNING" });

    // W-C: 1 warning only -> total 1 (ranked #3: least severe)
    await makeAlert({ workerId: "W-C", helmetId: "PS-C", timestamp: hoursFrom(start, 81), currentRiskState: "WARNING" }); // Thu 09:00

    const result = await analyticsService.computeAnalytics("weekly", week.weekStart);

    expect(result.alertDistribution).toEqual({ warning: 4, critical: 3, emergency: 1 });
    expect(result.summary.totalAlerts).toBe(8);
    expect(result.summary.warningAlerts).toBe(4);
    expect(result.summary.criticalAlerts).toBe(3);
    expect(result.summary.emergencyAlerts).toBe(1);
    expect(result.summary.workersWithActivity).toBe(3);

    const ranking = result.workersRequiringAttention;
    expect(ranking.map((w) => w.workerId)).toEqual(["W-A", "W-B", "W-C"]);
    expect(ranking[0]).toMatchObject({ workerId: "W-A", workerName: "Worker A", warning: 2, critical: 1, emergency: 1, totalAlerts: 4 });
    expect(ranking[1]).toMatchObject({ workerId: "W-B", warning: 1, critical: 2, emergency: 0, totalAlerts: 3 });
    expect(ranking[2]).toMatchObject({ workerId: "W-C", warning: 1, critical: 0, emergency: 0, totalAlerts: 1 });

    // Alert response: 3 acknowledged (the two hour-13 non-emergency alerts
    // were NOT acknowledged in this test — only the emergency was), 1
    // resolved emergency with a 10-minute resolution time.
    expect(result.alertResponse.total).toBe(8);
    expect(result.alertResponse.acknowledged).toBe(1);
    expect(result.alertResponse.unacknowledged).toBe(7);
    expect(result.alertResponse.avgAcknowledgementMinutes).toBe(2);
    expect(result.alertResponse.resolvedEmergencies).toBe(1);
    expect(result.alertResponse.unresolvedEmergencies).toBe(0);
    expect(result.alertResponse.avgResolutionMinutes).toBe(10);
    expect(result.alertResponse.resolutionSamples).toBe(1);
  });

  test("an alert whose worker has since been removed still contributes via the raw workerId fallback", async () => {
    const week = pastWeek();
    await makeAlert({ workerId: "W-LONG-GONE", helmetId: "PS-X", timestamp: hoursFrom(week.start, 10), currentRiskState: "WARNING" });

    const result = await analyticsService.computeAnalytics("weekly", week.weekStart);
    const row = result.workersRequiringAttention.find((w) => w.workerId === "W-LONG-GONE");
    expect(row).toBeDefined();
    expect(row.workerName).toBe("W-LONG-GONE"); // fallback, not dropped
  });
});

describe("analyticsService — high-risk times (severity-first, deterministic)", () => {
  test("the hour with the only emergency wins even though another hour has more total alerts", async () => {
    const week = pastWeek();
    const { start } = week;

    // Hour 13: 1 warning + 2 critical + 1 emergency = 4 alerts, has the emergency.
    await makeAlert({ workerId: "W-A", timestamp: hoursFrom(start, 13), currentRiskState: "WARNING" });
    await makeAlert({ workerId: "W-A", timestamp: hoursFrom(start, 13.1), currentRiskState: "CRITICAL" });
    await makeAlert({ workerId: "W-B", timestamp: hoursFrom(start, 13.2), currentRiskState: "CRITICAL" });
    await makeAlert({
      workerId: "W-A", type: "EMERGENCY", previousRiskState: null, currentRiskState: null, timestamp: hoursFrom(start, 13.3),
    });

    // Hour 9 (next day): 3 warning + 1 critical = 4 alerts, no emergency — same total as hour 13, must rank LOWER.
    await makeAlert({ workerId: "W-C", timestamp: hoursFrom(start, 33), currentRiskState: "WARNING" });
    await makeAlert({ workerId: "W-C", timestamp: hoursFrom(start, 33.1), currentRiskState: "WARNING" });
    await makeAlert({ workerId: "W-C", timestamp: hoursFrom(start, 33.2), currentRiskState: "WARNING" });
    await makeAlert({ workerId: "W-C", timestamp: hoursFrom(start, 33.3), currentRiskState: "CRITICAL" });

    const result = await analyticsService.computeAnalytics("weekly", week.weekStart);
    expect(result.highRiskTimes[0]).toMatchObject({ hour: 13, label: "13:00–14:00", totalAlerts: 4, warning: 1, critical: 2, emergency: 1 });
    expect(result.highRiskTimes[1]).toMatchObject({ hour: 9, totalAlerts: 4, warning: 3, critical: 1, emergency: 0 });
  });
});

describe("analyticsService — risk trend (zero-filled buckets)", () => {
  test("daily mode groups by hour and zero-fills every hour with no activity", async () => {
    const week = pastWeek();
    const dayStart = week.start; // Monday 00:00 Colombo
    const dayStr = week.weekStart;
    await makeAlert({ workerId: "W-A", timestamp: hoursFrom(dayStart, 8), currentRiskState: "WARNING" });
    await makeAlert({ workerId: "W-A", timestamp: hoursFrom(dayStart, 8.1), currentRiskState: "WARNING" });

    const result = await analyticsService.computeAnalytics("daily", dayStr);
    expect(result.riskTrend).toHaveLength(24);
    const hour8 = result.riskTrend.find((r) => r.bucket === "08:00");
    expect(hour8).toEqual({ bucket: "08:00", warning: 2, critical: 0, emergency: 0 });
    const hour0 = result.riskTrend.find((r) => r.bucket === "00:00");
    expect(hour0).toEqual({ bucket: "00:00", warning: 0, critical: 0, emergency: 0 });
  });

  test("weekly mode groups by calendar day, 7 buckets, Monday first", async () => {
    const week = pastWeek();
    await makeAlert({ workerId: "W-A", timestamp: hoursFrom(week.start, 10), currentRiskState: "CRITICAL" });

    const result = await analyticsService.computeAnalytics("weekly", week.weekStart);
    expect(result.riskTrend).toHaveLength(7);
    expect(result.riskTrend[0].bucket).toBe(week.weekStart);
    expect(result.riskTrend[0].critical).toBe(1);
    expect(result.riskTrend.slice(1).every((r) => r.warning === 0 && r.critical === 0 && r.emergency === 0)).toBe(true);
  });
});

describe("analyticsService — environmental analytics", () => {
  test("known ambientTemp readings produce exact avg/min/max/counts/percentages", async () => {
    const week = pastWeek();
    const { start } = week;
    await makePacket({ workerId: "W-A", helmetId: "PS-A", timestamp: hoursFrom(start, 1), raw: { ambientTemp: 25 } }); // SAFE
    await makePacket({ workerId: "W-A", helmetId: "PS-A", timestamp: hoursFrom(start, 2), raw: { ambientTemp: 30 } }); // WARNING
    await makePacket({ workerId: "W-A", helmetId: "PS-A", timestamp: hoursFrom(start, 3), raw: { ambientTemp: 40 } }); // CRITICAL

    const result = await analyticsService.computeAnalytics("weekly", week.weekStart);
    const env = result.environment.summary.ambientTemperature;
    expect(env.totalReadings).toBe(3);
    expect(env.avg).toBe(31.7); // (25+30+40)/3 = 31.666... -> 31.7
    expect(env.min).toBe(25);
    expect(env.max).toBe(40);
    expect(env.warningReadings).toBe(1);
    expect(env.criticalReadings).toBe(1);
    expect(env.warningPercent).toBe(33.3);
    expect(env.criticalPercent).toBe(33.3);
  });

  test("a sensor with zero valid readings in the period reports nulls, not a crash", async () => {
    const week = pastWeek();
    const result = await analyticsService.computeAnalytics("weekly", week.weekStart);
    const env = result.environment.summary.noise;
    expect(env).toEqual({ avg: null, min: null, max: null, totalReadings: 0, warningReadings: 0, criticalReadings: 0, warningPercent: null, criticalPercent: null });
  });

  test("critical-breach-day counting: noise critical on 2 distinct days is reported as 2, not per-reading", async () => {
    const week = pastWeek();
    const { start } = week;
    // Day 1 (Monday): two critical noise readings, same day.
    await makePacket({ workerId: "W-A", timestamp: hoursFrom(start, 9), raw: { noise: 90 } });
    await makePacket({ workerId: "W-A", timestamp: hoursFrom(start, 10), raw: { noise: 92 } });
    // Day 2 (Tuesday): one critical noise reading.
    await makePacket({ workerId: "W-A", timestamp: hoursFrom(start, 33), raw: { noise: 95 } });

    const result = await analyticsService.computeAnalytics("weekly", week.weekStart);
    expect(result.environment.criticalDaysBySensor.noise).toBe(2);
    expect(result.insights.some((i) => i.includes("Sound Level exceeded the configured Critical threshold on 2 of the 7 days"))).toBe(true);
  });
});

describe("analyticsService — health deviations", () => {
  test("heart rate: avgAbs/maxAbs/direction/significantEvents computed correctly against the real configured threshold", async () => {
    const week = pastWeek();
    const { start } = week;
    await makePacket({ workerId: "W-A", timestamp: hoursFrom(start, 1), processed: { heartRateDeviation: 25 } }); // above baseline, matches logic.docx example
    await makePacket({ workerId: "W-B", timestamp: hoursFrom(start, 2), processed: { heartRateDeviation: -30 } }); // below baseline, larger magnitude

    const result = await analyticsService.computeAnalytics("weekly", week.weekStart);
    const hr = result.health.heartRate;
    expect(hr.avgAbsDeviationPct).toBe(27.5); // (25+30)/2
    expect(hr.maxAbsDeviationPct).toBe(30);
    expect(hr.maxDeviationDirection).toBe("below");
    expect(hr.thresholdConfigured).toBe(true);
    expect(hr.significantEvents).toBe(2); // both |25| and |30| >= EXPOSURE_HR_DEVIATION_THRESHOLD_PCT (20)
    expect(hr.topWorkers[0]).toMatchObject({ workerId: "W-B", maxAbsDeviationPct: 30 });
  });

  test("body temperature: avg/max/direction still work, but significantEvents is null when no threshold is configured (#4)", async () => {
    const week = pastWeek();
    const { start } = week;
    await makePacket({ workerId: "W-A", timestamp: hoursFrom(start, 1), processed: { bodyTempDeviation: 10 } });
    await makePacket({ workerId: "W-B", timestamp: hoursFrom(start, 2), processed: { bodyTempDeviation: -15 } });

    const result = await analyticsService.computeAnalytics("weekly", week.weekStart);
    const bt = result.health.bodyTemperature;
    expect(bt.avgAbsDeviationPct).toBe(12.5);
    expect(bt.maxAbsDeviationPct).toBe(15);
    expect(bt.maxDeviationDirection).toBe("below");
    expect(bt.thresholdConfigured).toBe(false);
    expect(bt.significantEvents).toBeNull(); // never fabricated
  });
});

describe("analyticsService — exposure (longest streak, never a naive sum)", () => {
  test("MAX per worker is used, not SUM — a multi-packet streak is not multiply-counted", async () => {
    const week = pastWeek();
    const { start } = week;
    // W-A's noise streak climbs 60 -> 120 -> 180 (one continuous streak) then
    // resets to 0. The true streak length is 180s, NOT 60+120+180=360.
    await makePacket({ workerId: "W-A", timestamp: hoursFrom(start, 1), processed: { noiseExposureDuration: 60 } });
    await makePacket({ workerId: "W-A", timestamp: hoursFrom(start, 1.02), processed: { noiseExposureDuration: 120 } });
    await makePacket({ workerId: "W-A", timestamp: hoursFrom(start, 1.04), processed: { noiseExposureDuration: 180 } });
    await makePacket({ workerId: "W-A", timestamp: hoursFrom(start, 1.06), processed: { noiseExposureDuration: 0 } });

    const result = await analyticsService.computeAnalytics("weekly", week.weekStart);
    const top = result.exposure.noise.topWorkers.find((w) => w.workerId === "W-A");
    expect(top.longestStreakSeconds).toBe(180);
  });

  test("heart-rate exposure streak is tracked independently of noise", async () => {
    const week = pastWeek();
    const { start } = week;
    await makePacket({ workerId: "W-C", timestamp: hoursFrom(start, 1), processed: { heartRateExposureDuration: 480 } }); // 8 min, matches logic.docx example

    const result = await analyticsService.computeAnalytics("weekly", week.weekStart);
    const top = result.exposure.heartRate.topWorkers.find((w) => w.workerId === "W-C");
    expect(top.longestStreakSeconds).toBe(480);
  });
});

describe("analyticsService — helmet reliability", () => {
  test("registered/reporting/no-data counts are correct, and reporting coverage is bounded by the helmet's own registration time", async () => {
    const week = pastWeek();
    const oldCreatedAt = new Date(week.start.getTime() - 30 * 24 * 60 * 60 * 1000); // long before the period

    await Helmet.create({ helmetId: "PS-A", createdAt: oldCreatedAt });
    await Helmet.create({ helmetId: "PS-B", createdAt: oldCreatedAt });
    // PS-NEW was only registered 10 minutes before the period ends — its
    // expected-packet window must be clamped to those 10 minutes, not the
    // full 7-day period, so it isn't unfairly penalized for not existing yet.
    const tenMinBeforeEnd = new Date(week.end.getTime() - 10 * 60 * 1000);
    await Helmet.create({ helmetId: "PS-NEW", createdAt: tenMinBeforeEnd });
    await Helmet.create({ helmetId: "PS-NO-DATA", createdAt: oldCreatedAt }); // registered, but never sends data

    await makePacket({ helmetId: "PS-A", workerId: "W-A", timestamp: hoursFrom(week.start, 1) });
    await makePacket({ helmetId: "PS-B", workerId: "W-B", timestamp: hoursFrom(week.start, 2) });
    // 8 packets within PS-NEW's 10-minute window -> expected 10, actual 8 -> 80%.
    for (let i = 0; i < 8; i++) {
      await makePacket({ helmetId: "PS-NEW", workerId: "W-D", timestamp: new Date(tenMinBeforeEnd.getTime() + i * 60 * 1000) });
    }

    const result = await analyticsService.computeAnalytics("weekly", week.weekStart);
    const rel = result.helmetReliability;
    expect(rel.registeredActiveHelmets).toBe(4);
    expect(rel.reportingDuringPeriod).toBe(3); // PS-A, PS-B, PS-NEW
    expect(rel.noDataDuringPeriod).toEqual(["PS-NO-DATA"]);

    const psNew = rel.reportingCoverage.find((c) => c.helmetId === "PS-NEW");
    expect(psNew.expectedPackets).toBe(10);
    expect(psNew.actualPackets).toBe(8);
    expect(psNew.coveragePercent).toBe(80);

    const psNoData = rel.reportingCoverage.find((c) => c.helmetId === "PS-NO-DATA");
    expect(psNoData.actualPackets).toBe(0);
    expect(psNoData.coveragePercent).toBe(0);
  });

  test("insights flag helmets with no data during the period", async () => {
    const week = pastWeek();
    await Helmet.create({ helmetId: "PS-SILENT", createdAt: new Date(week.start.getTime() - 1000) });
    const result = await analyticsService.computeAnalytics("weekly", week.weekStart);
    expect(result.insights.some((i) => i.includes("1 registered helmet(s) did not report data") && i.includes("PS-SILENT"))).toBe(true);
  });
});

describe("analyticsService — previous-period comparison", () => {
  test("percent change is correct, and previous=0/current>0 is null (never Infinity or a fabricated number)", async () => {
    const week = pastWeek();
    const { start, previous } = week;

    // Current week: 4 warning, 3 critical, 1 emergency (8 total).
    for (let i = 0; i < 4; i++) await makeAlert({ workerId: "W-A", timestamp: hoursFrom(start, i), currentRiskState: "WARNING" });
    for (let i = 0; i < 3; i++) await makeAlert({ workerId: "W-A", timestamp: hoursFrom(start, 4 + i), currentRiskState: "CRITICAL" });
    await makeAlert({ workerId: "W-A", type: "EMERGENCY", previousRiskState: null, currentRiskState: null, timestamp: hoursFrom(start, 7) });

    // Previous week: 6 warning, 4 critical, 0 emergency (10 total).
    for (let i = 0; i < 6; i++) await makeAlert({ workerId: "W-A", timestamp: hoursFrom(previous.start, i), currentRiskState: "WARNING" });
    for (let i = 0; i < 4; i++) await makeAlert({ workerId: "W-A", timestamp: hoursFrom(previous.start, 6 + i), currentRiskState: "CRITICAL" });

    const result = await analyticsService.computeAnalytics("weekly", week.weekStart);
    expect(result.comparison.totalAlerts).toBe(-20); // (8-10)/10 * 100
    expect(result.comparison.warningAlerts).toBe(-33.3); // (4-6)/6 * 100
    expect(result.comparison.criticalAlerts).toBe(-25); // (3-4)/4 * 100
    expect(result.comparison.emergencyAlerts).toBeNull(); // previous 0, current 1 -> N/A, not Infinity
  });

  test("previous=0 and current=0 is a real 0%, not null", async () => {
    const week = pastWeek();
    const result = await analyticsService.computeAnalytics("weekly", week.weekStart);
    expect(result.comparison.totalAlerts).toBe(0);
    expect(result.comparison.emergencyAlerts).toBe(0);
  });
});

describe("analyticsService — insights are omitted when the underlying data is empty", () => {
  test("an empty period produces an empty insights array, not manufactured statements", async () => {
    const week = pastWeek();
    const result = await analyticsService.computeAnalytics("weekly", week.weekStart);
    expect(result.insights).toEqual([]);
    expect(result.riskTrend.every((r) => r.warning === 0 && r.critical === 0 && r.emergency === 0)).toBe(true);
    expect(result.workersRequiringAttention).toEqual([]);
    expect(result.highRiskTimes).toEqual([]);
  });
});

describe("analyticsService — caching", () => {
  test("a second call within the TTL returns a cached result without recomputing", async () => {
    const week = pastWeek();
    await makeAlert({ workerId: "W-A", timestamp: hoursFrom(week.start, 1), currentRiskState: "WARNING" });

    const first = await analyticsService.getAnalytics("weekly", week.weekStart);
    expect(first.summary.totalAlerts).toBe(1);

    // Insert another alert directly, bypassing the service — a cached
    // (non-fresh) call must NOT see it.
    await makeAlert({ workerId: "W-A", timestamp: hoursFrom(week.start, 2), currentRiskState: "WARNING" });
    const cached = await analyticsService.getAnalytics("weekly", week.weekStart);
    expect(cached.summary.totalAlerts).toBe(1); // still the stale cached value

    const fresh = await analyticsService.getAnalytics("weekly", week.weekStart, { fresh: true });
    expect(fresh.summary.totalAlerts).toBe(2); // fresh:true bypasses the cache
  });
});
