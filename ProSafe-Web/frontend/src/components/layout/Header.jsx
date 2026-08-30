import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { UserAvatar } from "../ui/UserAvatar";
import { USER_ROLES } from "../../constants/roles";

export function Header({ onMenuClick }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="ps-header">
      <button
        type="button"
        className="ps-menu-toggle"
        aria-label="Toggle navigation menu"
        onClick={onMenuClick}
      >
        ☰
      </button>

      <div className="ps-header-search">
        <span aria-hidden="true">🔍</span>
        <input type="search" placeholder="Search…" aria-label="Search" />
      </div>

      <div className="ps-header-actions">
        <button type="button" className="ps-icon-btn" aria-label="Notifications">
          🔔
        </button>

        <div className="ps-user-menu" ref={menuRef}>
          <button
            type="button"
            className="ps-user-menu-trigger"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
          >
            <UserAvatar name={user?.name} imageUrl={user?.profileImageUrl} size={38} />
            <span className="ps-user-menu-text">
              <span className="ps-user-menu-name">{user?.name}</span>
              <span className="ps-user-menu-role">{user?.role === USER_ROLES.ADMIN ? "Admin Account" : "Worker Account"}</span>
            </span>
            <span aria-hidden="true">▾</span>
          </button>

          {menuOpen && (
            <div className="ps-dropdown" role="menu">
              <button
                type="button"
                role="menuitem"
                className="ps-dropdown-item"
                onClick={() => {
                  setMenuOpen(false);
                  navigate(user?.role === USER_ROLES.ADMIN ? `/users/${user.userId}` : "/profile");
                }}
              >
                View Profile
              </button>
              <button type="button" role="menuitem" className="ps-dropdown-item ps-dropdown-danger" onClick={logout}>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
