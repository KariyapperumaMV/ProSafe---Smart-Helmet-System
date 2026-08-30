const express = require("express");
const router = express.Router();

const { getAssignableHelmets, registerHelmet } = require("../controllers/helmetController");
const { verifyToken, requireRole } = require("../middleware/authMiddleware");
const { USER_ROLES } = require("../constants/roles");

router.use(verifyToken, requireRole(USER_ROLES.ADMIN));

router.get("/assignable", getAssignableHelmets);
router.post("/", registerHelmet);

module.exports = router;
