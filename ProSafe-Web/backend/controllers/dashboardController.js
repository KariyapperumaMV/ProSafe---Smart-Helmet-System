const dashboardService = require("../services/dashboardService");

// GET /api/dashboard/admin — ADMIN only
exports.getAdminDashboard = async (req, res, next) => {
  try {
    const data = await dashboardService.getAdminDashboard();
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

// GET /api/dashboard/worker — WORKER only. Identity is always req.user.id —
// never a param/query/body value — so a worker can only ever see their own
// dashboard.
exports.getWorkerDashboard = async (req, res, next) => {
  try {
    const result = await dashboardService.getWorkerDashboard(req.user.id);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }
    res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
};
