const WorkerProcessingState = require("../models/WorkerProcessingState");
const { exposure: exposureConfig } = require("../config/processingConfig");

// Stage 9: how long an abnormal condition has persisted, per worker,
// persisted in WorkerProcessingState (never a local variable).
//
// Rule (not specified by logic.docx, chosen and documented here):
// - condition abnormal this packet -> accumulate elapsed seconds since the
//   worker's last packet (clamped to maxGapSeconds to survive clock skew /
//   missed packets; falls back to defaultPacketIntervalSeconds on the first
//   packet, when there is no previous timestamp to diff against).
// - condition normal this packet -> accumulator resets to 0 immediately.
function computeElapsedSeconds(currentTimestamp, lastPacketAt) {
  if (!lastPacketAt) return exposureConfig.defaultPacketIntervalSeconds;
  const elapsed = (currentTimestamp.getTime() - lastPacketAt.getTime()) / 1000;
  if (!Number.isFinite(elapsed) || elapsed <= 0) return exposureConfig.defaultPacketIntervalSeconds;
  return Math.min(elapsed, exposureConfig.maxGapSeconds);
}

async function updateExposureDurations({ workerId, timestamp, noise, heartRateDeviation }) {
  let state = await WorkerProcessingState.findOne({ workerId });
  if (!state) {
    state = new WorkerProcessingState({ workerId });
  }

  const elapsedSeconds = computeElapsedSeconds(timestamp, state.lastPacketAt);

  const noiseAbnormal = Number.isFinite(noise) && noise >= exposureConfig.noiseThresholdDb;
  const hrAbnormal = Number.isFinite(heartRateDeviation) && heartRateDeviation >= exposureConfig.heartRateDeviationThresholdPct;

  state.noiseExposure.accumulatedSeconds = noiseAbnormal
    ? state.noiseExposure.accumulatedSeconds + elapsedSeconds
    : 0;
  state.noiseExposure.active = noiseAbnormal;

  state.heartRateExposure.accumulatedSeconds = hrAbnormal
    ? state.heartRateExposure.accumulatedSeconds + elapsedSeconds
    : 0;
  state.heartRateExposure.active = hrAbnormal;

  state.lastPacketAt = timestamp;
  await state.save();

  return {
    noiseExposureDuration: state.noiseExposure.accumulatedSeconds,
    heartRateExposureDuration: state.heartRateExposure.accumulatedSeconds,
  };
}

module.exports = { updateExposureDurations };
