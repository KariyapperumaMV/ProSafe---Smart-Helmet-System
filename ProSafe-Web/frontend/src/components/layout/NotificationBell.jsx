import { useEffect, useRef, useState } from "react";
import { useNotificationContext } from "../../context/NotificationContext";
import { formatRelativeTime } from "../../utils/formatRelativeTime";

const TYPE_ICONS = {
  EMERGENCY_ALERT: "🚨",
  EMERGENCY_RESET_REQUESTED: "🔄",
  EMERGENCY_RESOLVED: "✅",
  NEW_ALERT: "⚠️",
  USER_CREATED: "👤",
  DAILY_REPORT_READY: "📊",
  WEEKLY_REPORT_READY: "📊",
  MONTHLY_REPORT_READY: "📊",
};

export function NotificationBell() {
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotificationContext();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="ps-notif-bell" ref={rootRef}>
      <button
        type="button"
        className="ps-icon-btn ps-notif-trigger"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        🔔
        {unreadCount > 0 && (
          <span className="ps-notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="ps-dropdown ps-notif-dropdown" role="menu">
          <div className="ps-notif-dropdown-header">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button type="button" className="ps-notif-mark-all" onClick={markAllRead}>
                Mark all as read
              </button>
            )}
          </div>

          {loading && !notifications.length ? (
            <p className="ps-notif-empty">Loading…</p>
          ) : !notifications.length ? (
            <p className="ps-notif-empty">You're all caught up.</p>
          ) : (
            <ul className="ps-notif-list">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`ps-notif-item ${!n.read ? "is-unread" : ""}`}
                    onClick={() => markRead(n.id)}
                  >
                    <span className="ps-notif-item-icon" aria-hidden="true">
                      {TYPE_ICONS[n.type] || "🔔"}
                    </span>
                    <span className="ps-notif-item-body">
                      <span className="ps-notif-item-title">{n.title}</span>
                      <span className="ps-notif-item-message">{n.message}</span>
                      <span className="ps-notif-item-time">{formatRelativeTime(n.createdAt)}</span>
                    </span>
                    {!n.read && <span className="ps-notif-item-dot" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
