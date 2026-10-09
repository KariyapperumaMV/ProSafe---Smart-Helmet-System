const HelmetData = require("../models/HelmetData");
const WorkerProcessingState = require("../models/WorkerProcessingState");
const { SYSTEM_STATES, RISK_STATES, RISK_SEVERITY_ORDER, BACKEND_UNCERTAIN_REASONS, WARMUP_UNCERTAIN_REASONS } = require("../constants/riskStates");
const { dataQuality: dataQualityConfig } = require("../config/processingConfig");

const { validateHelmetBatch } = require("./validationService");
const { getWorkerBaseline, resolveWorkerId } = require("./baselineService");
const { runRawBatch, toV2Reading } = require("./mlService");
const { applyConfidenceRule, syncSession, pushAcceptedPrediction, updateRiskState } = require("./predictionService");
const { generateAlert, generateDataQualityAlert, describeDataQualityReason, transitionLabel } = require("./alertService");
const { sendRiskCommand, ledStateFor } = require("./helmetCommandService");
const { computeOperationalState } = require("./operationalStateService");
const notificationService = require("./notificationService");
const criticalBackstop = require("./criticalBackstopService");

// Normal-condition pipeline for one helmet upload (a batch of 1 Hz samples,
// or one legacy single-sample packet):
//
//   validate identity/structure -> resolve worker -> baseline (context only)
//   -> ProSafe ML V2 POST /predict/raw with the samples in received order
//      (V2: validation, missing-data hold, deviations, session gas baseline,
//       rolling stats, trends, exposure counters, noise dose, quality gate,
//       XGBoost EXTENDED only when READY)
//   -> per sample: session sync -> 0.70 confidence rule -> 5-vote smoothing
//      (UNCERTAIN never votes) -> transition -> data-quality episode
//   -> persist one HelmetData per sample -> alerts/notifications -> LED command.
//
// The backend computes no model features and never reorders, averages or
// drops samples (exact duplicates of already-stored samples are skipped).
// A sample is never rejected for an implausible channel value, and nothing
// here ever turns UNCERTAIN, an unknown worker, a missing baseline or an
// unavailable ML service into SAFE.

// Samples of one worker are processed strictly one upload at a time (V2
// keeps per-worker streaming state, and smoothing is order-dependent).
const workerQueues = new Map();
function serializeByWorker(workerId, task) {
  const previous = workerQueues.get(workerId) || Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.catch(() => {});
  workerQueues.set(workerId, tail);
  tail.then(() => {
    if (workerQueues.get(workerId) === tail) workerQueues.delete(workerId);
  });
  return run;
}

const EMPTY_PROCESSED = {
  heartRateDeviation: null,
  bodyTempDeviation: null,
  noiseExposureDuration: null,
  heartRateExposureDuration: null,
  gasRatioToBaseline: null,
  noiseDosePct: null,
};

function backendUncertain(reason) {
  return {
    systemState: SYSTEM_STATES.UNCERTAIN,
    modelReady: false,
    predictedState: null,
    probabilities: null,
    confidence: null,
    dataQuality: "UNCERTAIN",
    uncertainReason: reason,
    uncertainReasons: [reason],
    derived: null,
    modelName: null,
    modelVersion: null,
    featureSet: null,
    sessionId: null,
  };
}

function nonWarmupReasons(reasons) {
  return (reasons || []).filter((r) => !WARMUP_UNCERTAIN_REASONS.includes(r));
}

// UNCERTAIN episode bookkeeping + "should a DATA_QUALITY alert fire now?".
// Fires when the non-warm-up problem has persisted >= alertAfterSeconds, at
// most once per episode and at most once per worker per cooldown.
function trackUncertain(state, timestamp, reason, reasons) {
  if (state.dataQualityState !== SYSTEM_STATES.UNCERTAIN) {
    state.uncertainSince = timestamp;
    state.dataQualityAlertedForEpisode = false;
    state.dataQualityIssueSince = null;
  }
  state.dataQualityState = SYSTEM_STATES.UNCERTAIN;
  state.uncertainReason = reason;
  state.uncertainReasons = reasons;

  const issues = nonWarmupReasons(reasons);
  if (!issues.length) {
    state.dataQualityIssueSince = null;
    return null;
  }
  if (!state.dataQualityIssueSince) state.dataQualityIssueSince = timestamp;
  const persistedMs = timestamp - state.dataQualityIssueSince;
  const cooldownMs = dataQualityConfig.alertCooldownMinutes * 60 * 1000;
  const cooledDown = !state.lastDataQualityAlertAt || timestamp - state.lastDataQualityAlertAt >= cooldownMs;
  if (state.dataQualityAlertedForEpisode || !cooledDown || persistedMs < dataQualityConfig.alertAfterSeconds * 1000) {
    return null;
  }
  state.dataQualityAlertedForEpisode = true;
  state.lastDataQualityAlertAt = timestamp;
  return { reason: issues[0], reasons: issues, uncertainSince: state.dataQualityIssueSince };
}

