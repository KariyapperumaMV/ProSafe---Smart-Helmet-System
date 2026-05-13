// src/App.js
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AdminLayout from "./admin/layout/AdminLayout";
import AdminDashboard from "./admin/pages/AdminDashboard";
import AdminUsers from "./admin/pages/AdminUsers";
import AdminReports from "./admin/pages/AdminReports";
import AdminAnalytics from "./admin/pages/AdminAnalytics";

import WorkerLayout from "./worker/layouts/WorkerLayout"
import WorkerDashboard from "./worker/pages/WorkerDashboard"

import Login from "./auth/Login";

//styles
import "./styles/admin.css";
import "./styles/login.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<Login />} />
        
        {/* Admin Routes*/}
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="analytics" element={<AdminAnalytics />} />
        </Route>

        {/* Worker Routes*/}
        <Route path="/worker" element={<WorkerLayout />} >
          <Route path="dashboard" element={<WorkerDashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

