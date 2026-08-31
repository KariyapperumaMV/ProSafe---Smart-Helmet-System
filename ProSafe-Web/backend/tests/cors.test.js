const request = require("supertest");
const app = require("../app");

// Supertest calls the Express app directly, bypassing a real browser's CORS
// preflight enforcement — every PATCH-based endpoint (alert acknowledge,
// notification read/read-all) can pass its own functional tests here while
// still being silently blocked by a real browser if "PATCH" isn't in the
// cors() methods allowlist. This test catches exactly that class of bug by
// asserting on the actual preflight response headers.
describe("CORS preflight — PATCH must be allowed (Mark as Read / read-all / acknowledge)", () => {
  test.each([
    "/api/alerts/000000000000000000000000/acknowledge",
    "/api/notifications/000000000000000000000000/read",
    "/api/notifications/read-all",
  ])("OPTIONS %s allows the PATCH method", async (path) => {
    const res = await request(app)
      .options(path)
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "PATCH");

    expect(res.status).toBeLessThan(400);
    expect(res.headers["access-control-allow-methods"]).toContain("PATCH");
  });
});
