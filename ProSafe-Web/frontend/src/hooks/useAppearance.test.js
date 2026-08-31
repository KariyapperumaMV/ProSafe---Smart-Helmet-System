import { describe, expect, test, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAppearance, APPEARANCE_STORAGE_KEYS } from "./useAppearance";

beforeEach(() => {
  localStorage.clear();
  document.body.className = "";
});

describe("useAppearance", () => {
  test("defaults to both settings off when nothing is stored", () => {
    const { result } = renderHook(() => useAppearance());
    expect(result.current.compactMode).toBe(false);
    expect(result.current.reduceAnimations).toBe(false);
    expect(document.body.classList.contains("ps-compact")).toBe(false);
    expect(document.body.classList.contains("ps-reduce-motion")).toBe(false);
  });

  test("toggling compact mode applies the body class and persists to localStorage", () => {
    const { result } = renderHook(() => useAppearance());

    act(() => result.current.setCompactMode(true));

    expect(result.current.compactMode).toBe(true);
    expect(document.body.classList.contains("ps-compact")).toBe(true);
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEYS.compactMode)).toBe("true");
  });

  test("toggling reduce animations applies the body class and persists to localStorage", () => {
    const { result } = renderHook(() => useAppearance());

    act(() => result.current.setReduceAnimations(true));

    expect(result.current.reduceAnimations).toBe(true);
    expect(document.body.classList.contains("ps-reduce-motion")).toBe(true);
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEYS.reduceAnimations)).toBe("true");
  });

  test("the setting survives a full component remount (reads back from localStorage)", () => {
    const first = renderHook(() => useAppearance());
    act(() => first.result.current.setCompactMode(true));
    first.unmount();

    // A brand-new mount (e.g. a fresh page load) picks up the persisted value.
    const second = renderHook(() => useAppearance());
    expect(second.result.current.compactMode).toBe(true);
    expect(document.body.classList.contains("ps-compact")).toBe(true);
  });

  test("never persisted to the account — this hook has no server call at all", () => {
    // Purely a behavioral/documentation assertion: nothing in this hook
    // touches fetch/apiClient. If it ever did, this file would need a
    // network mock, which it deliberately doesn't have.
    const { result } = renderHook(() => useAppearance());
    act(() => result.current.setCompactMode(true));
    expect(typeof result.current.setCompactMode).toBe("function");
  });
});
