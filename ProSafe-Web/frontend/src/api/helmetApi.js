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

export async function getHelmets(params) {
  try {
    const { data } = await apiClient.get("/helmets", { params });
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

export async function getHelmet(helmetId) {
  try {
    const { data } = await apiClient.get(`/helmets/${helmetId}`);
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

export async function createHelmet(helmetId) {
  try {
    const { data } = await apiClient.post("/helmets", { helmetId });
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

export async function deleteHelmet(helmetId) {
  try {
    const { data } = await apiClient.delete(`/helmets/${helmetId}`);
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}
