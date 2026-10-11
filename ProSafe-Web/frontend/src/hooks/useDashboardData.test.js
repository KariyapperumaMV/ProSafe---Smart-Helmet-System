import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useDashboardData } from "./useDashboardData";
import { ANY_WORKER } from "./useLiveWorkerUpdates";
import { emitLive } from "../live/liveUpdates";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useDashboardData", () => {
  test("fetches immediately on mount", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useDashboardData(fetchFn));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({ ok: true });
  });

  test("refetches on the 60s interval", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    renderHook(() => useDashboardData(fetchFn));

    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  test("stops polling once unmounted", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const { unmount } = renderHook(() => useDashboardData(fetchFn));

    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(180_000);
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test("surfaces an error without throwing", async () => {
    const fetchFn = vi.fn().mockRejectedValue({ status: 500, message: "Server error" });
    const { result } = renderHook(() => useDashboardData(fetchFn));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toEqual({ status: 500, message: "Server error" });
  });

  test("live: applyUpdate merges a matching worker update locally, without a request", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: "SAFE" });
    const applyUpdate = (data, event) => ({ ...data, status: event.status.operationalState });
    const { result } = renderHook(() => useDashboardData(fetchFn, { workerId: "W-001", applyUpdate }));
    await waitFor(() => expect(result.current.data).toEqual({ status: "SAFE" }));

    act(() => emitLive({ kind: "WORKER_UPDATE", workerId: "W-002", status: { operationalState: "CRITICAL" } }));
    expect(result.current.data.status).toBe("SAFE"); // another worker: ignored
    act(() => emitLive({ kind: "WORKER_UPDATE", workerId: "W-001", status: { operationalState: "WARNING" } }));
    expect(result.current.data.status).toBe("WARNING");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test("live: without applyUpdate, worker updates trigger a throttled refetch; a reconnect refetches", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    renderHook(() => useDashboardData(fetchFn, { workerId: ANY_WORKER }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await act(async () => {
      for (let i = 0; i < 10; i += 1) emitLive({ kind: "WORKER_UPDATE", workerId: `W-00${i}`, status: {} });
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalledTimes(2); // leading call only — 10 events, one request

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalledTimes(3); // one trailing call for the rest

    await act(async () => {
      emitLive({ kind: "STREAM_CONNECTED", reconnected: true });
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });
});
