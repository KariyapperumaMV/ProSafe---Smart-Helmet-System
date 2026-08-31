import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  streamNotifications,
} from "../api/notificationApi";

// Modest, capped backoff for an unexpected disconnect — not an elaborate
// message broker, just enough to avoid hammering the server if it's
// restarting. Resets to the first step as soon as a connection succeeds.
const RECONNECT_DELAYS_MS = [2000, 5000, 10000];

// Bell dropdown only needs the most recent handful — this is not the full
// notification history/inbox.
const DROPDOWN_LIMIT = 20;

// A live event only interrupts the user (toast) when it's genuinely urgent.
// Everything else just updates the badge/dropdown silently.
function shouldToast(event) {
  if (event.type === "EMERGENCY_ALERT") return true;
  if (event.type === "NEW_ALERT" && event.metadata?.currentRiskState === "CRITICAL") return true;
  return false;
}

// Single-connection SSE client over authenticated fetch() (see
// api/notificationApi.streamNotifications — native EventSource can't send
// an Authorization header, so it isn't used). Owns the reconnect loop,
// stops entirely on logout, and aborts cleanly on unmount.
export function useNotifications() {
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  // Set only for events that arrived live over the wire — distinct from
  // `notifications`, which also holds history fetched on mount. Other
  // consumers (e.g. RecentAlertsCard) watch this to know when to refetch
  // their own data, without opening a second SSE connection themselves.
  const [lastEvent, setLastEvent] = useState(null);

  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const handleEvent = useCallback((event) => {
    setNotifications((prev) => [event, ...prev].slice(0, DROPDOWN_LIMIT));
    if (!event.read) setUnreadCount((prev) => prev + 1);
    setLastEvent(event);

    if (shouldToast(event)) {
      showToastRef.current(event.message || event.title, { type: "error", duration: 8000 });
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getNotifications({ limit: DROPDOWN_LIMIT })
      .then((data) => {
        if (cancelled) return;
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      })
      .catch(() => {
        // Bell just stays empty/stale until the next successful poll or a
        // live event arrives — not worth a toast for a background fetch.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const controller = new AbortController();
    let reconnectTimer = null;
    let stopped = false;
    let connecting = false; // guards against overlapping connect() calls
    let backoffIndex = 0;

    async function connect() {
      if (stopped || connecting) return;
      connecting = true;
      try {
        await streamNotifications({ onEvent: handleEvent, signal: controller.signal });
        backoffIndex = 0; // clean server-side close — treat as a fresh start
      } catch (err) {
        if (err?.name === "AbortError" || stopped) return;
        // Any other failure (network blip, non-2xx, mid-stream error) —
        // reconnect with capped backoff.
      } finally {
        connecting = false;
      }

      if (stopped) return;
      const delay = RECONNECT_DELAYS_MS[Math.min(backoffIndex, RECONNECT_DELAYS_MS.length - 1)];
      backoffIndex = Math.min(backoffIndex + 1, RECONNECT_DELAYS_MS.length - 1);
      reconnectTimer = setTimeout(connect, delay);
    }

    connect();

    return () => {
      stopped = true;
      controller.abort();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [isAuthenticated, handleEvent]);

  const markRead = useCallback(async (id) => {
    const target = notifications.find((n) => n.id === id);
    if (!target || target.read) return;
    try {
      await markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      showToastRef.current("Couldn't mark that notification as read.", { type: "error" });
    }
  }, [notifications]);

  const markAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      showToastRef.current("Couldn't mark all notifications as read.", { type: "error" });
    }
  }, []);

  return { notifications, unreadCount, loading, lastEvent, markRead, markAllRead };
}
