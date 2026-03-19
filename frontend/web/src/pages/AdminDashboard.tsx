import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { ApiError, changePassword, fetchAdminDashboard, fetchAuditEvents } from "../auth/authClient";
import type { AdminDashboardResponse, AuditEvent } from "../auth/types";

export function AdminDashboard() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [dashboard, setDashboard] = useState<AdminDashboardResponse | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      try {
        const dashboardResponse = await fetchAdminDashboard();
        const auditResponse = user?.permissions.includes("audit:read") ? await fetchAuditEvents(20) : [];

        if (!isCancelled) {
          setDashboard(dashboardResponse);
          setAuditEvents(auditResponse);
        }
      } catch (loadError) {
        if (loadError instanceof ApiError && loadError.status === 401) {
          await logout();
          navigate("/login", { replace: true });
          return;
        }

        if (!isCancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load admin dashboard.");
        }
      }
    }

    void loadData();

    return () => {
      isCancelled = true;
    };
  }, [logout, navigate, user?.permissions]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  async function handlePasswordChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(null);
    setIsSubmittingPassword(true);

    try {
      await changePassword(currentPassword, nextPassword);
      setCurrentPassword("");
      setNextPassword("");
      setPasswordMessage("Password updated and active sessions were rotated.");
    } catch (changeError) {
      if (changeError instanceof ApiError && changeError.status === 401) {
        await logout();
        navigate("/login", { replace: true });
        return;
      }

      setPasswordMessage(changeError instanceof Error ? changeError.message : "Unable to change password.");
    } finally {
      setIsSubmittingPassword(false);
    }
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Protected Admin Route</p>
          <h1 style={titleStyle}>Operations and access control</h1>
          <p style={copyStyle}>
            Signed in as <strong>{user?.displayName}</strong> with the <strong>{user?.role}</strong> role.
          </p>
        </div>
        <button onClick={handleLogout} style={logoutButtonStyle} type="button">
          Sign out
        </button>
      </header>

      {error ? <p style={errorStyle}>{error}</p> : null}

      <section style={gridStyle}>
        <article style={cardStyle}>
          <h2 style={cardTitleStyle}>Role snapshot</h2>
          <p style={mutedStyle}>{dashboard?.auth.roleLabel ?? "Loading role..."}</p>
          <div style={pillRowStyle}>
            {(user?.permissions ?? []).map((permission) => (
              <span key={permission} style={pillStyle}>{permission}</span>
            ))}
          </div>
        </article>

        <article style={cardStyle}>
          <h2 style={cardTitleStyle}>Tenant scope</h2>
          <p style={statStyle}>{dashboard?.tenant.displayName ?? "Loading tenant..."}</p>
          <p style={mutedStyle}>{dashboard?.tenant.id}</p>
          {dashboard?.bootstrapUsersEnabled ? (
            <p style={hintStyle}>
              Bootstrap users are enabled for this environment. Default local password: <strong>{dashboard.bootstrapPasswordHint}</strong>
            </p>
          ) : null}
        </article>

        <article style={cardStyle}>
          <h2 style={cardTitleStyle}>Feature flags</h2>
          <div style={featureListStyle}>
            {Object.entries(dashboard?.featureFlags ?? {}).map(([flag, enabled]) => (
              <div key={flag} style={featureRowStyle}>
                <span>{flag}</span>
                <strong style={{ color: enabled ? "#0b7a43" : "#8a2332" }}>{enabled ? "on" : "off"}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section style={secondaryGridStyle}>
        <article style={cardStyle}>
          <h2 style={cardTitleStyle}>Password change</h2>
          <form onSubmit={handlePasswordChange} style={formStyle}>
            <label style={labelStyle}>
              Current password
              <input
                autoComplete="current-password"
                onChange={(event) => setCurrentPassword(event.target.value)}
                style={inputStyle}
                type="password"
                value={currentPassword}
              />
            </label>
            <label style={labelStyle}>
              New password
              <input
                autoComplete="new-password"
                onChange={(event) => setNextPassword(event.target.value)}
                style={inputStyle}
                type="password"
                value={nextPassword}
              />
            </label>
            <button disabled={isSubmittingPassword} style={primaryButtonStyle} type="submit">
              {isSubmittingPassword ? "Updating..." : "Change password"}
            </button>
          </form>
          {passwordMessage ? <p style={mutedStyle}>{passwordMessage}</p> : null}
        </article>

        <article style={cardStyle}>
          <h2 style={cardTitleStyle}>Audit activity</h2>
          {user?.permissions.includes("audit:read") ? (
            <div style={auditListStyle}>
              {auditEvents.map((event) => (
                <article key={event.id} style={auditItemStyle}>
                  <div style={auditHeaderStyle}>
                    <strong>{event.type}</strong>
                    <span>{new Date(event.occurredAt).toLocaleString()}</span>
                  </div>
                  <p style={auditBodyStyle}>{event.email ?? event.userId ?? "system"}</p>
                  <p style={auditMetaStyle}>
                    {event.success ? "success" : "failure"}
                    {event.reason ? ` • ${event.reason}` : ""}
                  </p>
                </article>
              ))}
              {auditEvents.length === 0 ? <p style={mutedStyle}>No audit events yet.</p> : null}
            </div>
          ) : (
            <p style={mutedStyle}>Your role does not include audit log access.</p>
          )}
        </article>
      </section>
    </main>
  );
}

const pageStyle = {
  background: "linear-gradient(180deg, #f7fbff 0%, #eff4f9 100%)",
  color: "#112538",
  fontFamily: '"Trebuchet MS", "Aptos", sans-serif',
  minHeight: "100vh",
  padding: "24px"
} as const;

const headerStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "18px",
  justifyContent: "space-between",
  margin: "0 auto 24px",
  maxWidth: "1180px"
} as const;

