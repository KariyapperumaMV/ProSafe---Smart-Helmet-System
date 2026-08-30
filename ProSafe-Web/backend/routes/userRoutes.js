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
const {
  getHeartRate,
  getBodyTemperature,
  getNoise,
  getGas,
  getUv,
  getAmbientTemperature,
  getSafetyPredictions,
} = require("../controllers/userSensorController");
const { verifyToken, requireRole, requireSelfOrAdmin } = require("../middleware/authMiddleware");
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

// Sensor-history popups — ADMIN may view any worker, a WORKER may only view
// their own (requireSelfOrAdmin), so the frontend calls the same endpoints
// for both instead of a duplicate /me/sensors/... tree.
const selfOrAdmin = requireSelfOrAdmin("id");
router.get("/:id/sensors/heart-rate", selfOrAdmin, getHeartRate);
router.get("/:id/sensors/body-temperature", selfOrAdmin, getBodyTemperature);
router.get("/:id/sensors/noise", selfOrAdmin, getNoise);
router.get("/:id/sensors/gas", selfOrAdmin, getGas);
router.get("/:id/sensors/uv", selfOrAdmin, getUv);
router.get("/:id/sensors/ambient-temperature", selfOrAdmin, getAmbientTemperature);
router.get("/:id/safety-predictions", selfOrAdmin, getSafetyPredictions);

module.exports = router;
