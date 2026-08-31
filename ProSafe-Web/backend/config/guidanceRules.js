// Centralized wording for safetyGuidanceService — every string the Current
// Condition & Guidance card can show lives here, not scattered across the
// service, controller, or React. Deliberately deterministic, rule-based
// text only (see #12/#30 of the approved plan) — no LLM call belongs
// anywhere near this file. A future "narrative provider" layer (out of
// scope for v1) could reword these strings for tone, but must never be
// allowed to change which branch fires or invent a new one.

// role-aware subject word so summary copy doesn't have to branch per role
// for a single pronoun swap.
function subjectFor(viewerRole) {
  return viewerRole === "ADMIN" ? "the worker" : "you";
}

const SUMMARY = {
  EMERGENCY: (viewerRole) => ({
    title: "Emergency active",
    description: `An emergency has been declared for ${subjectFor(viewerRole)}. Immediate action is required.`,
  }),
  CRITICAL: (viewerRole, count) => ({
    title: "Immediate attention required",
    description: `${count} condition${count === 1 ? "" : "s"} currently require${count === 1 ? "s" : ""} immediate attention.`,
  }),
  WARNING: (viewerRole, count) => ({
    title: "Attention recommended",
    description: `${count} condition${count === 1 ? "" : "s"} currently require${count === 1 ? "s" : ""} attention.`,
  }),
  SAFE: () => ({
    title: "All conditions normal",
    description: "Current readings are within expected operating conditions.",
  }),
  UNKNOWN: () => ({
    title: "Status unavailable",
    description: "Safety status has not been established yet for this worker.",
  }),
};

const EMERGENCY_ACTIONS = {
  ADMIN: [
    { dedupeKey: "locateCheckWorker", priority: "HIGH", text: "Locate and check on the worker immediately." },
    { dedupeKey: "followEmergencyProcedure", priority: "HIGH", text: "Follow the site emergency procedure." },
    { dedupeKey: "emergencyResetAfterCheck", priority: "HIGH", text: "Use the emergency-reset workflow only after the worker has been checked." },
  ],
  WORKER: [
    { dedupeKey: "followEmergencyProcedure", priority: "HIGH", text: "Follow the site emergency procedure." },
    { dedupeKey: "seekAssistance", priority: "HIGH", text: "Seek immediate assistance." },
    { dedupeKey: "remainSafeLocation", priority: "HIGH", text: "Remain in a safe location if possible." },
  ],
};

// Each environmental rule has one dedupeKey per (sensor, severity) so a
// CRITICAL and WARNING reading for the same sensor never both fire (only
// the current category classifies), but different sensors never collide.
const ENVIRONMENTAL_ACTIONS = {
  noise: {
    CRITICAL: {
      dedupeKey: "reduceNoiseExposure",
      priority: "HIGH",
      ADMIN: "Noise is in the configured Critical range. Advise the worker to reduce exposure and check hearing protection.",
      WORKER: "Noise is currently in the configured Critical range. Reduce exposure and use hearing protection.",
    },
    WARNING: {
      dedupeKey: "monitorNoiseExposure",
      priority: "MEDIUM",
      ADMIN: "Noise is in the configured Warning range. Monitor the worker's exposure.",
      WORKER: "Noise is currently in the configured Warning range. Consider reducing further exposure and continue monitoring.",
    },
  },
  gas: {
    CRITICAL: {
      dedupeKey: "leaveOrVentilateArea",
      priority: "HIGH",
      ADMIN: "Gas reading is in the configured Critical range. Instruct the worker to leave the area if levels remain elevated.",
      WORKER: "Gas reading is in the configured Critical range. Consider moving to a well-ventilated or open area.",
    },
    WARNING: {
      dedupeKey: "monitorGasExposure",
      priority: "MEDIUM",
      ADMIN: "Gas reading is in the configured Warning range. Monitor the worker's exposure.",
      WORKER: "Gas reading is currently in the configured Warning range. Continue monitoring.",
    },
  },
  ambientTemperature: {
    CRITICAL: {
      dedupeKey: "restCoolArea",
      priority: "HIGH",
      ADMIN: "Ambient temperature is in the configured Critical range. Advise the worker to rest in a cooler area and stay hydrated.",
      WORKER: "Ambient temperature is in the configured Critical range. Rest in a cooler area and stay hydrated.",
    },
    WARNING: {
      dedupeKey: "monitorHeatExposure",
      priority: "MEDIUM",
      ADMIN: "Ambient temperature is in the configured Warning range. Monitor the worker for heat-related symptoms.",
      WORKER: "Ambient temperature is currently in the configured Warning range. Consider a short rest period in a cooler area and continue monitoring.",
    },
  },
  uv: {
    CRITICAL: {
      dedupeKey: "uvProtection",
      priority: "HIGH",
      ADMIN: "UV level is in the configured Critical range. Check the worker's UV exposure controls (shade, protective gear).",
      WORKER: "UV level is in the configured Critical range. Seek shade and use UV protection.",
    },
    WARNING: {
      dedupeKey: "monitorUvExposure",
      priority: "MEDIUM",
      ADMIN: "UV level is in the configured Warning range. Monitor the worker's UV exposure.",
      WORKER: "UV level is currently in the configured Warning range. Seek shade when possible.",
    },
  },
};

