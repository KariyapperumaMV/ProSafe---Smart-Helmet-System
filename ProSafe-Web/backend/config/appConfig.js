// App-wide (not processing-pipeline-specific) configuration. Kept separate
// from processingConfig.js, which is scoped to the normal-condition ML
// pipeline per its own header comment.
const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

module.exports = {
  // Fixed UTC+05:30, no DST — matches Sri Lanka, the project's actual
  // deployment region. Used for all "local calendar day" grouping (7-day
  // daily averages, "today" for the prediction timeline) via MongoDB's
  // timezone-aware date operators and Node's built-in Intl.
  timezone: process.env.APP_TIMEZONE || "Asia/Colombo",

  // A helmet is considered ONLINE if its last HelmetData packet arrived
  // within this many seconds. Normal packets arrive ~60s apart; 180s (3x)
  // tolerates one missed packet without flapping online/offline on every
  // borderline delay. Configurable, not a claim about real device behavior.
  helmetOfflineAfterSeconds: num(process.env.HELMET_OFFLINE_AFTER_SECONDS, 180),

  // Site-wide weather location (Open-Meteo, no API key required) — a single
  // configured point, not derived from any worker's helmet GPS. Left
  // undefined (not silently defaulted) when unset; config.env carries a
  // clearly-labeled Colombo dev placeholder — see the comment there.
  siteLatitude: process.env.SITE_LATITUDE !== undefined ? Number(process.env.SITE_LATITUDE) : null,
  siteLongitude: process.env.SITE_LONGITUDE !== undefined ? Number(process.env.SITE_LONGITUDE) : null,
  siteTimezone: process.env.SITE_TIMEZONE || "Asia/Colombo",

  // A worker's GPS only counts as "currently reporting location" (dashboard
  // location summary) if their latest packet is within this many seconds —
  // reuses the same freshness reasoning as the helmet online/offline rule
  // rather than inventing a second threshold concept. Defaults to the same
  // value unless explicitly overridden.
  locationFreshAfterSeconds: num(process.env.LOCATION_FRESH_AFTER_SECONDS, num(process.env.HELMET_OFFLINE_AFTER_SECONDS, 180)),
};
