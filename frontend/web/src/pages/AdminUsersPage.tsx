import { roleBlueprints } from "../admin/console";
import { useAdminConsole } from "../admin/useAdminConsole";
import { useAuth } from "../auth/AuthProvider";
import { MetricCard, Notice, Panel, SectionHeader } from "../components/admin/AdminPrimitives";

export function AdminUsersPage() {
  const { dashboard } = useAdminConsole();
  const { user } = useAuth();
  const canManageUsers = user?.permissions.includes("users:manage") ?? false;
  const auditAllowed = user?.permissions.includes("audit:read") ?? false;

  return (
    <div className="page-stack">
      <SectionHeader
        description="Review the current role model, session identity, and account-governance posture for the transport admin surface."
        eyebrow="Access Matrix"
        title="Users"
      />

      {!canManageUsers ? (
        <Notice
          body={`Your ${user?.role ?? "viewer"} role can inspect the access model, but account provisioning and role changes are reserved for super_admin operators.`}
          title="User administration restricted"
          tone="warn"
        />
      ) : null}

      <section className="metric-grid">
        <MetricCard
          detail="Identity currently bound to the active session cookie."
          label="Session user"
          tone="accent"
          value={user?.displayName ?? "Unknown"}
        />
        <MetricCard
          detail="Configured role label resolved by the backend auth module."
          label="Resolved role"
          tone="good"
          value={dashboard?.auth.roleLabel ?? user?.role ?? "viewer"}
        />
        <MetricCard
          detail="Permissions attached to the current session."
          label="Permission count"
          tone="neutral"
          value={String(user?.permissions.length ?? 0).padStart(2, "0")}
        />
        <MetricCard
          detail="Audit visibility available to the current role."
          label="Audit scope"
          tone={auditAllowed ? "good" : "warn"}
          value={auditAllowed ? "Granted" : "Restricted"}
        />
      </section>

      <section className="panel-grid panel-grid--two">
        <Panel description="Current session identity and self-service boundaries." title="Session identity">
          <div className="detail-list">
            <div className="detail-row">
              <div>
                <div className="detail-row__label">Display name</div>
                <div className="detail-row__meta">Operator label shown across the shell</div>
              </div>
              <span className="tone-pill tone-pill--neutral">{user?.displayName}</span>
            </div>
            <div className="detail-row">
              <div>
                <div className="detail-row__label">Email</div>
                <div className="detail-row__meta">Primary sign-in identifier</div>
              </div>
              <span className="tone-pill tone-pill--accent">{user?.email}</span>
            </div>
            <div className="detail-row">
              <div>
                <div className="detail-row__label">Self-service auth</div>
                <div className="detail-row__meta">Password changes remain available to the signed-in user</div>
              </div>
              <span className="tone-pill tone-pill--good">Enabled</span>
            </div>
          </div>
        </Panel>

        <Panel description="How the initial transport-control roles divide responsibility." title="Role blueprint">
          <div className="role-list">
            {roleBlueprints.map((role) => (
              <article className="role-card" key={role.role}>
                <div className="role-card__header">
                  <strong>{role.label}</strong>
                  <span className={`tone-pill tone-pill--${role.role === user?.role ? "accent" : "neutral"}`}>
                    {role.role}
                  </span>
                </div>
                <p className="role-card__description">{role.description}</p>
                <div className="role-card__access">{role.access}</div>
                <div className="role-card__permissions">
                  {role.permissions.map((permission) => (
                    <span className="tone-pill tone-pill--neutral" key={`${role.role}-${permission}`}>
                      {permission}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}
