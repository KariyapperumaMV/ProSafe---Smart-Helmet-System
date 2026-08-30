export function LoadingState({ label = "Loading…" }) {
  return (
    <div className="ps-loading-state" role="status" aria-live="polite">
      <span className="ps-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function Spinner() {
  return <span className="ps-spinner" aria-hidden="true" />;
}
