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

// Normal-condition sensor packet ingestion (~every 60s per helmet).
router.post("/data", receiveHelmetData);

// Helmet polls for its current LED/risk command.
router.get("/command/:helmetId", getHelmetCommand);

// Emergency workflow — independent of the ML pipeline and the normal
// SET_RISK command above. Helmet announces emergency immediately on button press.
router.post("/emergency", receiveEmergency);

// Supervisor (frontend) requests a reset; helmet polls for it; helmet
// acknowledges once applied locally. Three distinct steps so the backend
// never has to guess whether the physical device actually received the reset.
router.post("/:helmetId/emergency/reset", requestEmergencyReset);
router.get("/:helmetId/emergency/reset", getEmergencyResetStatus);
router.post("/:helmetId/emergency/reset/ack", acknowledgeEmergencyReset);

module.exports = router;
