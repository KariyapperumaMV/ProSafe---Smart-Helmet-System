const helmetService = require("../services/helmetService");

function respond(res, result) {
  if (!result.ok) {
    return res.status(result.status).json({ message: result.message });
  }
  return res.status(result.status).json(result.body);
}

// GET /api/helmets — ADMIN only
exports.listHelmets = async (req, res, next) => {
  try {
    const { page, limit, search, assignment, status } = req.query;
    const result = await helmetService.listHelmets({ page, limit, search, assignment, status });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

// GET /api/helmets/:helmetId — ADMIN only
exports.getHelmetDetails = async (req, res, next) => {
  try {
    const result = await helmetService.getHelmetDetails(req.params.helmetId);
    respond(res, result);
  } catch (err) {
    next(err);
  }
};

// POST /api/helmets — ADMIN only
exports.createHelmet = async (req, res, next) => {
  try {
    const result = await helmetService.createHelmet({ helmetId: req.body.helmetId });
    respond(res, result);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Helmet ID already exists" });
    }
    next(err);
  }
};

// DELETE /api/helmets/:helmetId — ADMIN only
exports.deleteHelmet = async (req, res, next) => {
  try {
    const result = await helmetService.deleteHelmet(req.params.helmetId);
    respond(res, result);
  } catch (err) {
    next(err);
  }
};

// GET /api/helmets/assignable — ADMIN only
exports.getAssignableHelmets = async (req, res, next) => {
  try {
    const helmets = await helmetService.getAssignableHelmets(req.query.currentHelmetId);
    res.status(200).json({ helmets });
  } catch (err) {
    next(err);
  }
};
