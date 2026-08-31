import { useAuth } from "../context/AuthContext";
import { USER_ROLES } from "../constants/roles";
import { AdminDashboard } from "./dashboard/AdminDashboard";
import { WorkerDashboard } from "./dashboard/WorkerDashboard";

// One route (/dashboard, per #22), branching purely on the authenticated
// role — the real access restriction is enforced by the backend's separate
// /api/dashboard/admin and /api/dashboard/worker endpoints, not by this
// branch alone.
export function DashboardPage() {
  const { user } = useAuth();
  return user?.role === USER_ROLES.ADMIN ? <AdminDashboard /> : <WorkerDashboard />;
}
