import { apiClient, normalizeApiError } from "./apiClient";

export async function getAssignableHelmets(currentHelmetId) {
  try {
    const { data } = await apiClient.get("/helmets/assignable", {
      params: currentHelmetId ? { currentHelmetId } : {},
    });
    return data.helmets;
  } catch (err) {
    throw normalizeApiError(err);
  }
}