const eyebrowStyle = {
  color: "#0f5fa8",
  fontSize: "0.78rem",
  letterSpacing: "0.15em",
  marginBottom: "10px",
  textTransform: "uppercase"
} as const;

const titleStyle = {
  fontSize: "clamp(2rem, 4vw, 3.4rem)",
  margin: 0
} as const;

const copyStyle = {
  color: "#506477",
  marginTop: "10px"
} as const;

const gridStyle = {
  display: "grid",
  gap: "18px",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  margin: "0 auto 18px",
  maxWidth: "1180px"
} as const;

const secondaryGridStyle = {
  display: "grid",
  gap: "18px",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  margin: "0 auto",
  maxWidth: "1180px"
} as const;

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #d5e0ea",
  borderRadius: "22px",
  boxShadow: "0 18px 45px rgba(17, 37, 56, 0.08)",
  padding: "24px"
} as const;

const cardTitleStyle = {
  fontSize: "1.2rem",
  marginBottom: "14px"
} as const;

const statStyle = {
  fontSize: "1.4rem",
  fontWeight: 700,
  marginBottom: "4px"
} as const;

const mutedStyle = {
  color: "#5c7084",
  lineHeight: 1.7,
  margin: 0
} as const;

const hintStyle = {
  background: "#eef7ff",
  borderRadius: "16px",
  color: "#27455e",
  marginTop: "16px",
  padding: "14px"
} as const;

const pillRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px"
} as const;

const pillStyle = {
  background: "#edf4fb",
  borderRadius: "999px",
  color: "#1f4768",
  fontSize: "0.84rem",
  padding: "8px 12px"
} as const;

const featureListStyle = {
  display: "grid",
  gap: "12px"
} as const;

const featureRowStyle = {
  alignItems: "center",
  display: "flex",
  justifyContent: "space-between"
} as const;

const formStyle = {
  display: "grid",
  gap: "14px"
} as const;

const labelStyle = {
  color: "#29475f",
  display: "grid",
  gap: "8px"
} as const;

const inputStyle = {
  background: "#f6f9fc",
  border: "1px solid #d4dde7",
  borderRadius: "14px",
  fontSize: "1rem",
  padding: "12px 14px"
} as const;

const primaryButtonStyle = {
  background: "linear-gradient(135deg, #0f5fa8 0%, #1f8ce0 100%)",
  border: 0,
  borderRadius: "14px",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 700,
  padding: "12px 16px"
} as const;

const logoutButtonStyle = {
  background: "#10243a",
  border: 0,
  borderRadius: "14px",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 700,
  padding: "12px 18px"
} as const;

const auditListStyle = {
  display: "grid",
  gap: "12px"
} as const;

const auditItemStyle = {
  background: "#f5f8fb",
  borderRadius: "16px",
  padding: "14px"
} as const;

const auditHeaderStyle = {
  alignItems: "center",
  color: "#203b54",
  display: "flex",
  fontSize: "0.88rem",
  justifyContent: "space-between",
  marginBottom: "6px"
} as const;

const auditBodyStyle = {
  margin: 0
} as const;

const auditMetaStyle = {
  color: "#617789",
  fontSize: "0.9rem",
  marginTop: "6px"
} as const;

const errorStyle = {
  background: "#fff1f1",
  border: "1px solid #ebb7b7",
  borderRadius: "16px",
  color: "#8b2630",
  margin: "0 auto 18px",
  maxWidth: "1180px",
  padding: "14px 16px"
} as const;
