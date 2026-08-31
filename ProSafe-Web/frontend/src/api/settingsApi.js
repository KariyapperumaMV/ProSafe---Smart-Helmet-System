import { apiClient, normalizeApiError } from "./apiClient";

export async function getSystemInfo() {
  try {
    const { data } = await apiClient.get("/settings/system-info");
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

// ADMIN only — the backend itself enforces this (403 for a WORKER), the
// frontend just never calls it unless the logged-in user is an ADMIN.
export async function getSiteSettings() {
  try {
    const { data } = await apiClient.get("/settings/site");
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}
