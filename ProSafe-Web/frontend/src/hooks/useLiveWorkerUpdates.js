import { useCallback, useEffect, useRef } from "react";
import { subscribeLive } from "../live/liveUpdates";

export const ANY_WORKER = "*";

// Subscribe a component to live updates for one worker (or ANY_WORKER).
//   onUpdate(event)  - a WORKER_UPDATE for that worker arrived
//   onReconnect()    - the stream reconnected after a drop: refetch over REST,
//                      events sent while disconnected are not replayed
// Pass workerId = null (or enabled: false) to unsubscribe, e.g. while a
// modal is closed. Handlers may change every render; the subscription doesn't.
export function useLiveWorkerUpdates(workerId, onUpdate, { onReconnect, enabled = true } = {}) {
  const handlers = useRef({ onUpdate, onReconnect });
  handlers.current = { onUpdate, onReconnect };

  useEffect(() => {
    if (!enabled || !workerId) return undefined;
    return subscribeLive((event) => {
      if (event.kind === "STREAM_CONNECTED") {
        if (event.reconnected) handlers.current.onReconnect?.();
        return;
      }
      if (event.kind !== "WORKER_UPDATE") return;
      if (workerId !== ANY_WORKER && event.workerId !== workerId) return;
      handlers.current.onUpdate?.(event);
    });
  }, [workerId, enabled]);
}

// Leading + trailing throttle for refetch-on-event: at most one call per
// `waitMs`, and the last request inside a window is never lost.
export function useThrottledCallback(fn, waitMs) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const state = useRef({ last: 0, timer: null });

  useEffect(() => () => clearTimeout(state.current.timer), []);

  return useCallback(() => {
    const s = state.current;
    const now = Date.now();
    const remaining = waitMs - (now - s.last);
    if (remaining <= 0) {
      s.last = now;
      fnRef.current();
    } else if (!s.timer) {
      s.timer = setTimeout(() => {
        s.timer = null;
        s.last = Date.now();
        fnRef.current();
      }, remaining);
    }
  }, [waitMs]);
}
