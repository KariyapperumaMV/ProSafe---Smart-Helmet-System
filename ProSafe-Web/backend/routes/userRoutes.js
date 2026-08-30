const express = require("express");
const router = express.Router();

const {
  listUsers,
  getMe,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} = require("../controllers/userController");
const { verifyToken, requireRole } = require("../middleware/authMiddleware");
const { uploadProfileImage } = require("../middleware/upload");
const { USER_ROLES } = require("../constants/roles");

router.use(verifyToken);

// Self-service — before the :id routes so "me" is never treated as an id.
router.get("/me", getMe);

router.get("/", requireRole(USER_ROLES.ADMIN), listUsers);
router.get("/:id", requireRole(USER_ROLES.ADMIN), getUserById);
router.post("/", requireRole(USER_ROLES.ADMIN), uploadProfileImage, createUser);
router.put("/:id", requireRole(USER_ROLES.ADMIN), uploadProfileImage, updateUser);
router.delete("/:id", requireRole(USER_ROLES.ADMIN), deleteUser);

module.exports = router;
