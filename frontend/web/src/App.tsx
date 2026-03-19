import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./auth/AuthProvider";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminShell } from "./layouts/AdminShell";
import { AdminDashboard } from "./pages/AdminDashboard";
import { GpsPage } from "./pages/GpsPage";
import { AdminLogsPage } from "./pages/AdminLogsPage";
import { AdminModulePage } from "./pages/AdminModulePage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { LoginPage } from "./pages/LoginPage";
import { VehiclesPage } from "./pages/VehiclesPage";

export function App() {
  const { status } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute permission="admin:access" />}>
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<AdminDashboard />} />
          <Route path="vehicles" element={<VehiclesPage />} />
          <Route path="gps" element={<GpsPage />} />
          <Route path="routes" element={<AdminModulePage moduleKey="routes" />} />
          <Route path="gtfs" element={<AdminModulePage moduleKey="gtfs" />} />
          <Route path="displays" element={<AdminModulePage moduleKey="displays" />} />
          <Route path="devices" element={<AdminModulePage moduleKey="devices" />} />
          <Route path="logs" element={<AdminLogsPage />} />
          <Route path="config" element={<AdminModulePage moduleKey="config" />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="system" element={<AdminModulePage moduleKey="system" />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate replace to={status === "authenticated" ? "/admin" : "/login"} />} />
    </Routes>
  );
}
