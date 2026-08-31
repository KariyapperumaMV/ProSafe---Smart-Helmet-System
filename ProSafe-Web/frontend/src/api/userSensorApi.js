import { apiClient, normalizeApiError } from "./apiClient";

// Small in-memory cache so reopening the same modal within a short window
// (e.g. closing and re-clicking the same sensor card) doesn't refetch —
// per-history data changes at most once a minute (the packet interval), so
// a short TTL is enough without pulling in a state-management library.
const cache = new Map();
const TTL_MS = 60 * 1000;

export function clearSensorHistoryCache() {
  cache.clear();
}

async function cachedGet(path) {
  const cached = cache.get(path);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return cached.data;
  }
  try {
    const { data } = await apiClient.get(path);
    cache.set(path, { data, at: Date.now() });
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

export const getHeartRateHistory = (userId) => cachedGet(`/users/${userId}/sensors/heart-rate`);
export const getBodyTemperatureHistory = (userId) => cachedGet(`/users/${userId}/sensors/body-temperature`);
export const getNoiseHistory = (userId) => cachedGet(`/users/${userId}/sensors/noise`);
export const getGasHistory = (userId) => cachedGet(`/users/${userId}/sensors/gas`);
export const getUvHistory = (userId) => cachedGet(`/users/${userId}/sensors/uv`);
export const getAmbientTemperatureHistory = (userId) => cachedGet(`/users/${userId}/sensors/ambient-temperature`);
export const getSafetyPredictionHistory = (userId) => cachedGet(`/users/${userId}/safety-predictions`);

// Deliberately bypasses `cachedGet` — the Current Condition card polls this
// every 60s itself (see CurrentConditionCard.jsx), so a second layer of
// 60s caching here would only add a race against the poll for no benefit.
export async function getSafetyGuidance(userId) {
  try {
    const { data } = await apiClient.get(`/users/${userId}/safety-guidance`);
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}