// Fires when the worker's heart-rate deviation exceeds the one configured
// personalized threshold (processingConfig.exposure.heartRateDeviationThresholdPct)
// AND also as the fallback when an elevated ML risk state has no environmental
// factor explaining it — both cases boil down to "go check on the worker",
// so they intentionally share one dedupeKey and collapse into a single
// action rather than showing two near-duplicate lines (#11).
const CHECK_CONDITION_ACTION = {
  dedupeKey: "checkWorkerCondition",
  priority: "MEDIUM",
  ADMIN: "Check the worker's current condition.",
  WORKER: "Consider taking a short break and monitor how you feel.",
};

const REVIEW_ML_SIGNAL_ACTION = {
  CRITICAL: {
    dedupeKey: "checkWorkerCondition",
    priority: "HIGH",
    ADMIN: "The worker's overall safety status is Critical. Review recent readings and check on them.",
    WORKER: "Your overall safety status is Critical. Pause and assess how you're feeling, and consider seeking assistance.",
  },
  WARNING: {
    dedupeKey: "checkWorkerCondition",
    priority: "MEDIUM",
    ADMIN: "The worker's overall safety status is Warning. Monitor their condition.",
    WORKER: "Your overall safety status is Warning. Continue monitoring how you feel.",
  },
};

const COMMUNICATION_LOST_ACTION = {
  dedupeKey: "checkCommunication",
  priority: "MEDIUM",
  ADMIN: "Check the worker/helmet communication status.",
  WORKER: "Check that the helmet is powered and connected.",
};

const SAFE_DEFAULT_ACTION = {
  dedupeKey: "continueNormalPractice",
  priority: "LOW",
  ADMIN: "Current readings are within expected operating conditions. Continue normal work practices.",
  WORKER: "Current readings are within expected operating conditions. Continue normal work practices and keep the helmet properly worn.",
};

module.exports = {
  SUMMARY,
  EMERGENCY_ACTIONS,
  ENVIRONMENTAL_ACTIONS,
  CHECK_CONDITION_ACTION,
  REVIEW_ML_SIGNAL_ACTION,
  COMMUNICATION_LOST_ACTION,
  SAFE_DEFAULT_ACTION,
  NO_HELMET: {
    title: "No helmet assigned",
    description: "Current safety guidance will become available when a helmet is assigned and sensor data is received.",
  },
  NO_DATA: {
    title: "Waiting for sensor data",
    description: "Safety guidance will appear once sensor data is received from the helmet.",
  },
};
