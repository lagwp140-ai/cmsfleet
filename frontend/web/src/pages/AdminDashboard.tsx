import { adminSections, canAccessSection, countEnabledFlags, formatConsoleTime } from "../admin/console";
import { useAdminConsole } from "../admin/useAdminConsole";
import { useAuth } from "../auth/AuthProvider";
import { MetricCard, Notice, Panel, SectionHeader } from "../components/admin/AdminPrimitives";

export function AdminDashboard() {
  const { auditEvents, dashboard, lastUpdatedAt, refreshConsole } = useAdminConsole();
  const { user } = useAuth();
  const locale = dashboard?.tenant.locale;
  const enabledFlags = countEnabledFlags(dashboard?.featureFlags);
  const accessibleModules = adminSections.filter((section) => canAccessSection(user?.permissions ?? [], section)).length;
  const restrictedModules = adminSections.length - accessibleModules;
  const auditAllowed = user?.permissions.includes("audit:read") ?? false;

  return (
    <div className="page-stack">
      <SectionHeader
        actions={
          <button className="action-button action-button--secondary" onClick={() => void refreshConsole()} type="button">
            Refresh dashboard
          </button>
        }
        description="A transport-control shell tuned for route data, device posture, and field operations instead of generic back-office reporting."
        eyebrow="Control Surface"
        title="Dashboard"
      />

      <section className="metric-grid">
        <MetricCard
          detail="The RBAC layer currently mapped onto the signed-in operator."
          label="Access profile"
          tone="accent"
          value={dashboard?.auth.roleLabel ?? user?.role ?? "viewer"}
        />
        <MetricCard
          detail="Feature flags currently enabled for this transport deployment."
          label="Enabled flags"
          tone="good"
          value={String(enabledFlags).padStart(2, "0")}
        />
        <MetricCard
          detail="Modules visible to your role in the current shell."
          label="Reachable modules"
          tone="good"
          value={`${accessibleModules}/${adminSections.length}`}
        />
        <MetricCard
          detail={`Last control-plane sync rendered using ${locale ?? "browser"} locale preferences.`}
          label="Last sync"
          tone="neutral"
          value={formatConsoleTime(lastUpdatedAt, locale)}
        />
      </section>

      <section className="panel-grid panel-grid--two">
        <Panel description="Operational modules exposed by the current role and shell layout." title="Module lanes">
          <div className="detail-list">
            {adminSections.map((section) => {
              const accessible = canAccessSection(user?.permissions ?? [], section);

              return (
                <div className="detail-row" key={section.key}>
                  <div>
                    <div className="detail-row__label">{section.label}</div>
                    <div className="detail-row__meta">{section.description}</div>
                  </div>
                  <span className={`tone-pill tone-pill--${accessible ? "good" : "warn"}`}>
                    {accessible ? "Visible" : "Restricted"}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel description="Quick transport-operational posture for the shared CMS core." title="Transport control surface">
          <div className="detail-list">
            <div className="detail-row">
              <div>
                <div className="detail-row__label">Vehicles and devices</div>
                <div className="detail-row__meta">Onboard hardware and field readiness are treated as first-class operational data.</div>
              </div>
              <span className="tone-pill tone-pill--good">Ready</span>
            </div>
            <div className="detail-row">
              <div>
                <div className="detail-row__label">GPS and routes</div>
                <div className="detail-row__meta">AVL freshness and route strategy stay visible before content is published downstream.</div>
              </div>
              <span className="tone-pill tone-pill--accent">Tracked</span>
            </div>
            <div className="detail-row">
              <div>
                <div className="detail-row__label">Displays and GTFS</div>
                <div className="detail-row__meta">Destination rendering and schedule inputs stay configuration-led for multi-tenant reuse.</div>
              </div>
              <span className="tone-pill tone-pill--good">Profile-led</span>
            </div>
          </div>
        </Panel>
      </section>

      {!auditAllowed ? (
        <Notice
          body={`Your ${user?.role ?? "viewer"} role can open the dashboard, but audit event detail remains locked until the audit:read permission is granted.`}
          title="Audit stream restricted"
          tone="warn"
        />
      ) : null}

      <section className="panel-grid panel-grid--two">
        <Panel description="Most recent authentication and session-related events from the backend audit trail." title="Recent auth activity">
          {auditAllowed ? (
            <div className="event-list">
              {auditEvents.slice(0, 6).map((event) => (
                <article className="event-item" key={event.id}>
                  <div className="event-item__header">
                    <strong>{event.type}</strong>
                    <span>{new Date(event.occurredAt).toLocaleString(locale ?? undefined)}</span>
                  </div>
                  <div className="event-item__body">{event.email ?? event.userId ?? "system"}</div>
                  <div className="event-item__meta">
                    <span className={`tone-pill tone-pill--${event.success ? "good" : "critical"}`}>
                      {event.success ? "success" : "failure"}
                    </span>
                    {event.reason ? <span>{event.reason}</span> : null}
                  </div>
                </article>
              ))}
              {auditEvents.length === 0 ? <div className="empty-state">No audit events recorded in this session window yet.</div> : null}
            </div>
          ) : (
            <div className="empty-state">Audit visibility is restricted for the current role.</div>
          )}
        </Panel>

        <Panel description="Tenant-bound system context resolved from the configuration-first runtime." title="Tenant profile">
          <div className="detail-list">
            <div className="detail-row">
              <div>
                <div className="detail-row__label">Tenant</div>
                <div className="detail-row__meta">Resolved deployment identity</div>
              </div>
              <span className="tone-pill tone-pill--neutral">{dashboard?.tenant.displayName ?? "Shared CMS Core"}</span>
            </div>
            <div className="detail-row">
              <div>
                <div className="detail-row__label">Locale and timezone</div>
                <div className="detail-row__meta">Formatting posture for operators and logs</div>
              </div>
              <span className="tone-pill tone-pill--accent">{dashboard ? `${dashboard.tenant.locale} / ${dashboard.tenant.timezone}` : "Pending"}</span>
            </div>
            <div className="detail-row">
              <div>
                <div className="detail-row__label">Password policy</div>
                <div className="detail-row__meta">Minimum credential length for self-service updates</div>
              </div>
              <span className="tone-pill tone-pill--good">{dashboard?.auth.passwordMinLength ?? 12} chars</span>
            </div>
            <div className="detail-row">
              <div>
                <div className="detail-row__label">Restricted modules</div>
                <div className="detail-row__meta">Areas currently outside your role scope</div>
              </div>
              <span className="tone-pill tone-pill--warn">{restrictedModules}</span>
            </div>
          </div>
        </Panel>
      </section>
    </div>
  );
}
