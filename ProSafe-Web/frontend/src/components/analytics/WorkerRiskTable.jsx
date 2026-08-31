import { useNavigate } from "react-router-dom";
import { GlassCard } from "../ui/GlassCard";
import { EmptyState } from "../ui/EmptyState";
import { RiskBadge } from "../ui/StatusBadge";

// Transparent counts only — no hidden weighted "risk score" (#6/#9). Sort
// order (emergency desc, then critical, then warning, then total, then
// workerId) is decided entirely by the backend; this component just
// displays whatever order it's given and says so in the caption.
export function WorkerRiskTable({ workers }) {
  const navigate = useNavigate();

  return (
    <GlassCard className="ps-analytics-card ps-worker-risk-card">
      <h3 className="ps-detail-section-title">Workers Requiring Attention</h3>
      <p className="ps-help-text">Sorted by emergency count, then critical, then warning, then total alerts.</p>

      {!workers.length ? (
        <EmptyState icon="✅" title="No workers with alerts in this period" />
      ) : (
        <div className="ps-table-scroll">
          <table className="ps-analytics-table">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Warning</th>
                <th>Critical</th>
                <th>Emergency</th>
                <th>Total Alerts</th>
                <th>Latest Risk (this period)</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.workerId} className="ps-clickable-row" onClick={() => navigate(`/users/${w.workerId}`)}>
                  <td>{w.workerName}</td>
                  <td>{w.warning}</td>
                  <td>{w.critical}</td>
                  <td>{w.emergency}</td>
                  <td>
                    <strong>{w.totalAlerts}</strong>
                  </td>
                  <td>{w.latestRiskState ? <RiskBadge state={w.latestRiskState} /> : <span className="ps-help-text">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}
