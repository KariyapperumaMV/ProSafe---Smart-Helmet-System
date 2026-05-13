const express = require("express");
const router = express.Router();

const {
  receiveHelmetData,
  receiveHelmetEmergencyData,
  sendHelmetResetCommand,
  getHelmetCommand,
  getAvailableHelmets,
  getLatestHelmetData,
  get7DaysHelmetData
} = require("../controllers/helmetController");

// Recieve normal datapacket
router.post("/data", receiveHelmetData);

// Recieve emergency data packet
router.post("/emergency", receiveHelmetEmergencyData);

// Admin actions
router.post("/reset", sendHelmetResetCommand);

// Helmet polling
router.get("/command/:helmetId", getHelmetCommand);

// Get available helmets - for the dropdown box
router.get("/available", getAvailableHelmets);

// Get recent helmet data
router.get("/latest/:helmetId", getLatestHelmetData);

// Get 7 days average data
router.get("/last7days/:helmetId", get7DaysHelmetData);
 
module.exports = router;