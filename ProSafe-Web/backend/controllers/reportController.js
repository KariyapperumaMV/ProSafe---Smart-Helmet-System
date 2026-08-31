const reportService = require("../services/reportService");
const periodService = require("../services/analyticsPeriodService");

// GET /api/analytics/report — ADMIN only (route-level requireRole). Same
// validation as GET /api/analytics — a malformed explicit period/date is a
// 400, never silently defaulted.
exports.getReport = async (req, res, next) => {
  try {
    const { period, date, format } = req.query;

    if (format !== undefined && format !== "pdf") {
      return res.status(400).json({ message: "Unsupported format — only pdf is currently available" });
    }

    const periodType = periodService.validatePeriodType(period);
    if (!periodType) {
      return res.status(400).json({ message: "Invalid or missing period — expected daily, weekly, or monthly" });
    }

    const dateResolution = periodService.resolveDateParam(date);
    if (!dateResolution.ok) {
      return res.status(400).json({ message: dateResolution.error });
    }

    const { buffer, filename } = await reportService.generateReportPdf(periodType, dateResolution.dateStr);

    res.status(200);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.length,
    });
    res.send(buffer);
  } catch (err) {
    next(err);
  }
};
