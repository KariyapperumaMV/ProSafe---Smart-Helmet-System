import { apiClient, normalizeApiError } from "./apiClient";

export async function getAnalytics({ period, date, fresh } = {}) {
  try {
    const { data } = await apiClient.get("/analytics", {
      params: { period, date, fresh: fresh ? "true" : undefined },
    });
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

function extractFilename(contentDisposition) {
  if (!contentDisposition) return null;
  const match = /filename="?([^"]+)"?/.exec(contentDisposition);
  return match ? match[1] : null;
}

// JWT auth means a plain <a href> download can't send the Authorization
// header — this goes through the authenticated axios client instead, with
// responseType "blob", and the caller turns the result into an object URL.
export async function downloadAnalyticsReport({ period, date }) {
  try {
    const response = await apiClient.get("/analytics/report", {
      params: { period, date, format: "pdf" },
      responseType: "blob",
    });
    return {
      blob: response.data,
      filename: extractFilename(response.headers["content-disposition"]) || "ProSafe-Report.pdf",
    };
  } catch (err) {
    throw normalizeApiError(err);
  }
}
