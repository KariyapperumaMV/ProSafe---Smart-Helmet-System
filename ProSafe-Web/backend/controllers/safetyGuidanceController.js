const safetyGuidanceService = require("../services/safetyGuidanceService");

// GET /api/users/:id/safety-guidance — mounted behind requireSelfOrAdmin("id")
// in userRoutes.js, same as the sensor-history/safety-predictions routes.
// viewerRole (req.user.role) decides the returned guidance[] wording
// server-side — the response never carries both ADMIN and WORKER text.
exports.getSafetyGuidance = async (req, res, next) => {
  try {
    const result = await safetyGuidanceService.getSafetyGuidance(req.params.id, req.user.role);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }
    res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
};
