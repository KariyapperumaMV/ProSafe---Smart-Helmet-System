// Runs before each test file. Sets the env vars the app reads at request
// time (JWT_SECRET) — DB_URI is set per-suite by testDb.js once the
// in-memory Mongo instance is up, since its port isn't known until then.
process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
