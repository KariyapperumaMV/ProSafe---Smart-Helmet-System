import { describeUncertainReason } from "../../constants/uncertainReasons";

const RISK_TONE = {
  SAFE: "green",
  WARNING: "warning",
  CRITICAL: "danger",
  UNCERTAIN: "uncertain",
  EMERGENCY: "danger",
};

const RISK_LABEL = {
  UNCERTAIN: "Uncertain",
  EMERGENCY: "Emergency",
  UNKNOWN: "Unknown",
};

const ROLE_TONE = {
  ADMIN: "green",
  WORKER: "neutral",
};

export function StatusBadge({ tone = "neutral", children }) {
  return <span className={`ps-badge ps-badge-${tone}`}>{children}</span>;
}

export function RiskBadge({ state }) {
  if (!state) return <StatusBadge tone="neutral">Unknown</StatusBadge>;
  return <StatusBadge tone={RISK_TONE[state] || "neutral"}>{RISK_LABEL[state] || state}</StatusBadge>;
}

// Server-computed operational state (EMERGENCY / CRITICAL / WARNING / SAFE /
// UNCERTAIN / UNKNOWN) plus why it is uncertain. Never re-derived here: the
// backend's one rule (operationalStateService) already decided it, including
// "a confirmed WARNING/CRITICAL stays shown while the data are uncertain".
export function OperationalStatus({ status }) {
  if (!status) return <RiskBadge state={null} />;
  const state = status.operationalState || status.currentRiskState || null;
  const reason = status.dataUncertain ? describeUncertainReason(status.uncertainReason) : null;
  return (
    <span className="ps-operational-status">
      <RiskBadge state={state === "UNKNOWN" ? null : state} />
      {reason && (
        <span className="ps-status-reason">
          {state === "UNCERTAIN" ? reason : `Data uncertain: ${reason}`}
        </span>
      )}
    </span>
  );
}

export function RoleBadge({ role }) {
  return <StatusBadge tone={ROLE_TONE[role] || "neutral"}>{role === "ADMIN" ? "Admin" : "Worker"}</StatusBadge>;
}
