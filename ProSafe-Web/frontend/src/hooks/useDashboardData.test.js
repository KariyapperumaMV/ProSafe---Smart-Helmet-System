import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useDashboardData } from "./useDashboardData";

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
});
