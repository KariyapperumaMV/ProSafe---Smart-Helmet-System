const express = require("express");
const router = express.Router();

const { getAnalytics } = require("../controllers/analyticsController");
const { getReport } = require("../controllers/reportController");
const { verifyToken, requireRole } = require("../middleware/authMiddleware");
const { USER_ROLES } = require("../constants/roles");

// Analytics and Reports are ADMIN-only — a worker gets 403 from the API
// itself, not just a hidden sidebar link (frontend RoleRoute is a UX
// convenience, never the actual security boundary).
router.use(verifyToken, requireRole(USER_ROLES.ADMIN));

router.get("/", getAnalytics);
router.get("/report", getReport);

module.exports = router;
