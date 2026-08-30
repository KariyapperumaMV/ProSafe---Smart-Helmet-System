// App-wide (not processing-pipeline-specific) configuration. Kept separate
// from processingConfig.js, which is scoped to the normal-condition ML
// pipeline per its own header comment.
module.exports = {
  // Fixed UTC+05:30, no DST — matches Sri Lanka, the project's actual
  // deployment region. Used for all "local calendar day" grouping (7-day
  // daily averages, "today" for the prediction timeline) via MongoDB's
  // timezone-aware date operators and Node's built-in Intl.
  timezone: process.env.APP_TIMEZONE || "Asia/Colombo",
};
