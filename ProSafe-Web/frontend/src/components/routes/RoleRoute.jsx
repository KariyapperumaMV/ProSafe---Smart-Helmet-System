import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

// #35 — client-side gate only stops the UI from rendering admin pages for a
// worker; the backend enforces the same restriction independently (every
// /api/users* write and list route checks req.user.role itself), so a
// worker typing the URL directly still gets a 403 from the API, not just a
// redirect here.
export function RoleRoute({ allow }) {
  const { user } = useAuth();

  if (!user || !allow.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
