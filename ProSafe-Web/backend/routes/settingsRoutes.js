const express = require("express");
const router = express.Router();

const { getSystemInfo, getSiteSettings } = require("../controllers/settingsController");
const { verifyToken, requireRole } = require("../middleware/authMiddleware");
const { USER_ROLES } = require("../constants/roles");

router.use(verifyToken);

router.get("/system-info", getSystemInfo);
router.get("/site", requireRole(USER_ROLES.ADMIN), getSiteSettings);

module.exports = router;
