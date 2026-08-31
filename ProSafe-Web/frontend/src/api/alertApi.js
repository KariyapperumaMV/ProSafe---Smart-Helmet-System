import { apiClient, normalizeApiError } from "./apiClient";

export async function getAlerts(params) {
  try {
    const { data } = await apiClient.get("/alerts", { params });
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

export async function acknowledgeAlert(alertId) {
  try {
    const { data } = await apiClient.patch(`/alerts/${alertId}/acknowledge`);
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}
