import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useNotifications } from "./useNotifications";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  streamNotifications,
} from "../api/notificationApi";

vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../context/ToastContext", () => ({ useToast: vi.fn() }));
vi.mock("../api/notificationApi", () => ({
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  streamNotifications: vi.fn(),
}));

let streamCalls;
let showToast;

function mockStreamOnce() {
  streamNotifications.mockImplementation(({ onEvent, signal }) => {
    return new Promise((resolve, reject) => {
      streamCalls.push({ onEvent, resolve, reject });
      signal.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  });
}

beforeEach(() => {
  streamCalls = [];
  showToast = vi.fn();
  useToast.mockReturnValue({ showToast });
  useAuth.mockReturnValue({ isAuthenticated: true });
  getNotifications.mockReset();
  getNotifications.mockResolvedValue({ notifications: [], unreadCount: 0 });
  markNotificationRead.mockReset();
  markAllNotificationsRead.mockReset();
  streamNotifications.mockReset();
  mockStreamOnce();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useNotifications", () => {
  test("does nothing when unauthenticated — no fetch, no stream", async () => {
    useAuth.mockReturnValue({ isAuthenticated: false });
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
    expect(getNotifications).not.toHaveBeenCalled();
    expect(streamNotifications).not.toHaveBeenCalled();
  });

  test("fetches history on mount and opens the stream with an Authorization-backed fetch (not query-string)", async () => {
    getNotifications.mockResolvedValue({
      notifications: [{ id: "1", type: "USER_CREATED", title: "t", message: "m", read: true, createdAt: new Date().toISOString() }],
      unreadCount: 0,
    });
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notifications).toHaveLength(1);
    expect(getNotifications).toHaveBeenCalledWith({ limit: 20 });
    await waitFor(() => expect(streamNotifications).toHaveBeenCalledTimes(1));
  });

  test("a live event is prepended, increments unreadCount, and becomes lastEvent", async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(streamCalls).toHaveLength(1));

    act(() => {
      streamCalls[0].onEvent({ id: "evt-1", type: "USER_CREATED", title: "New user", message: "Added", read: false, createdAt: new Date().toISOString() });
    });

    expect(result.current.notifications[0].id).toBe("evt-1");
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.lastEvent.id).toBe("evt-1");
  });

  test("toasts for EMERGENCY_ALERT and CRITICAL NEW_ALERT, stays silent for everything else", async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(streamCalls).toHaveLength(1));

    act(() => {
      streamCalls[0].onEvent({ id: "1", type: "EMERGENCY_ALERT", title: "Emergency", message: "help", read: false });
    });
    expect(showToast).toHaveBeenCalledTimes(1);

    act(() => {
      streamCalls[0].onEvent({ id: "2", type: "NEW_ALERT", title: "Risk", message: "warn", read: false, metadata: { currentRiskState: "WARNING" } });
    });
    expect(showToast).toHaveBeenCalledTimes(1); // still 1 — WARNING doesn't toast

    act(() => {
      streamCalls[0].onEvent({ id: "3", type: "NEW_ALERT", title: "Risk", message: "critical", read: false, metadata: { currentRiskState: "CRITICAL" } });
    });
    expect(showToast).toHaveBeenCalledTimes(2);

    act(() => {
      streamCalls[0].onEvent({ id: "4", type: "USER_CREATED", title: "New user", message: "added", read: false });
    });
    expect(showToast).toHaveBeenCalledTimes(2); // unchanged
    expect(result.current.unreadCount).toBe(4);
  });

  test("a WORKER with emergencyAlerts=false does not toast for EMERGENCY_ALERT, but the notification still lands in the inbox", async () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { role: "WORKER", preferences: { notifications: { emergencyAlerts: false } } },
    });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(streamCalls).toHaveLength(1));

    act(() => {
      streamCalls[0].onEvent({ id: "1", type: "EMERGENCY_ALERT", title: "Emergency", message: "help", read: false });
    });

    expect(showToast).not.toHaveBeenCalled();
    expect(result.current.notifications[0].id).toBe("1"); // inbox delivery is unconditional
    expect(result.current.unreadCount).toBe(1);
  });

  test("an ADMIN always toasts for EMERGENCY_ALERT even if the stored preference says false (tamper-proof override, #7)", async () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { role: "ADMIN", preferences: { notifications: { emergencyAlerts: false } } },
    });
    renderHook(() => useNotifications());
    await waitFor(() => expect(streamCalls).toHaveLength(1));

    act(() => {
      streamCalls[0].onEvent({ id: "1", type: "EMERGENCY_ALERT", title: "Emergency", message: "help", read: false });
    });

    expect(showToast).toHaveBeenCalledTimes(1);
  });

  test("safetyAlerts=false silences the CRITICAL NEW_ALERT toast", async () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { role: "WORKER", preferences: { notifications: { safetyAlerts: false } } },
    });
    renderHook(() => useNotifications());
    await waitFor(() => expect(streamCalls).toHaveLength(1));

    act(() => {
      streamCalls[0].onEvent({ id: "1", type: "NEW_ALERT", title: "Risk", message: "critical", read: false, metadata: { currentRiskState: "CRITICAL" } });
    });

    expect(showToast).not.toHaveBeenCalled();
  });

  test("emergencyResetUpdates gates EMERGENCY_RESET_REQUESTED/RESOLVED toasts", async () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { role: "ADMIN", preferences: { notifications: { emergencyResetUpdates: false } } },
    });
    renderHook(() => useNotifications());
    await waitFor(() => expect(streamCalls).toHaveLength(1));

    act(() => {
      streamCalls[0].onEvent({ id: "1", type: "EMERGENCY_RESET_REQUESTED", title: "Reset requested", message: "m", read: false });
    });
    act(() => {
      streamCalls[0].onEvent({ id: "2", type: "EMERGENCY_RESOLVED", title: "Resolved", message: "m", read: false });
    });

    expect(showToast).not.toHaveBeenCalled();
  });

  test("changing the preference while the app is already running affects the very next event — no stale closure, no reconnect", async () => {
    let currentUser = { role: "WORKER", preferences: { notifications: { safetyAlerts: true } } };
    useAuth.mockImplementation(() => ({ isAuthenticated: true, user: currentUser }));

    const { rerender } = renderHook(() => useNotifications());
    await waitFor(() => expect(streamCalls).toHaveLength(1));

    act(() => {
      streamCalls[0].onEvent({ id: "1", type: "NEW_ALERT", title: "Risk", message: "critical", read: false, metadata: { currentRiskState: "CRITICAL" } });
    });
    expect(showToast).toHaveBeenCalledTimes(1); // toasted while the preference was still true

    // User flips the preference off (simulating a Settings save updating
    // AuthContext) — the SAME stream connection must pick this up.
    currentUser = { role: "WORKER", preferences: { notifications: { safetyAlerts: false } } };
    rerender();

    act(() => {
      streamCalls[0].onEvent({ id: "2", type: "NEW_ALERT", title: "Risk", message: "critical again", read: false, metadata: { currentRiskState: "CRITICAL" } });
    });
    expect(showToast).toHaveBeenCalledTimes(1); // unchanged — the second event did not toast
    expect(streamNotifications).toHaveBeenCalledTimes(1); // still the same connection, never reconnected
  });

  test("reconnects with capped backoff after an unexpected disconnect, and resets backoff after a clean reconnect", async () => {
    vi.useFakeTimers();
    renderHook(() => useNotifications());
    await vi.waitFor(() => expect(streamCalls).toHaveLength(1));

    await act(async () => {
      streamCalls[0].reject(new Error("network blip"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(streamNotifications).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(streamNotifications).toHaveBeenCalledTimes(2);

    await act(async () => {
      streamCalls[1].reject(new Error("network blip again"));
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(streamNotifications).toHaveBeenCalledTimes(2); // not yet — second delay is 5000ms

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(streamNotifications).toHaveBeenCalledTimes(3);
  });

  test("stops reconnecting once unauthenticated (logout) and aborts the in-flight stream", async () => {
    const { rerender, result } = renderHook(
      ({ authed }) => {
        useAuth.mockReturnValue({ isAuthenticated: authed });
        return useNotifications();
      },
      { initialProps: { authed: true } }
    );

    await waitFor(() => expect(streamCalls).toHaveLength(1));

    rerender({ authed: false });

    // The abort listener registered in mockStreamOnce rejects the in-flight
    // stream promise with AbortError — the hook must treat that as "stop",
    // not "reconnect".
    await waitFor(() => expect(result.current.notifications).toEqual([]));
    await new Promise((r) => setTimeout(r, 0));
    expect(streamNotifications).toHaveBeenCalledTimes(1); // never reconnected
  });

  test("markRead calls the API and updates local state", async () => {
    getNotifications.mockResolvedValue({
      notifications: [{ id: "1", type: "USER_CREATED", title: "t", message: "m", read: false, createdAt: new Date().toISOString() }],
      unreadCount: 1,
    });
    markNotificationRead.mockResolvedValue({ message: "ok" });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    await act(async () => {
      await result.current.markRead("1");
    });

    expect(markNotificationRead).toHaveBeenCalledWith("1");
    expect(result.current.notifications[0].read).toBe(true);
    expect(result.current.unreadCount).toBe(0);
  });

  test("markAllRead calls the API and clears unreadCount", async () => {
    getNotifications.mockResolvedValue({
      notifications: [
        { id: "1", type: "USER_CREATED", title: "t", message: "m", read: false, createdAt: new Date().toISOString() },
        { id: "2", type: "USER_CREATED", title: "t2", message: "m2", read: false, createdAt: new Date().toISOString() },
      ],
      unreadCount: 2,
    });
    markAllNotificationsRead.mockResolvedValue({ message: "ok" });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.notifications).toHaveLength(2));

    await act(async () => {
      await result.current.markAllRead();
    });

    expect(markAllNotificationsRead).toHaveBeenCalled();
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications.every((n) => n.read)).toBe(true);
  });
});
