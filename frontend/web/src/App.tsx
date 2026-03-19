import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./auth/AuthProvider";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminDashboard } from "./pages/AdminDashboard";
import { LoginPage } from "./pages/LoginPage";

export function App() {
  const { status } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute permission="admin:access" />}>
        <Route path="/admin" element={<AdminDashboard />} />
      </Route>
      <Route
        path="*"
        element={<Navigate replace to={status === "authenticated" ? "/admin" : "/login"} />}
      />
    </Routes>
  );
}