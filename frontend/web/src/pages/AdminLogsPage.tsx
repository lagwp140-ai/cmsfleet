import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchSystemEvents } from "../admin/diagnosticsClient";
import type { SystemEventRecord } from "../admin/diagnosticsTypes";
import { fetchDisplayDeliveries } from "../admin/displayClient";
import type { DisplayDeliveryRecord } from "../admin/displayTypes";
import { fetchGpsMessages } from "../admin/gpsClient";
import type { RecentGpsMessageRecord } from "../admin/gpsTypes";
import { fetchGtfsLogs } from "../admin/gtfsClient";
import type { GtfsImportJobRecord } from "../admin/gtfsTypes";
import { useAdminConsole } from "../admin/useAdminConsole";
import { useAuth } from "../auth/AuthProvider";
import { ApiError, fetchAuditEvents } from "../auth/authClient";
import type { AuditEvent } from "../auth/types";
import { MetricCard, Notice, Panel, SectionHeader } from "../components/admin/AdminPrimitives";

interface DiagnosticsSnapshot {
  auditEvents: AuditEvent[];
  displayDeliveries: DisplayDeliveryRecord[];
  gpsErrors: RecentGpsMessageRecord[];
  gtfsLogs: GtfsImportJobRecord[];
  systemEvents: SystemEventRecord[];
}

type DiagnosticsLane = "all" | "auth" | "gps" | "gtfs" | "display" | "system";

interface FilterState {
  lane: DiagnosticsLane;
  limit: number;
  search: string;
}

const EMPTY_SNAPSHOT: DiagnosticsSnapshot = {
  auditEvents: [],
  displayDeliveries: [],
  gpsErrors: [],
  gtfsLogs: [],
  systemEvents: []
};

