const express = require("express");
const router = express.Router();

const {
  receiveHelmetData,
  getHelmetCommand,
  receiveEmergency,
  requestEmergencyReset,
  getEmergencyResetStatus,
  acknowledgeEmergencyReset,
} = require("../controllers/helmetDataController");
const { verifyToken, requireRole } = require("../middleware/authMiddleware");
const { USER_ROLES } = require("../constants/roles");

// Normal-condition sensor packet ingestion (~every 60s per helmet).
router.post("/data", receiveHelmetData);

// Helmet polls for its current LED/risk command.
router.get("/command/:helmetId", getHelmetCommand);

// Emergency workflow — independent of the ML pipeline and the normal
// SET_RISK command above. Helmet announces emergency immediately on button press.
router.post("/emergency", receiveEmergency);

// Supervisor (frontend, e.g. the Dashboard's Reset Emergency button) requests
// a reset — now ADMIN-only. This was previously unauthenticated (auth
// didn't exist yet when this route was written); the two routes below stay
// unauthenticated deliberately, since the physical ESP32 firmware calling
// them has no web-user JWT to send.
router.post("/:helmetId/emergency/reset", verifyToken, requireRole(USER_ROLES.ADMIN), requestEmergencyReset);
// Helmet polls for reset status, then acknowledges once applied locally.
// Firmware-facing — must stay open.
router.get("/:helmetId/emergency/reset", getEmergencyResetStatus);
router.post("/:helmetId/emergency/reset/ack", acknowledgeEmergencyReset);

module.exports = router;
