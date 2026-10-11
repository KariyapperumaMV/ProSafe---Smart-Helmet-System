import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveWorkerUpdates, useThrottledCallback } from "./useLiveWorkerUpdates";

// Fallback poll only: live worker updates (SSE) keep dashboards current as
// soon as the backend processes new helmet data.
const REFRESH_INTERVAL_MS = 60 * 1000;
// Refetch-on-event is throttled so a 1 Hz helmet stream (or many workers)
// can't turn into a request storm / constant re-render.
export const LIVE_REFETCH_MIN_MS = 5 * 1000;

// Fetch immediately on mount, then on a fixed interval, stopping cleanly on
// unmount. Shared by AdminDashboard/WorkerDashboard so the polling/cleanup
// logic exists — and is tested — in exactly one place.
//
// live (optional): { workerId, applyUpdate }
//   workerId    - worker to follow (or ANY_WORKER)
//   applyUpdate - (data, event) => data: merge the event locally (no
//                 request); without it a matching event triggers a
//                 throttled refetch instead
// After a stream reconnect the data is always refetched.
export function useDashboardData(fetchFn, live = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Ref so the interval callback always calls the latest fetchFn without
  // needing it in the effect's dependency array (an inline arrow function
  // passed by the caller would otherwise restart the interval every render).
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const load = useCallback(() => {
    return fetchFnRef
      .current()
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err) => setError(err));
  }, []);

  const refetchThrottled = useThrottledCallback(load, LIVE_REFETCH_MIN_MS);
  const applyRef = useRef(live?.applyUpdate);
  applyRef.current = live?.applyUpdate;
  useLiveWorkerUpdates(
    live?.workerId || null,
    (event) => {
      if (applyRef.current) setData((prev) => applyRef.current(prev, event));
      else refetchThrottled();
    },
    { onReconnect: load }
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });

    const intervalId = setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [load]);

  return { data, loading, error, refetch: load };
}
