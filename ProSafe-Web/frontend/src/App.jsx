import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { NotificationProvider } from "./context/NotificationContext";
import { ProtectedRoute } from "./components/routes/ProtectedRoute";
import { RoleRoute } from "./components/routes/RoleRoute";
import { AppLayout } from "./components/layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SettingsPage } from "./pages/SettingsPage";
import { UserListPage } from "./pages/users/UserListPage";
import { UserViewPage } from "./pages/users/UserViewPage";
import { AddUserPage } from "./pages/users/AddUserPage";
import { EditUserPage } from "./pages/users/EditUserPage";
import { HelmetListPage } from "./pages/helmets/HelmetListPage";
import { AnalyticsPage } from "./pages/analytics/AnalyticsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { USER_ROLES } from "./constants/roles";

function LoginRoute() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <NotificationProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginRoute />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/settings" element={<SettingsPage />} />

                  <Route element={<RoleRoute allow={[USER_ROLES.ADMIN]} />}>
                    <Route path="/users" element={<UserListPage />} />
                    <Route path="/users/add" element={<AddUserPage />} />
                    <Route path="/users/:id" element={<UserViewPage />} />
                    <Route path="/users/:id/edit" element={<EditUserPage />} />
                    <Route path="/helmets" element={<HelmetListPage />} />
                    <Route path="/analytics" element={<AnalyticsPage />} />
                  </Route>
                </Route>
              </Route>

              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </NotificationProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
