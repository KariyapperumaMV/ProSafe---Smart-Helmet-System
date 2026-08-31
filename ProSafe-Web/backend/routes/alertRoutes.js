const express = require("express");
const router = express.Router();

const { listAlerts, acknowledgeAlert } = require("../controllers/alertController");
const { verifyToken, requireRole } = require("../middleware/authMiddleware");
const { USER_ROLES } = require("../constants/roles");

router.use(verifyToken);

// Both roles may list — WORKER is forcibly self-scoped inside the service.
router.get("/", listAlerts);
// Acknowledgement is a supervisor action only (#2/#3 — Alert.acknowledged
// stays ADMIN-only; a worker's own Notification.read is the separate,
// self-service concept).
router.patch("/:alertId/acknowledge", requireRole(USER_ROLES.ADMIN), acknowledgeAlert);

module.exports = router;
