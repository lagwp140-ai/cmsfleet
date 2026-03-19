import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { fetchAuthMetadata } from "../auth/authClient";
import type { AuthMetadataResponse } from "../auth/types";
import { useAuth } from "../auth/AuthProvider";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, status } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [metadata, setMetadata] = useState<AuthMetadataResponse | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadMetadata() {
      try {
        const nextMetadata = await fetchAuthMetadata();

        if (!isCancelled) {
          setMetadata(nextMetadata);
        }
      } catch {
        if (!isCancelled) {
          setMetadata({
            bootstrapUsers: [],
            passwordMinLength: 12
          });
        }
      }
    }

    void loadMetadata();

    return () => {
      isCancelled = true;
    };
  }, []);

  if (status === "authenticated") {
    return <Navigate replace to="/admin" />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
      navigate("/admin", { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <div style={badgeStyle}>Bus CMS Security</div>
        <h1 style={titleStyle}>Secure operator login for every transport deployment</h1>
        <p style={copyStyle}>
          Session-based authentication, role-driven admin access, and audit visibility now sit in front of the shared CMS core.
        </p>

        {metadata?.bootstrapUsers.length ? (
          <div style={bootstrapPanelStyle}>
            <h2 style={subheadingStyle}>Local bootstrap access</h2>
            <p style={bootstrapCopyStyle}>
              Default local password: <strong>{metadata.bootstrapPasswordHint}</strong>
            </p>
            <div style={accountGridStyle}>
              {metadata.bootstrapUsers.map((account) => (
                <button
                  key={account.email}
                  onClick={() => setEmail(account.email)}
                  style={accountCardStyle}
                  type="button"
                >
                  <strong>{account.role}</strong>
                  <span>{account.email}</span>
                  <span style={accountNameStyle}>{account.displayName}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section style={formShellStyle}>
        <form onSubmit={handleSubmit} style={formStyle}>
          <p style={eyebrowStyle}>Control Center</p>
          <h2 style={formTitleStyle}>Sign in</h2>
          <p style={formCopyStyle}>
            Use your role account to enter the protected admin console. Minimum password length: {metadata?.passwordMinLength ?? 12} characters.
          </p>

          <label style={labelStyle}>
            Email
            <input
              autoComplete="username"
              onChange={(event) => setEmail(event.target.value)}
              style={inputStyle}
              type="email"
              value={email}
            />
          </label>

          <label style={labelStyle}>
            Password
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              style={inputStyle}
              type="password"
              value={password}
            />
          </label>

          {error ? <p style={errorStyle}>{error}</p> : null}

          <button disabled={isSubmitting} style={buttonStyle} type="submit">
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

const pageStyle = {
  background: "radial-gradient(circle at top left, #0f5fa8 0%, #06121f 35%, #051019 100%)",
  color: "#f9fbfd",
  display: "grid",
  fontFamily: '"Trebuchet MS", "Aptos", sans-serif',
  gap: "24px",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  minHeight: "100vh",
  padding: "24px"
} as const;

const heroStyle = {
  alignContent: "center",
  display: "grid",
  gap: "16px",
  padding: "24px"
} as const;

const badgeStyle = {
  background: "rgba(255, 207, 93, 0.16)",
  border: "1px solid rgba(255, 207, 93, 0.4)",
  borderRadius: "999px",
  color: "#ffd57a",
  display: "inline-flex",
  fontSize: "0.78rem",
  letterSpacing: "0.16em",
  padding: "10px 14px",
  textTransform: "uppercase",
  width: "fit-content"
} as const;

const titleStyle = {
  fontSize: "clamp(2.5rem, 6vw, 4.6rem)",
  lineHeight: 0.95,
  margin: 0,
  maxWidth: "12ch"
} as const;

const copyStyle = {
  color: "#d3e5f7",
  fontSize: "1.05rem",
  lineHeight: 1.8,
  maxWidth: "60ch"
} as const;

const bootstrapPanelStyle = {
  backdropFilter: "blur(12px)",
  background: "rgba(8, 28, 43, 0.66)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: "24px",
  marginTop: "18px",
  padding: "22px"
} as const;

const subheadingStyle = {
  fontSize: "1.1rem",
  marginBottom: "8px"
} as const;

const bootstrapCopyStyle = {
  color: "#c7dcee",
  marginBottom: "16px"
} as const;

const accountGridStyle = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))"
} as const;

const accountCardStyle = {
  background: "rgba(255, 255, 255, 0.05)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "18px",
  color: "#e6f1fb",
  cursor: "pointer",
  display: "grid",
  gap: "6px",
  padding: "14px",
  textAlign: "left"
} as const;

const accountNameStyle = {
  color: "#a9c7df",
  fontSize: "0.9rem"
} as const;

const formShellStyle = {
  alignItems: "center",
  display: "grid",
  padding: "24px"
} as const;

const formStyle = {
  backdropFilter: "blur(16px)",
  background: "rgba(251, 252, 255, 0.96)",
  borderRadius: "28px",
  boxShadow: "0 28px 60px rgba(0, 0, 0, 0.24)",
  color: "#10233a",
  display: "grid",
  gap: "18px",
  maxWidth: "460px",
  padding: "32px",
  width: "100%"
} as const;

const eyebrowStyle = {
  color: "#0f5fa8",
  fontSize: "0.78rem",
  letterSpacing: "0.16em",
  margin: 0,
  textTransform: "uppercase"
} as const;

const formTitleStyle = {
  fontSize: "2rem",
  margin: 0
} as const;

const formCopyStyle = {
  color: "#4e6275",
  lineHeight: 1.6,
  margin: 0
} as const;

const labelStyle = {
  color: "#24415c",
  display: "grid",
  fontSize: "0.95rem",
  gap: "8px"
} as const;

const inputStyle = {
  background: "#f5f8fb",
  border: "1px solid #cad7e3",
  borderRadius: "16px",
  fontSize: "1rem",
  padding: "14px 16px"
} as const;

const errorStyle = {
  background: "#fff0f0",
  border: "1px solid #f2b6b6",
  borderRadius: "14px",
  color: "#a03030",
  margin: 0,
  padding: "12px 14px"
} as const;

const buttonStyle = {
  background: "linear-gradient(135deg, #0f5fa8 0%, #1d86d9 100%)",
  border: 0,
  borderRadius: "16px",
  color: "#ffffff",
  cursor: "pointer",
  fontSize: "1rem",
  fontWeight: 700,
  padding: "14px 18px"
} as const;
