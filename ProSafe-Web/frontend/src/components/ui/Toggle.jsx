// A native checkbox styled as a switch — keeps keyboard/screen-reader
// support for free instead of hand-rolling role="switch" semantics.
export function Toggle({ checked, onChange, label, description, lockedNote, disabled = false }) {
  return (
    <label className={`ps-toggle-row ${disabled ? "is-disabled" : ""}`}>
      <span className="ps-toggle-text">
        <span className="ps-toggle-label">{label}</span>
        {description && <span className="ps-toggle-desc">{description}</span>}
        {lockedNote && <span className="ps-toggle-locked-note">{lockedNote}</span>}
      </span>
      <span className="ps-toggle-switch">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        <span className="ps-toggle-track" aria-hidden="true">
          <span className="ps-toggle-thumb" />
        </span>
      </span>
    </label>
  );
}
