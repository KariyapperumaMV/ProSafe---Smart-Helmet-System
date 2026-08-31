const analyticsService = require("../services/analyticsService");
const periodService = require("../services/analyticsPeriodService");

// GET /api/analytics — ADMIN only (route-level requireRole). Validates
// period/date itself rather than silently falling back to "today" on a
// malformed explicit value (#32) — only a genuinely OMITTED date defaults.
exports.getAnalytics = async (req, res, next) => {
  try {
    const { period, date, fresh } = req.query;

    const periodType = periodService.validatePeriodType(period);
    if (!periodType) {
      return res.status(400).json({ message: "Invalid or missing period — expected daily, weekly, or monthly" });
    }

    const dateResolution = periodService.resolveDateParam(date);
    if (!dateResolution.ok) {
      return res.status(400).json({ message: dateResolution.error });
    }

    const result = await analyticsService.getAnalytics(periodType, dateResolution.dateStr, { fresh: fresh === "true" });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
