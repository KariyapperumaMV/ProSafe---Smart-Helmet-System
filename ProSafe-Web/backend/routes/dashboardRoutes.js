const express = require("express");
const router = express.Router();

const { getAdminDashboard, getWorkerDashboard } = require("../controllers/dashboardController");
const { verifyToken, requireRole } = require("../middleware/authMiddleware");
const { USER_ROLES } = require("../constants/roles");

router.use(verifyToken);

router.get("/admin", requireRole(USER_ROLES.ADMIN), getAdminDashboard);
router.get("/worker", requireRole(USER_ROLES.WORKER), getWorkerDashboard);

module.exports = router;
