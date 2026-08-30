import { useEffect, useState } from "react";
import { Field, Select } from "../ui/Input";
import { getAssignableHelmets } from "../../api/helmetApi";

// #18 — hidden entirely for ADMIN (caller controls that). For WORKER, loads
// real helmet ids from the backend (#8: never hardcode the dropdown) and
// always offers "No helmet assigned". `currentHelmetId` (edit mode) makes
// sure the helmet already held by this user still shows up as an option.
export function HelmetAssignField({ value, onChange, currentHelmetId, error }) {
  const [helmets, setHelmets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAssignableHelmets(currentHelmetId)
      .then((data) => {
        if (!cancelled) setHelmets(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentHelmetId]);

  return (
    <Field label="Helmet" htmlFor="helmetId" error={error || loadError}>
      <Select
        id="helmetId"
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={loading}
        error={!!error}
      >
        <option value="">No helmet assigned</option>
        {currentHelmetId && !helmets.some((h) => h.helmetId === currentHelmetId) && (
          <option value={currentHelmetId}>{currentHelmetId} (currently assigned)</option>
        )}
        {helmets.map((h) => (
          <option key={h.helmetId} value={h.helmetId}>
            {h.helmetId}
          </option>
        ))}
      </Select>
      {loading && <span className="ps-help-text">Loading helmets…</span>}
    </Field>
  );
}
