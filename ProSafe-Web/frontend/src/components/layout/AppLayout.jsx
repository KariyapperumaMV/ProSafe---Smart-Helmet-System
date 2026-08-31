import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useAppearance } from "../../hooks/useAppearance";

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Applies the user's stored compact-mode/reduce-animations classes to
  // <body> on every authenticated page, not just while Settings is open.
  useAppearance();

  return (
    <div className="ps-app-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="ps-app-main">
        <Header onMenuClick={() => setSidebarOpen((v) => !v)} />
        <main className="ps-app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
