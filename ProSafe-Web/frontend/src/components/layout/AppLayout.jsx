import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
