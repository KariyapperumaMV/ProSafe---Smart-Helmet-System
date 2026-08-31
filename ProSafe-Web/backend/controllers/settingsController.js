const appConfig = require("../config/appConfig");
const processingConfig = require("../config/processingConfig");

// GET /api/settings/system-info — any authenticated user. Deliberately
// reports ML integration as "configured" (a boolean derived from whether
// ML_SERVICE_URL is set), never as "online" — this endpoint never actually
// pings the ML service, so claiming Online/Offline would be a lie. Never
// includes ML_SERVICE_URL itself, DB connection info, JWT_SECRET, or any
// other credential/internal-path value.
exports.getSystemInfo = (req, res) => {
  res.status(200).json({
    appName: "ProSafe Smart Helmet",
    role: req.user.role,
    userId: req.user.id,
    timezone: appConfig.timezone,
    apiStatus: "ok",
    mlServiceConfigured: Boolean(processingConfig.ml.serviceUrl),
  });
};

// GET /api/settings/site — ADMIN only (route-level requireRole). Read-only
// by design (#15) — no PATCH exists and none is planned this phase; these
// values only ever change by editing config.env and restarting the server.
exports.getSiteSettings = (req, res) => {
  res.status(200).json({
    siteName: appConfig.siteName,
    siteLatitude: appConfig.siteLatitude,
    siteLongitude: appConfig.siteLongitude,
    siteTimezone: appConfig.siteTimezone,
    helmetOfflineAfterSeconds: appConfig.helmetOfflineAfterSeconds,
  });
};
