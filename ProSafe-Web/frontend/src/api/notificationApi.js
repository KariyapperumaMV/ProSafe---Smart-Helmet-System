import { apiClient, normalizeApiError } from "./apiClient";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export async function getNotifications(params) {
  try {
    const { data } = await apiClient.get("/notifications", { params });
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

export async function markNotificationRead(id) {
  try {
    const { data } = await apiClient.patch(`/notifications/${id}/read`);
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

export async function markAllNotificationsRead() {
  try {
    const { data } = await apiClient.patch("/notifications/read-all");
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

// Authenticated SSE-over-fetch, per the approved design: the notification
// stream must reuse the app's normal Authorization header rather than a
// query-string token (native EventSource can't send headers, so it's not
// used here). Resolves once the stream ends — naturally (server closed it),
// on a network failure, or because `signal` was aborted — the caller
// (useNotifications) owns the reconnect decision, not this function.
export async function streamNotifications({ onEvent, signal }) {
  const token = localStorage.getItem("prosafe_token");
  const response = await fetch(`${BASE_URL}/api/notifications/stream`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Notification stream failed: HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sepIndex;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);

        const dataLines = rawEvent.split("\n").filter((line) => line.startsWith("data:"));
        if (!dataLines.length) continue; // ": connected" / ": heartbeat" comment lines

        const payload = dataLines.map((line) => line.slice(5).trimStart()).join("\n");
        try {
          onEvent(JSON.parse(payload));
        } catch {
          // Malformed event — drop it, keep the stream alive.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
