import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { USER_ROLES } from "../../constants/roles";
import logo from "../../assets/prosafe-logo.png";

// #36 — RBAC sidebar: admin gets the full nav, worker gets a reduced set.
// Dashboard/Helmets/Analytics/Settings are placeholders this phase (routed,
// but not implemented) — only Users is real.
const ADMIN_LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: "🏠" },
  { to: "/users", label: "Users", icon: "👤" },
  { to: "/helmets", label: "Helmets", icon: "⛑" },
  { to: "/analytics", label: "Analytics", icon: "📊" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

const WORKER_LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: "🏠" },
  { to: "/profile", label: "My Profile", icon: "👤" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

export function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const links = user?.role === USER_ROLES.ADMIN ? ADMIN_LINKS : WORKER_LINKS;

  return (
    <>
      {open && <div className="ps-sidebar-scrim" onClick={onClose} aria-hidden="true" />}
      <aside className={`ps-sidebar ${open ? "is-open" : ""}`} aria-label="Main navigation">
        <div className="ps-sidebar-brand">
          <img src={logo} alt="ProSafe Smart Helmet" className="ps-sidebar-logo" />
        </div>

        <nav className="ps-sidebar-nav">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `ps-nav-item ${isActive ? "is-active" : ""}`}
              onClick={onClose}
            >
              <span className="ps-nav-icon" aria-hidden="true">
                {link.icon}
              </span>
              {link.label}
            </NavLink>
          ))}

          <div className="ps-sidebar-divider" />

          <button type="button" className="ps-nav-item ps-nav-logout" onClick={logout}>
            <span className="ps-nav-icon" aria-hidden="true">
              ⎋
            </span>
            Logout
          </button>
        </nav>

        <div className="ps-sidebar-status">
          <span className="ps-status-dot" aria-hidden="true" />
          <div>
            <div className="ps-status-title">System Status</div>
            <div className="ps-status-desc">All systems operational</div>
          </div>
        </div>
      </aside>
    </>
  );
}
