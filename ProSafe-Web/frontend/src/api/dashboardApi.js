import { apiClient, normalizeApiError } from "./apiClient";

export async function getAdminDashboard() {
  try {
    const { data } = await apiClient.get("/dashboard/admin");
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

export async function getWorkerDashboard() {
  try {
    const { data } = await apiClient.get("/dashboard/worker");
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}
