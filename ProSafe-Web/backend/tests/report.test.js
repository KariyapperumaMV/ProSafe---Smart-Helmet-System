const request = require("supertest");
const app = require("../app");
const testDb = require("./testDb");
const { createUser, authHeader } = require("./factories");
const Alert = require("../models/Alert");
const reportService = require("../services/reportService");
const periodService = require("../services/analyticsPeriodService");

beforeAll(testDb.connect);
afterEach(testDb.clearDatabase);
afterAll(testDb.closeDatabase);

describe("GET /api/analytics/report — RBAC", () => {
  test("unauthenticated -> 401", async () => {
    const res = await request(app).get("/api/analytics/report").query({ period: "weekly", date: "2026-08-31" });
    expect(res.status).toBe(401);
  });

  test("WORKER -> 403", async () => {
    const worker = await createUser({ role: "WORKER" });
    const res = await request(app)
      .get("/api/analytics/report")
      .query({ period: "weekly", date: "2026-08-31" })
      .set(authHeader(worker));
    expect(res.status).toBe(403);
  });

  test("ADMIN can download a PDF", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app)
      .get("/api/analytics/report")
      .query({ period: "weekly", date: "2026-08-31" })
      .set(authHeader(admin))
      .buffer(true)
      .parse((res, callback) => {
        res.setEncoding("binary");
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => callback(null, Buffer.from(data, "binary")));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.body.length).toBeGreaterThan(500);
    expect(res.body.slice(0, 4).toString()).toBe("%PDF"); // a real PDF, not garbage
  });
});

describe("GET /api/analytics/report — validation", () => {
  test("invalid period -> 400", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app)
      .get("/api/analytics/report")
      .query({ period: "yearly", date: "2026-08-31" })
      .set(authHeader(admin));
    expect(res.status).toBe(400);
  });

  test("unsupported format -> 400 (only pdf is available)", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app)
      .get("/api/analytics/report")
      .query({ period: "weekly", date: "2026-08-31", format: "csv" })
      .set(authHeader(admin));
    expect(res.status).toBe(400);
  });

  test("malformed date -> 400", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const res = await request(app)
      .get("/api/analytics/report")
      .query({ period: "daily", date: "not-a-date" })
      .set(authHeader(admin));
    expect(res.status).toBe(400);
  });
});

describe("reportService.generateReportPdf — filenames reflect the resolved period", () => {
  test("weekly filename contains the Monday-Sunday date range", async () => {
    const { filename, analytics } = await reportService.generateReportPdf("weekly", "2026-08-31");
    expect(filename).toBe("ProSafe-Weekly-Safety-Report-2026-08-31_to_2026-09-06.pdf");
    expect(analytics.period.weekStart).toBe("2026-08-31");
    expect(analytics.period.weekEnd).toBe("2026-09-06");
  });

  test("monthly filename contains YYYY-MM", async () => {
    const { filename } = await reportService.generateReportPdf("monthly", "2026-08-15");
    expect(filename).toBe("ProSafe-Monthly-Safety-Report-2026-08.pdf");
  });

  test("daily filename contains the exact date", async () => {
    const { filename } = await reportService.generateReportPdf("daily", "2026-08-31");
    expect(filename).toBe("ProSafe-Daily-Safety-Report-2026-08-31.pdf");
  });

  test("the report's analytics use the configured Asia/Colombo timezone", async () => {
    const { analytics } = await reportService.generateReportPdf("weekly", "2026-08-31");
    expect(analytics.period.timezone).toBe("Asia/Colombo");
  });
});

describe("reportService.generateReportPdf — empty data", () => {
  test("a period with no data at all still produces a valid, non-empty PDF (never a crash)", async () => {
    const { buffer, analytics } = await reportService.generateReportPdf("monthly", "2019-01-15");
    expect(buffer.slice(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(500);
    expect(analytics.summary.totalAlerts).toBe(0);
    expect(analytics.workersRequiringAttention).toEqual([]);
  });
});

describe("reportService.generateReportPdf — resolvedAt-null legacy emergencies are excluded from the resolution-time average", () => {
  test("a legacy resolved:true/resolvedAt:null alert counts toward resolvedEmergencies but not the average", async () => {
    // A date not reused by any other test in this file — analyticsService
    // caches by period+date, and a shared date here would silently return
    // another test's (empty) cached result instead of seeing this seed.
    const isolatedDate = "2026-08-24";
    const week = periodService.getPeriodBoundaries("weekly", isolatedDate, "Asia/Colombo");
    await Alert.create({
      type: "EMERGENCY", workerId: "W-LEGACY", helmetId: "PS-LEGACY",
      timestamp: new Date(week.start.getTime() + 3600000),
      resolved: true, resolvedAt: null, // pre-existing historical row, never backfilled
    });

    const { analytics } = await reportService.generateReportPdf("weekly", isolatedDate);
    expect(analytics.alertResponse.resolvedEmergencies).toBe(1);
    expect(analytics.alertResponse.avgResolutionMinutes).toBeNull();
    expect(analytics.alertResponse.resolutionSamples).toBe(0);
  });
});
