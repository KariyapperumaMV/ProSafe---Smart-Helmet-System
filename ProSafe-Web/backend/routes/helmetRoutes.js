const express = require("express");
const router = express.Router();

const {
  listHelmets,
  getHelmetDetails,
  createHelmet,
  deleteHelmet,
  getAssignableHelmets,
} = require("../controllers/helmetController");
const { verifyToken, requireRole } = require("../middleware/authMiddleware");
const { USER_ROLES } = require("../constants/roles");

router.use(verifyToken, requireRole(USER_ROLES.ADMIN));

// Literal path before /:helmetId so it's never swallowed by the param route.
router.get("/assignable", getAssignableHelmets);

router.get("/", listHelmets);
router.post("/", createHelmet);
router.get("/:helmetId", getHelmetDetails);
router.delete("/:helmetId", deleteHelmet);

module.exports = router;
