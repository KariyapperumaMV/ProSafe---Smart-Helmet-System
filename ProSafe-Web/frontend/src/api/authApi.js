import { apiClient, normalizeApiError } from "./apiClient";

export async function login(username, password) {
  try {
    const { data } = await apiClient.post("/auth/login", { username, password });
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

export async function changePassword(currentPassword, newPassword) {
  try {
    const { data } = await apiClient.patch("/auth/password", { currentPassword, newPassword });
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}
