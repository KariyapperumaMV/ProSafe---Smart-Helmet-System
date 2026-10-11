// Live worker updates arrive on the app's single SSE connection (owned by
// hooks/useNotifications). They are fanned out through this tiny emitter
// rather than React state/context, so a stream of ~1 Hz events only
// re-renders the components that subscribed to the worker concerned — never
// the whole tree.
//
// Event kinds:
//   { kind: "WORKER_UPDATE", workerId, status, latest, points, ... }  (from the backend)
//   { kind: "STREAM_CONNECTED", reconnected }                        (local: stream (re)opened)
const listeners = new Set();

export function subscribeLive(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitLive(event) {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      // One faulty subscriber must not stop the others.
    }
  }
}

export function liveListenerCount() {
  return listeners.size;
}
