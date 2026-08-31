const HelmetData = require("../models/HelmetData");
const WorkerProcessingState = require("../models/WorkerProcessingState");
const { RISK_STATES } = require("../constants/riskStates");

const { validatePacket } = require("./validationService");
const { getWorkerBaseline, resolveWorkerId } = require("./baselineService");
const { calculatePhysiologicalDeviations } = require("./deviationService");
const { updateExposureDurations } = require("./exposureService");
const { buildFeatureVector } = require("./featureVectorService");
const { runPrediction } = require("./mlService");
const { checkPredictionConfidence, updatePredictionHistory, compareAndUpdateRiskState } = require("./predictionService");
const { generateAlert } = require("./alertService");
const { sendRiskCommand } = require("./helmetCommandService");
const notificationService = require("./notificationService");

// Orchestrates the exact stage order for a normal-condition packet:
// validate -> identify -> baseline -> deviations -> exposure -> feature
// vector -> ML -> confidence -> smoothing -> transition -> alert (only if
// changed) -> persist reading -> update helmet command -> return result.
//
// A packet is never dropped just because ML couldn't run (unknown worker,
// no baseline yet, ML service down/slow/malformed) — those are "processing
// skipped" outcomes, not packet rejections. Only a genuinely malformed
// packet (Stage 6) is rejected outright. This keeps raw sensor history
// intact even while the ML/baseline side of the system is incomplete, and
// matches "the server must not crash" / "do not fabricate a SAFE result".
async function processPacket(body) {
  const validation = validatePacket(body);
  if (!validation.valid) {
    return { httpStatus: 400, responseBody: { message: "Invalid sensor packet", errors: validation.errors } };
  }

  const { helmetId } = body;
  const timestamp = new Date(body.timestamp);
  const raw = {
    heartRate: body.heartRate,
    bodyTemp: body.bodyTemp,
    ambientTemp: body.ambientTemp,
    noise: body.noise,
    gas: body.gas,
    uv: body.uv,
    gps: body.gps ? { lat: body.gps.lat, lon: body.gps.lon } : undefined,
  };

  // Real firmware never sends workerId — resolve it from helmetId instead.
  const resolution = await resolveWorkerId(helmetId, body.workerId);
  if (!resolution.ok && resolution.reject) {
    return {
      httpStatus: resolution.status,
      responseBody: { message: "Cannot identify worker for this packet", reason: resolution.reason },
    };
  }
  const workerId = resolution.workerId;

  const baseline = await getWorkerBaseline(workerId);

  const deviations = baseline.hasBaseline
    ? calculatePhysiologicalDeviations(raw, baseline)
    : { heartRateDeviation: null, bodyTempDeviation: null };

  const exposure = await updateExposureDurations({
    workerId,
    timestamp,
    noise: raw.noise,
    heartRateDeviation: deviations.heartRateDeviation,
  });

  const prediction = {
    ranMl: false,
    skippedReason: null,
    predictedState: null,
    confidence: null,
    probabilities: null,
    accepted: false,
    smoothedState: null,
  };

  let stateChanged = false;
  let previousRiskState = null;
  let currentRiskState = null;
  let alert = null;

  if (!baseline.found) {
    prediction.skippedReason = "WORKER_NOT_FOUND";
  } else if (!baseline.hasBaseline) {
    prediction.skippedReason = "MISSING_BASELINE";
  } else {
    const featureVector = buildFeatureVector({ raw, deviations, exposure, baseline });
    const mlResult = await runPrediction(featureVector);

    if (!mlResult.ok) {
      prediction.skippedReason = mlResult.reason;
    } else {
      prediction.ranMl = true;
      prediction.predictedState = mlResult.predictedState;
      prediction.confidence = mlResult.confidence;
      prediction.probabilities = mlResult.probabilities;

      const confidenceCheck = checkPredictionConfidence(mlResult);
      prediction.accepted = confidenceCheck.accepted;

      if (confidenceCheck.accepted) {
        const smoothedState = await updatePredictionHistory(workerId, confidenceCheck);
        prediction.smoothedState = smoothedState;

        const transition = await compareAndUpdateRiskState(workerId, smoothedState);
        stateChanged = transition.changed;
        previousRiskState = transition.previousRiskState;
        currentRiskState = transition.currentRiskState;

        if (stateChanged) {
          alert = await generateAlert({
            workerId,
            helmetId,
            timestamp,
            previousRiskState,
            currentRiskState,
            confidence: confidenceCheck.confidence,
            raw,
          });

          // Notification generation is non-critical (notificationService
          // never throws) and only ever fires on a genuine new alert —
          // `stateChanged` already gates duplicate transitions upstream, so
          // a retried/duplicate packet can never double-notify.
          const notifyTitle = `Risk changed: ${previousRiskState} → ${currentRiskState}`;
          const notifyMessage = `Worker ${workerId}'s risk state changed to ${currentRiskState}.`;
          await Promise.all([
            notificationService.notifyAdmins({
              type: "NEW_ALERT",
              title: notifyTitle,
              message: notifyMessage,
              relatedEntityType: "ALERT",
              relatedEntityId: String(alert._id),
              metadata: { workerId, helmetId, previousRiskState, currentRiskState },
            }),
            notificationService.notifyUser(workerId, {
              type: "NEW_ALERT",
              title: notifyTitle,
              message: `Your risk state changed to ${currentRiskState}.`,
              relatedEntityType: "ALERT",
              relatedEntityId: String(alert._id),
              metadata: { helmetId, previousRiskState, currentRiskState },
            }),
          ]);
        }
      }
    }
  }

  await HelmetData.create({
    helmetId,
    workerId,
    timestamp,
    raw,
    processed: {
      heartRateDeviation: deviations.heartRateDeviation,
      bodyTempDeviation: deviations.bodyTempDeviation,
      noiseExposureDuration: exposure.noiseExposureDuration,
      heartRateExposureDuration: exposure.heartRateExposureDuration,
    },
    prediction,
  });

  // The LED must always reflect the worker's last known accepted risk state,
  // even on a packet that didn't change (or couldn't compute) that state —
  // fall back to the persisted state, defaulting a brand-new worker to SAFE.
  if (currentRiskState === null) {
    const existingState = await WorkerProcessingState.findOne({ workerId });
    currentRiskState = existingState ? existingState.currentRiskState : RISK_STATES.SAFE;
  }
  await sendRiskCommand(helmetId, currentRiskState);

  return {
    httpStatus: 201,
    responseBody: {
      message: "Packet processed",
      workerId,
      helmetId,
      timestamp,
      baselineAvailable: baseline.hasBaseline,
      deviations,
      exposure,
      prediction,
      riskState: currentRiskState,
      stateChanged,
      alertGenerated: Boolean(alert),
    },
  };
}

module.exports = { processPacket };
