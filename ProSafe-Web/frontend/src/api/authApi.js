import { apiClient, normalizeApiError } from "./apiClient";

export async function login(username, password) {
  try {
    const { data } = await apiClient.post("/auth/login", { username, password });
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}
