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
};
