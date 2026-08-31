import { GlassCard } from "../ui/GlassCard";
import { Button } from "../ui/Button";

const PERIODS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export function AnalyticsToolbar({ period, date, periodLabel, onPeriodChange, onDateChange, onRefresh, refreshing, onDownload, downloading }) {
  return (
    <GlassCard className="ps-analytics-toolbar">
      <div className="ps-analytics-toolbar-row">
        <div className="ps-filter-pills">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`ps-filter-pill ${period === p.value ? "is-active" : ""}`}
              onClick={() => onPeriodChange(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <input
          type="date"
          className="ps-date-input"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          aria-label="Select reference date"
        />

        <div className="ps-analytics-toolbar-actions">
          <Button variant="secondary" size="sm" onClick={onRefresh} loading={refreshing}>
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={onDownload} loading={downloading} disabled={downloading}>
            Download Report
          </Button>
        </div>
      </div>

      {periodLabel && <p className="ps-analytics-period-label">{periodLabel}</p>}
    </GlassCard>
  );
}
