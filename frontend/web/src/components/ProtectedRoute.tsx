import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";

export function ProtectedRoute({ permission }: { permission?: string }) {
  const { status, user } = useAuth();

  if (status === "loading") {
    return (
      <main style={shellStyle}>
        <section style={panelStyle}>
          <p style={eyebrowStyle}>Checking session</p>
          <h1 style={{ fontSize: "2rem", marginBottom: "12px" }}>Preparing your control panel</h1>
          <p style={bodyStyle}>Validating your access token and loading the correct role permissions.</p>
        </section>
      </main>
    );
  }

  if (!user || status === "guest") {
    return <Navigate replace to="/login" />;
  }

  if (permission && !user.permissions.includes(permission)) {
    return (
      <main style={shellStyle}>
        <section style={panelStyle}>
          <p style={eyebrowStyle}>Access denied</p>
          <h1 style={{ fontSize: "2rem", marginBottom: "12px" }}>This role cannot open this route</h1>
          <p style={bodyStyle}>
            Your current role is <strong>{user.role}</strong>. Ask a super admin if you need expanded access.
          </p>
        </section>
      </main>
    );
  }

  return <Outlet />;
}

const shellStyle = {
  alignItems: "center",
  background: "linear-gradient(135deg, #06121f 0%, #0d2840 55%, #12486a 100%)",
  color: "#f8fbff",
  display: "grid",
  fontFamily: '"Trebuchet MS", "Aptos", sans-serif',
  minHeight: "100vh",
  padding: "24px"
} as const;

const panelStyle = {
  background: "rgba(6, 18, 31, 0.78)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: "24px",
  margin: "0 auto",
  maxWidth: "620px",
  padding: "32px",
  width: "100%"
} as const;

const eyebrowStyle = {
  color: "#9fd9ff",
  fontSize: "0.8rem",
  letterSpacing: "0.14em",
  marginBottom: "12px",
  textTransform: "uppercase"
} as const;

const bodyStyle = {
  color: "#d5e6f5",
  lineHeight: 1.7
} as const;