import { createContext, useContext } from "react";
import { useNotifications } from "../hooks/useNotifications";

const NotificationContext = createContext(null);

// One SSE connection for the whole app (useNotifications owns it) — every
// consumer (NotificationBell, RecentAlertsCard) reads from this single
// provider instead of each opening its own stream.
export function NotificationProvider({ children }) {
  const value = useNotifications();
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotificationContext() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotificationContext must be used within NotificationProvider");
  return ctx;
}
