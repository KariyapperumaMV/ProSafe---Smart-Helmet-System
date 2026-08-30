const RISK_TONE = {
  SAFE: "green",
  WARNING: "warning",
  CRITICAL: "danger",
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
  return <StatusBadge tone={RISK_TONE[state] || "neutral"}>{state}</StatusBadge>;
}

export function RoleBadge({ role }) {
  return <StatusBadge tone={ROLE_TONE[role] || "neutral"}>{role === "ADMIN" ? "Admin" : "Worker"}</StatusBadge>;
}