export function AdminLogsPage() {
  const navigate = useNavigate();
  const { dashboard, lastUpdatedAt, refreshConsole } = useAdminConsole();
  const { logout, user } = useAuth();
  const [filters, setFilters] = useState<FilterState>({ lane: "all", limit: 25, search: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [logsUpdatedAt, setLogsUpdatedAt] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot>(EMPTY_SNAPSHOT);

  const locale = dashboard?.tenant.locale;
  const auditAllowed = user?.permissions.includes("audit:read") ?? false;
  const fleetAllowed = user?.permissions.includes("fleet:read") ?? false;
  const dispatchAllowed = user?.permissions.includes("dispatch:manage") ?? false;
  const displayAllowed = user?.permissions.includes("content:manage") ?? false;
  const systemAllowed = user?.permissions.includes("admin:access") ?? false;
  const permissionsKey = user?.permissions.join(",") ?? "";

  const handleUnauthorized = useEffectEvent(async () => {
    await logout();
    navigate("/login", { replace: true });
  });

  const loadDiagnostics = useEffectEvent(async () => {
    if (!user) {
      return;
    }

    setIsLoading(true);
    setLoadErrors([]);

    try {
      const search = filters.search.trim();
      const limit = filters.limit;
      const [auditResult, gpsResult, gtfsResult, displayResult, systemResult] = await Promise.all([
        loadLane(filters.lane === "all" || filters.lane === "auth", auditAllowed, "Authentication audit", () =>
          fetchAuditEvents(limit, { search: search || undefined })
        ),
        loadLane(filters.lane === "all" || filters.lane === "gps", fleetAllowed, "GPS ingestion", () =>
          fetchGpsMessages(limit, { ingestStatus: "rejected", search: search || undefined })
        ),
        loadLane(filters.lane === "all" || filters.lane === "gtfs", dispatchAllowed, "GTFS import", () =>
          fetchGtfsLogs(limit, { search: search || undefined })
        ),
        loadLane(filters.lane === "all" || filters.lane === "display", displayAllowed, "Display delivery", () =>
          fetchDisplayDeliveries(limit, { search: search || undefined })
        ),
        loadLane(filters.lane === "all" || filters.lane === "system", systemAllowed, "System events", () =>
          fetchSystemEvents({ limit, search: search || undefined, source: "backend/api" })
        )
      ]);

      startTransition(() => {
        setSnapshot({
          auditEvents: auditResult.data ?? [],
          displayDeliveries: displayResult.data ?? [],
          gpsErrors: gpsResult.data ?? [],
          gtfsLogs: gtfsResult.data ?? [],
          systemEvents: systemResult.data ?? []
        });
        setLoadErrors([
          auditResult.error,
          gpsResult.error,
          gtfsResult.error,
          displayResult.error,
          systemResult.error
        ].filter((value): value is string => value !== null));
        setLogsUpdatedAt(new Date().toISOString());
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await handleUnauthorized();
        return;
      }

      setLoadErrors([error instanceof Error ? error.message : "Unable to load diagnostics."]);
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void loadDiagnostics();
  }, [filters.lane, filters.limit, filters.search, loadDiagnostics, permissionsKey, user?.id]);

  async function handleRefresh() {
    await Promise.all([refreshConsole(), loadDiagnostics()]);
  }

  function updateFilter<K extends keyof FilterState>(field: K, value: FilterState[K]) {
    setFilters((current) => ({
      ...current,
      [field]: value
    }));
  }

  const failedDisplayDeliveries = snapshot.displayDeliveries.filter((delivery) => delivery.status === "failed" || delivery.status === "retry_waiting");
  const failedGtfsJobs = snapshot.gtfsLogs.filter((job) => job.status === "failed" || job.validationErrorCount > 0);

  return (
    <div className="page-stack">
      <SectionHeader
        actions={
          <button className="action-button action-button--secondary" onClick={() => void handleRefresh()} type="button">
            {isLoading ? "Refreshing..." : "Refresh logs"}
          </button>
        }
        description="Search and inspect the main operational diagnostics lanes for authentication, GTFS imports, GPS ingestion, display publishing, hardware adapter failures, and backend system events."
        eyebrow="Diagnostics Console"
        title="Logs"
      />

      {loadErrors.length > 0 ? (
        <Notice body={loadErrors.join(" ")} title="Some diagnostics lanes are degraded" tone="warn" />
      ) : null}

      <Panel description="Filter the diagnostics console by lane, result window size, and free-text search." title="Filters">
        <form className="form-grid" onSubmit={(event) => event.preventDefault()}>
          <label className="field field--wide">
            <span className="field__label">Search</span>
            <input className="input-control" onChange={(event) => updateFilter("search", event.currentTarget.value)} placeholder="Search email, vehicle code, feed URI, adapter error, or event text" type="text" value={filters.search} />
          </label>
          <label className="field">
            <span className="field__label">Lane</span>
            <select className="select-control" onChange={(event) => updateFilter("lane", event.currentTarget.value as DiagnosticsLane)} value={filters.lane}>
              <option value="all">All lanes</option>
              <option value="auth">Authentication audit</option>
              <option value="gps">GPS ingestion</option>
              <option value="gtfs">GTFS imports</option>
              <option value="display">Display delivery</option>
              <option value="system">System and device events</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">Window</span>
            <select className="select-control" onChange={(event) => updateFilter("limit", Number(event.currentTarget.value))} value={String(filters.limit)}>
              <option value="10">10 records</option>
              <option value="25">25 records</option>
              <option value="50">50 records</option>
              <option value="100">100 records</option>
            </select>
          </label>
        </form>
      </Panel>

      <section className="metric-grid">
        <MetricCard detail="Authentication audit entries currently loaded for the selected search window." label="Auth audit" tone="good" value={auditAllowed ? String(snapshot.auditEvents.length).padStart(2, "0") : "Restricted"} />
        <MetricCard detail="Rejected GPS payloads visible in the current diagnostics window." label="GPS errors" tone={snapshot.gpsErrors.length > 0 ? "warn" : "good"} value={fleetAllowed ? String(snapshot.gpsErrors.length).padStart(2, "0") : "Restricted"} />
        <MetricCard detail="GTFS import jobs with searchable job history and validation status." label="GTFS logs" tone={failedGtfsJobs.length > 0 ? "warn" : "neutral"} value={dispatchAllowed ? String(snapshot.gtfsLogs.length).padStart(2, "0") : "Restricted"} />
        <MetricCard detail="Display deliveries and hardware-adapter outcomes in the active result window." label="Display sends" tone={failedDisplayDeliveries.length > 0 ? "warn" : "good"} value={displayAllowed ? String(snapshot.displayDeliveries.length).padStart(2, "0") : "Restricted"} />
        <MetricCard detail="Backend system and device-related events from the canonical system event stream." label="System events" tone={snapshot.systemEvents.some((event) => event.severity === "error" || event.severity === "critical") ? "critical" : "neutral"} value={systemAllowed ? String(snapshot.systemEvents.length).padStart(2, "0") : "Restricted"} />
        <MetricCard detail="Last time this diagnostics screen refreshed independently of the shell header." label="Diagnostics sync" tone="accent" value={formatTime(logsUpdatedAt, locale)} />
      </section>

      {(filters.lane === "all" || filters.lane === "auth") ? (
        <Panel description="Authentication audit records for sign-in, sign-out, failed attempts, and password changes." title="Authentication audit logs">
          {!auditAllowed ? (
            <div className="empty-state">Authentication audit requires the audit:read permission.</div>
          ) : renderAuditEvents(snapshot.auditEvents, locale)}
        </Panel>
      ) : null}

      {(filters.lane === "all" || filters.lane === "gps") ? (
        <Panel description="Rejected GPS ingestion payloads and transport-level validation failures." title="GPS ingestion errors">
          {!fleetAllowed ? (
            <div className="empty-state">GPS diagnostics require the fleet:read permission.</div>
          ) : renderGpsErrors(snapshot.gpsErrors, locale)}
        </Panel>
      ) : null}

      {(filters.lane === "all" || filters.lane === "gtfs") ? (
        <Panel description="GTFS import jobs with source, validation posture, and latest execution result." title="GTFS import logs">
          {!dispatchAllowed ? (
            <div className="empty-state">GTFS logs require the dispatch:manage permission.</div>
          ) : renderGtfsLogs(snapshot.gtfsLogs, locale)}
        </Panel>
      ) : null}

      {(filters.lane === "all" || filters.lane === "display") ? (
        <Panel description="Display command history, hardware adapter retries, and failed publishes." title="Display command history">
          {!displayAllowed ? (
            <div className="empty-state">Display diagnostics require the content:manage permission.</div>
          ) : renderDisplayDeliveries(snapshot.displayDeliveries, locale)}
        </Panel>
      ) : null}

      {(filters.lane === "all" || filters.lane === "system") ? (
        <Panel description="Backend system event records, including device-adjacent operational anomalies captured by the canonical event stream." title="System and device events">
          {!systemAllowed ? (
            <div className="empty-state">System diagnostics require the admin:access permission.</div>
          ) : renderSystemEvents(snapshot.systemEvents, locale)}
        </Panel>
      ) : null}

      <Panel description="Shell-level timing context for comparing diagnostics refresh state with the broader admin console." title="Console timing">
        <div className="detail-list">
          <div className="detail-row">
            <div>
              <div className="detail-row__label">Diagnostics refresh</div>
              <div className="detail-row__meta">Most recent refresh time for this page’s filtered log lanes.</div>
            </div>
            <span className="tone-pill tone-pill--accent">{formatTime(logsUpdatedAt, locale)}</span>
          </div>
          <div className="detail-row">
            <div>
              <div className="detail-row__label">Console sync</div>
              <div className="detail-row__meta">Last shell-level dashboard and audit sync from the admin layout.</div>
            </div>
            <span className="tone-pill tone-pill--neutral">{formatTime(lastUpdatedAt, locale)}</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}

async function loadLane<T>(enabled: boolean, permitted: boolean, label: string, loader: () => Promise<T>): Promise<{ data: T | null; error: string | null }> {
  if (!enabled || !permitted) {
    return { data: null, error: null };
  }

  try {
    return {
      data: await loader(),
      error: null
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw error;
    }

    return {
      data: null,
      error: `${label}: ${error instanceof Error ? error.message : "Unavailable."}`
    };
  }
}

function formatLabel(value: string): string {
  return value
    .split(/[-_]/)
    .filter((segment) => segment !== "")
    .map((segment) => segment.slice(0, 1).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatTime(timestamp: string | null, locale?: string): string {
  if (!timestamp) {
    return "Unavailable";
  }

  return new Date(timestamp).toLocaleString(locale ?? undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  });
}

function renderAuditEvents(events: AuditEvent[], locale?: string) {
  if (events.length === 0) {
    return <div className="empty-state">No authentication audit records matched the current filter.</div>;
  }

  return (
    <div className="event-list">
      {events.map((event) => (
        <article className="event-item" key={event.id}>
          <div className="event-item__header">
            <strong>{formatLabel(event.type)}</strong>
            <span>{formatTime(event.occurredAt, locale)}</span>
          </div>
          <div className="event-item__body">{event.email ?? event.userId ?? "system"}</div>
          <div className="event-item__meta">
            <span className={`tone-pill tone-pill--${event.success ? "good" : "critical"}`}>{event.success ? "Success" : "Failure"}</span>
            {event.ipAddress ? <span>{event.ipAddress}</span> : null}
            {event.reason ? <span>{event.reason}</span> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function renderDisplayDeliveries(deliveries: DisplayDeliveryRecord[], locale?: string) {
  if (deliveries.length === 0) {
    return <div className="empty-state">No display deliveries matched the current filter.</div>;
  }

  return (
    <div className="event-list">
      {deliveries.map((delivery) => (
        <article className="event-item" key={delivery.deliveryId}>
          <div className="event-item__header">
            <strong>{delivery.payload.vehicle?.vehicleCode ?? "Preview publish"}</strong>
            <span>{formatTime(delivery.lastAttemptAt ?? delivery.createdAt, locale)}</span>
          </div>
          <div className="event-item__body">{formatLabel(delivery.status)} · {delivery.payload.systemStatus}</div>
          <div className="event-item__meta">
            <span className={`tone-pill tone-pill--${delivery.status === "failed" ? "critical" : delivery.status === "retry_waiting" ? "warn" : "good"}`}>{formatLabel(delivery.status)}</span>
            <span>{delivery.attemptCount} attempts</span>
            <span>{delivery.context.routeShortName || delivery.context.destination}</span>
            {delivery.errorMessage ? <span>{delivery.errorMessage}</span> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function renderGpsErrors(messages: RecentGpsMessageRecord[], locale?: string) {
  if (messages.length === 0) {
    return <div className="empty-state">No GPS ingestion errors matched the current filter.</div>;
  }

  return (
    <div className="event-list">
      {messages.map((message) => (
        <article className="event-item" key={message.id}>
          <div className="event-item__header">
            <strong>{message.vehicleCode ?? message.providerMessageId ?? "GPS payload"}</strong>
            <span>{formatTime(message.receivedAt, locale)}</span>
          </div>
          <div className="event-item__body">{message.sourceName} · {formatLabel(message.ingestStatus)}</div>
          <div className="event-item__meta">
            <span className="tone-pill tone-pill--warn">Rejected</span>
            {message.vehicleLabel ? <span>{message.vehicleLabel}</span> : null}
            <span>{message.providerMessageId ?? "No provider message id"}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function renderGtfsLogs(jobs: GtfsImportJobRecord[], locale?: string) {
  if (jobs.length === 0) {
    return <div className="empty-state">No GTFS import jobs matched the current filter.</div>;
  }

  return (
    <div className="event-list">
      {jobs.map((job) => (
        <article className="event-item" key={job.id}>
          <div className="event-item__header">
            <strong>{formatLabel(job.status)}</strong>
            <span>{formatTime(job.finishedAt ?? job.createdAt, locale)}</span>
          </div>
          <div className="event-item__body">{job.sourceUri}</div>
          <div className="event-item__meta">
            <span className={`tone-pill tone-pill--${job.status === "failed" ? "critical" : job.validationErrorCount > 0 ? "warn" : "good"}`}>{job.validationErrorCount} errors / {job.warningCount} warnings</span>
            <span>{job.routeCount} routes</span>
            <span>{job.tripCount} trips</span>
            {job.errorMessage ? <span>{job.errorMessage}</span> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function renderSystemEvents(events: SystemEventRecord[], locale?: string) {
  if (events.length === 0) {
    return <div className="empty-state">No system events matched the current filter.</div>;
  }

  return (
    <div className="event-list">
      {events.map((event) => (
        <article className="event-item" key={event.id}>
          <div className="event-item__header">
            <strong>{event.eventType}</strong>
            <span>{formatTime(event.happenedAt, locale)}</span>
          </div>
          <div className="event-item__body">{event.message}</div>
          <div className="event-item__meta">
            <span className={`tone-pill tone-pill--${event.severity === "critical" || event.severity === "error" ? "critical" : event.severity === "warn" ? "warn" : "neutral"}`}>{event.severity}</span>
            <span>{event.source}</span>
            {event.component ? <span>{event.component}</span> : null}
            {event.relatedEntityType ? <span>{event.relatedEntityType}:{event.relatedEntityId ?? "n/a"}</span> : null}
          </div>
        </article>
      ))}
    </div>
  );
}
