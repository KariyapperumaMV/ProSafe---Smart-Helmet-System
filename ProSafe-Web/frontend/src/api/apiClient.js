import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export const apiClient = axios.create({
  baseURL: `${BASE_URL}/api`,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("prosafe_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Normalizes every failure into { status, message, errors } so pages never
// have to branch on axios's own error shape. `errors` carries field-level
// messages (validation 400s, conflict 409s) when the backend sent them.
export function normalizeApiError(err) {
  if (err.response) {
    const { status, data } = err.response;
    return {
      status,
      message: data?.message || "Something went wrong. Please try again.",
      errors: data?.errors || null,
    };
  }
  if (err.request) {
    return { status: 0, message: "Cannot reach the server. Check your connection.", errors: null };
  }
  return { status: -1, message: err.message || "Unexpected error", errors: null };
}

export function fileUrl(path) {
  if (!path) return null;
  return `${BASE_URL}${path}`;
}
