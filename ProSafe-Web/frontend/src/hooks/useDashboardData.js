import { useCallback, useEffect, useRef, useState } from "react";

// Normal helmet packets arrive ~60s apart — polling faster wouldn't surface
// anything new, and WebSockets would be a lot of new architecture for a
// single page (#14 in the analysis: explicitly deferred).
const REFRESH_INTERVAL_MS = 60 * 1000;

// Fetch immediately on mount, then on a fixed interval, stopping cleanly on
// unmount. Shared by AdminDashboard/WorkerDashboard so the polling/cleanup
// logic exists — and is tested — in exactly one place.
export function useDashboardData(fetchFn) {
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
