// Renders as a <button> (opens the sensor's history popup) when onClick is
// given, otherwise a plain <div> — same markup either way so the two usages
// never visually diverge.
export function SensorCard({ icon, label, value, unit, valid = true, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={`ps-sensor-card ${!valid ? "is-invalid" : ""} ${onClick ? "is-clickable" : ""}`}
      onClick={onClick}
    >
      <div className="ps-sensor-icon" aria-hidden="true">
        {icon}
      </div>
      <div className="ps-sensor-info">
        <span className="ps-sensor-label">{label}</span>
        <span className="ps-sensor-value">
          {value === null || value === undefined ? "—" : value}
          {value !== null && value !== undefined && unit ? <span className="ps-sensor-unit"> {unit}</span> : null}
        </span>
        {!valid && <span className="ps-sensor-flag">Reading flagged invalid</span>}
      </div>
    </Tag>
  );
}
