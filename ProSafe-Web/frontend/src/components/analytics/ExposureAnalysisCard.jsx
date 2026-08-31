import { GlassCard } from "../ui/GlassCard";

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs ? `${mins}m ${secs}s` : `${mins}m`;
}

function ExposureBlock({ title, workers }) {
  return (
    <div className="ps-health-block">
      <h4>{title}</h4>
      {!workers.length ? (
        <p className="ps-help-text">No exposure streaks recorded.</p>
      ) : (
        <ul className="ps-mini-rank-list">
          {workers.slice(0, 5).map((w) => (
            <li key={w.workerId}>
              <span>{w.workerName}</span>
              <span>{formatDuration(w.longestStreakSeconds)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// "Longest continuous streak" only — deliberately never labeled "Total
// Exposure" (#11), since the underlying field resets to 0 whenever the
// abnormal condition clears and summing it would multiply-count every
// streak (see backend analyticsService.js for the full explanation).
export function ExposureAnalysisCard({ exposure }) {
  return (
    <GlassCard className="ps-analytics-card">
      <h3 className="ps-detail-section-title">Exposure Analysis</h3>
      <p className="ps-help-text">Longest continuous abnormal exposure streak recorded per worker.</p>
      <div className="ps-health-grid">
        <ExposureBlock title="Longest Noise Exposure Streak" workers={exposure.noise.topWorkers} />
        <ExposureBlock title="Longest Heart Rate Deviation Streak" workers={exposure.heartRate.topWorkers} />
      </div>
    </GlassCard>
  );
}
