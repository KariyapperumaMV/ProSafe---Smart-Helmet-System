export function SensorCard({ icon, label, value, unit, valid = true }) {
  return (
    <div className={`ps-sensor-card ${!valid ? "is-invalid" : ""}`}>
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
    </div>
  );
}
