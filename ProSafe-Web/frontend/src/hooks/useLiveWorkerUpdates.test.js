import { afterEach, describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ANY_WORKER, useLiveWorkerUpdates, useThrottledCallback } from "./useLiveWorkerUpdates";
import { emitLive, liveListenerCount } from "../live/liveUpdates";

const update = (workerId) => ({ kind: "WORKER_UPDATE", workerId, status: {}, points: [] });

afterEach(() => vi.useRealTimers());

describe("useLiveWorkerUpdates", () => {
  test("only the subscribed worker's updates reach the handler", () => {
    const onUpdate = vi.fn();
    renderHook(() => useLiveWorkerUpdates("W-A", onUpdate));
    act(() => {
      emitLive(update("W-B"));
      emitLive(update("W-A"));
      emitLive({ kind: "SOMETHING_ELSE", workerId: "W-A" });
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].workerId).toBe("W-A");
  });

  test("ANY_WORKER receives every worker's updates", () => {
    const onUpdate = vi.fn();
    renderHook(() => useLiveWorkerUpdates(ANY_WORKER, onUpdate));
    act(() => {
      emitLive(update("W-A"));
      emitLive(update("W-B"));
    });
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  test("onReconnect fires on a REconnect only, not on the first connect", () => {
    const onReconnect = vi.fn();
    renderHook(() => useLiveWorkerUpdates("W-A", vi.fn(), { onReconnect }));
    act(() => emitLive({ kind: "STREAM_CONNECTED", reconnected: false }));
    expect(onReconnect).not.toHaveBeenCalled();
    act(() => emitLive({ kind: "STREAM_CONNECTED", reconnected: true }));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  test("no subscription while disabled / without a worker, and it is removed on unmount", () => {
    const before = liveListenerCount();
    const onUpdate = vi.fn();
    const { rerender, unmount } = renderHook(({ id }) => useLiveWorkerUpdates(id, onUpdate), { initialProps: { id: null } });
    expect(liveListenerCount()).toBe(before);
    rerender({ id: "W-A" });
    expect(liveListenerCount()).toBe(before + 1);
    unmount();
    expect(liveListenerCount()).toBe(before);
    act(() => emitLive(update("W-A")));
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe("useThrottledCallback", () => {
  test("leading call immediately, one trailing call per window", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const { result } = renderHook(() => useThrottledCallback(fn, 5000));
    act(() => {
      result.current();
      result.current();
      result.current();
    });
    expect(fn).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(5000));
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
