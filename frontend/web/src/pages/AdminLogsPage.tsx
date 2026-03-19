import { formatConsoleTime } from "../admin/console";
import { useAdminConsole } from "../admin/useAdminConsole";
import { useAuth } from "../auth/AuthProvider";
import { MetricCard, Notice, Panel, SectionHeader } from "../components/admin/AdminPrimitives";

export function AdminLogsPage() {
  const { auditEvents, dashboard, lastUpdatedAt, refreshConsole } = useAdminConsole();
  const { user } = useAuth();
  const locale = dashboard?.tenant.locale;
  const auditAllowed = user?.permissions.includes("audit:read") ?? false;
  const failedCount = auditEvents.filter((event) => !event.success).length;
  const successCount = auditEvents.filter((event) => event.success).length;
  const lastEvent = auditEvents[0]?.occurredAt ?? null;

  return (
    <div className="page-stack">
      <SectionHeader
        actions={
          <button className="action-button action-button--secondary" onClick={() => void refreshConsole()} type="button">
            Refresh logs
          </button>
        }
        description="Authentication and operator audit signals are surfaced here first so administrators can diagnose access issues before they become support incidents."
        eyebrow="Audit Stream"
        title="Logs"
      />

      {!auditAllowed ? (
        <Notice
          body={`Your ${user?.role ?? "viewer"} role does not include audit:read. The log shell remains visible, but event detail stays hidden until a higher-privilege role opens it.`}
          title="Audit visibility restricted"
          tone="warn"
        />
      ) : null}

      <section className="metric-grid">
        <MetricCard
          detail="Successful audit entries currently loaded into the admin shell."
          label="Success events"
          tone="good"
          value={String(successCount).padStart(2, "0")}
        />
        <MetricCard
          detail="Authentication failures or rejected operations visible in the recent window."
          label="Attention events"
          tone="critical"
          value={String(failedCount).padStart(2, "0")}
        />
        <MetricCard
          detail="Most recent event timestamp pulled into the current console session."
          label="Latest event"
          tone="accent"
          value={formatConsoleTime(lastEvent, locale)}
        />
        <MetricCard
          detail="Last refresh of the admin shell audit slice."
          label="Console sync"
          tone="neutral"
          value={formatConsoleTime(lastUpdatedAt, locale)}
        />
      </section>

      <section className="panel-grid panel-grid--two">
        <Panel description="Recent authentication and session lifecycle events from the API boundary." title="Audit events">
          {auditAllowed ? (
            <div className="event-list">
              {auditEvents.map((event) => (
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
                    {event.ipAddress ? <span>{event.ipAddress}</span> : null}
                    {event.reason ? <span>{event.reason}</span> : null}
                  </div>
                </article>
              ))}
              {auditEvents.length === 0 ? <div className="empty-state">No audit events available yet.</div> : null}
            </div>
          ) : (
            <div className="empty-state">Sign-in and password audit detail is hidden for the current role.</div>
          )}
        </Panel>

        <Panel description="Suggested channels to keep alongside authentication auditing as the platform grows." title="Operational log lanes">
          <div className="detail-list">
            <div className="detail-row">
              <div>
                <div className="detail-row__label">API access</div>
                <div className="detail-row__meta">Request summaries, rate limits, and permission denials</div>
              </div>
              <span className="tone-pill tone-pill--good">Planned</span>
            </div>
            <div className="detail-row">
              <div>
                <div className="detail-row__label">GTFS import</div>
                <div className="detail-row__meta">Feed validation, import duration, and publish errors</div>
              </div>
              <span className="tone-pill tone-pill--accent">Next phase</span>
            </div>
            <div className="detail-row">
              <div>
                <div className="detail-row__label">Device telemetry</div>
                <div className="detail-row__meta">Heartbeat, connectivity, and controller health</div>
              </div>
              <span className="tone-pill tone-pill--warn">Recommended</span>
            </div>
          </div>
        </Panel>
      </section>
    </div>
  );
}
