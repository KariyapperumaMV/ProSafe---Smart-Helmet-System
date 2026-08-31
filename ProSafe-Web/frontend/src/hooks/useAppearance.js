import { useCallback, useEffect, useState } from "react";

// Centralized so the storage keys are never repeated as string literals
// elsewhere (#12 — "keep naming centralized"). Purely local UI state, never
// sent to the backend or synced across devices — see Phase A's deliberate
// localStorage-vs-account choice.
export const APPEARANCE_STORAGE_KEYS = {
  compactMode: "prosafe_compact_mode",
  reduceAnimations: "prosafe_reduce_animations",
};

function readBool(key) {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false; // private-mode/storage-disabled — falls back to the default look
  }
}

function writeBool(key, value) {
  try {
    localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // Nothing to do — the setting just won't persist this session.
  }
}

// Imperative DOM mutation (not React-rendered) so it applies globally
// regardless of which component last changed it, and survives that
// component unmounting — every mounted instance of this hook shares the
// same document.body target.
function applyToDocument(compactMode, reduceAnimations) {
  document.body.classList.toggle("ps-compact", compactMode);
  document.body.classList.toggle("ps-reduce-motion", reduceAnimations);
}

// Note: this covers CSS transitions/animations everywhere (modals, card
// hover/entry, the notification dropdown, toasts) via theme.css's
// body.ps-reduce-motion rules. Recharts' own mount animation is driven by
// JS (react-smooth), not CSS, and isn't wired to this setting in v1 — most
// charts already set isAnimationActive={false} outright; threading a
// reduce-motion prop through the handful that don't would mean touching
// Dashboard/Analytics chart files for a cosmetic detail, out of scope for
// "keep Settings simple."
export function useAppearance() {
  const [compactMode, setCompactModeState] = useState(() => readBool(APPEARANCE_STORAGE_KEYS.compactMode));
  const [reduceAnimations, setReduceAnimationsState] = useState(() => readBool(APPEARANCE_STORAGE_KEYS.reduceAnimations));

  useEffect(() => {
    applyToDocument(compactMode, reduceAnimations);
  }, [compactMode, reduceAnimations]);

  const setCompactMode = useCallback((value) => {
    writeBool(APPEARANCE_STORAGE_KEYS.compactMode, value);
    setCompactModeState(value);
  }, []);

  const setReduceAnimations = useCallback((value) => {
    writeBool(APPEARANCE_STORAGE_KEYS.reduceAnimations, value);
    setReduceAnimationsState(value);
  }, []);

  return { compactMode, reduceAnimations, setCompactMode, setReduceAnimations };
}
