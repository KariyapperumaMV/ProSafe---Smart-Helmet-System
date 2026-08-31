const alertService = require("../services/alertService");

// GET /api/alerts — ADMIN sees the organization; WORKER is forcibly scoped
// to their own alerts inside alertService.listAlerts (req.user, never a
// query param, decides the scope).
exports.listAlerts = async (req, res, next) => {
  try {
    const { type, risk, acknowledged, resolved, page, limit, days } = req.query;
    // `days` is opt-in: the Dashboard's Recent Alerts card always passes
    // days=7 (#7 in the approved plan); omitting it (e.g. for a future
    // Analytics page) returns full history — the bound lives in the
    // caller, not baked into the shared endpoint.
    const daysNum = parseInt(days, 10);
    const sinceDate = Number.isFinite(daysNum) && daysNum > 0 ? new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000) : undefined;

    const result = await alertService.listAlerts({
      requesterRole: req.user.role,
      requesterId: req.user.id,
      type,
      risk,
      acknowledged,
      resolved,
      sinceDate,
      page,
      limit,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/alerts/:alertId/acknowledge — ADMIN only (route-level
// requireRole), so req.user.id here is always the acting admin.
exports.acknowledgeAlert = async (req, res, next) => {
  try {
    const result = await alertService.acknowledgeAlert(req.params.alertId, req.user.id);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }
    res.status(200).json({ alert: result.body });
  } catch (err) {
    next(err);
  }
};