function trackReady(state) {
  state.dataQualityState = "READY";
  state.uncertainReason = null;
  state.uncertainReasons = undefined;
  state.uncertainSince = null;
  state.dataQualityIssueSince = null;
  state.dataQualityAlertedForEpisode = false;
}

async function notifyTransition({ workerId, helmetId, alert, previousRiskState, currentRiskState }) {
  // Notification generation is non-critical (notificationService never
  // throws) and only ever fires on a genuine new alert.
  const title = transitionLabel(previousRiskState, currentRiskState);
  await Promise.all([
    notificationService.notifyAdmins({
      type: "NEW_ALERT",
      title,
      message: `Worker ${workerId}'s risk state changed to ${currentRiskState}.`,
      relatedEntityType: "ALERT",
      relatedEntityId: String(alert._id),
      metadata: { workerId, helmetId, previousRiskState, currentRiskState },
    }),
    notificationService.notifyUser(workerId, {
      type: "NEW_ALERT",
      title,
      message: `Your risk state changed to ${currentRiskState}.`,
      relatedEntityType: "ALERT",
      relatedEntityId: String(alert._id),
      metadata: { helmetId, previousRiskState, currentRiskState },
    }),
  ]);
}

async function processSamples({ helmetId, workerId, samples, format }) {
  const baseline = await getWorkerBaseline(workerId);
  const state = (await WorkerProcessingState.findOne({ workerId })) || new WorkerProcessingState({ workerId });

  // Exact duplicates (same worker + timestamp already stored, e.g. a helmet
  // retry after a lost HTTP response) are skipped, not double-counted.
  const stored = await HelmetData.find({ workerId, timestamp: { $in: samples.map((s) => s.timestamp) } }, "timestamp").lean();
  const seen = new Set(stored.map((d) => d.timestamp.getTime()));
  const fresh = [];
  for (const sample of samples) {
    const key = sample.timestamp.getTime();
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(sample);
  }
  const duplicatesSkipped = samples.length - fresh.length;
  if (!fresh.length) {
    return {
      httpStatus: 200,
      responseBody: { message: "Duplicate samples ignored", workerId, helmetId, samplesReceived: samples.length, samplesProcessed: 0, duplicatesSkipped },
    };
  }

  let decisions;
  let mlUnavailableReason = null;
  if (!baseline.found) {
    decisions = fresh.map(() => backendUncertain(BACKEND_UNCERTAIN_REASONS.WORKER_NOT_FOUND));
  } else {
    const readings = fresh.map((s) => toV2Reading({ workerId, helmetId, timestamp: s.timestamp, raw: s.raw, baseline }));
    const ml = await runRawBatch(readings);
    if (ml.ok) {
      decisions = ml.results;
    } else {
      mlUnavailableReason = ml.reason;
      console.warn(`ProSafe ML V2 unavailable for ${workerId} (${fresh.length} samples -> UNCERTAIN): ${ml.reason}`);
      decisions = fresh.map(() => backendUncertain(BACKEND_UNCERTAIN_REASONS.ML_SERVICE_UNAVAILABLE));
    }
  }

  const docs = [];
  const transitions = [];
  const dataQualityAlerts = [];
  const results = [];
  let stateChanged = false;

  fresh.forEach((sample, i) => {
    const d = decisions[i];
    syncSession(state, d.sessionId);
    if (d.modelVersion) state.lastModelVersion = d.modelVersion;

    const rule = applyConfidenceRule(d);
    // Deterministic backstop integration point (no rules configured; see
    // criticalBackstopService). Only ever raises severity, never lowers it.
    const backstopState = criticalBackstop.evaluate({ timestamp: sample.timestamp, raw: sample.raw }, d);
    const backstopApplies =
      RISK_SEVERITY_ORDER.includes(backstopState) &&
      (!rule.accepted || RISK_SEVERITY_ORDER.indexOf(backstopState) > RISK_SEVERITY_ORDER.indexOf(rule.systemState));
    if (backstopApplies) {
      rule.accepted = true;
      rule.systemState = backstopState;
      rule.uncertainReason = null;
    }
    let smoothedState = null;
    if (rule.accepted) {
      smoothedState = pushAcceptedPrediction(state, { predictedState: rule.systemState, confidence: d.confidence, at: sample.timestamp });
      const transition = updateRiskState(state, smoothedState);
      if (transition.changed) {
        stateChanged = true;
        // Establishing SAFE at the start of a session is not an event; an
        // elevated state (or any real change) is.
        if (transition.previousRiskState || transition.currentRiskState !== RISK_STATES.SAFE) {
          transitions.push({ ...transition, timestamp: sample.timestamp, confidence: d.confidence, raw: sample.raw });
        }
      }
      trackReady(state);
    } else {
      const reasons = rule.uncertainReason === d.uncertainReason ? d.uncertainReasons : [rule.uncertainReason];
      const dq = trackUncertain(state, sample.timestamp, rule.uncertainReason, reasons);
      if (dq) dataQualityAlerts.push({ ...dq, timestamp: sample.timestamp, raw: sample.raw });
    }

    if (!state.lastPacketAt || sample.timestamp > state.lastPacketAt) state.lastPacketAt = sample.timestamp;

    const prediction = {
      ranMl: d.modelReady,
      skippedReason: rule.accepted ? null : rule.uncertainReason,
      predictedState: d.predictedState,
      confidence: d.confidence,
      probabilities: d.probabilities,
      accepted: rule.accepted,
      smoothedState,
      systemState: rule.systemState,
      dataQuality: d.dataQuality,
      uncertainReason: rule.accepted ? null : rule.uncertainReason,
      uncertainReasons: rule.accepted ? undefined : state.uncertainReasons,
      modelReady: d.modelReady,
      backstopState: backstopApplies ? backstopState : null,
      modelName: d.modelName,
      modelVersion: d.modelVersion,
      featureSet: d.featureSet,
      sessionId: d.sessionId,
    };
    docs.push({ helmetId, workerId, timestamp: sample.timestamp, raw: sample.raw, processed: d.derived || EMPTY_PROCESSED, prediction });
    results.push({
      timestamp: sample.timestamp,
      systemState: rule.systemState,
      predictedState: d.predictedState,
      confidence: d.confidence,
      accepted: rule.accepted,
      smoothedState,
      uncertainReason: prediction.uncertainReason,
    });
  });

  await HelmetData.insertMany(docs, { ordered: true });
  await state.save();

  const alerts = [];
  for (const t of transitions) {
    const alert = await generateAlert({
      workerId,
      helmetId,
      timestamp: t.timestamp,
      previousRiskState: t.previousRiskState,
      currentRiskState: t.currentRiskState,
      confidence: t.confidence,
      raw: t.raw,
    });
    alerts.push(alert);
    await notifyTransition({ workerId, helmetId, alert, previousRiskState: t.previousRiskState, currentRiskState: t.currentRiskState });
  }

  const dqAlerts = [];
  for (const dq of dataQualityAlerts) {
    const alert = await generateDataQualityAlert({ workerId, helmetId, ...dq });
    dqAlerts.push(alert);
    await notificationService.notifyAdmins({
      type: "DATA_QUALITY_ALERT",
      title: `Data quality: ${describeDataQualityReason(dq.reason)}`,
      message: `No reliable risk prediction for worker ${workerId} since ${dq.uncertainSince.toISOString()} (${dq.reason}).`,
      relatedEntityType: "ALERT",
      relatedEntityId: String(alert._id),
      metadata: { workerId, helmetId, dataQualityReason: dq.reason },
    });
  }

  // The LED always reflects the backend's current view: a confirmed risk
  // state, or UNCERTAIN (blue) when nothing trustworthy is established —
  // never a SAFE fallback.
  const ledState = ledStateFor(state);
  await sendRiskCommand(helmetId, ledState);

  const latest = docs[docs.length - 1];
  return {
    httpStatus: 201,
    responseBody: {
      message: "Packet processed",
      workerId,
      helmetId,
      format,
      samplesReceived: samples.length,
      samplesProcessed: fresh.length,
      duplicatesSkipped,
      baselineAvailable: baseline.hasBaseline,
      mlAvailable: mlUnavailableReason === null && baseline.found,
      mlUnavailableReason,
      results,
      prediction: latest.prediction,
      riskState: ledState,
      operationalState: computeOperationalState(state),
      currentRiskState: state.currentRiskState || null,
      dataQualityState: state.dataQualityState,
      uncertainReason: state.uncertainReason || null,
      stateChanged,
      alertGenerated: alerts.length > 0,
      alertsGenerated: alerts.length,
      dataQualityAlertGenerated: dqAlerts.length > 0,
    },
  };
}

async function processPacket(body) {
  const validation = validateHelmetBatch(body);
  if (!validation.valid) {
    return { httpStatus: 400, responseBody: { message: "Invalid sensor packet", errors: validation.errors } };
  }

  const { helmetId } = validation;

  // Real firmware never sends workerId — resolve it from helmetId instead.
  const resolution = await resolveWorkerId(helmetId, validation.workerId);
  if (!resolution.ok && resolution.reject) {
    return {
      httpStatus: resolution.status,
      responseBody: { message: "Cannot identify worker for this packet", reason: resolution.reason },
    };
  }
  const { workerId } = resolution;

  return serializeByWorker(workerId, () =>
    processSamples({ helmetId, workerId, samples: validation.samples, format: validation.format })
  );
}

module.exports = { processPacket, processBatch: processPacket };
