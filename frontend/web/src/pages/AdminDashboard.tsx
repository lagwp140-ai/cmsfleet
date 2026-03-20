import { formatConsoleClock, formatConsoleDateTime } from "../lib/time";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchDisplayAdapterStatus, fetchDisplayDeliveries } from "../admin/displayClient";
import type { DisplayDeliveryRecord, DisplayQueueOverview } from "../admin/displayTypes";
import { fetchGpsMessages, fetchGpsStatus } from "../admin/gpsClient";
import type { GpsStatusResponse, GpsVehicleStatusRecord, RecentGpsMessageRecord } from "../admin/gpsTypes";
import { fetchGtfsOverview } from "../admin/gtfsClient";
import type { GtfsDatasetRecord, GtfsOverviewResponse } from "../admin/gtfsTypes";
import { fetchRouteResolutionStatus } from "../admin/routeClient";
import type { RouteResolutionStatusResponse } from "../admin/routeTypes";
import { useAdminConsole } from "../admin/useAdminConsole";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../auth/authClient";
import { DetailList, MetricCard, Notice, Panel, SectionHeader } from "../components/admin/AdminPrimitives";
import { fetchVehicles } from "../admin/vehicleClient";
import type { VehicleRecord } from "../admin/vehicleTypes";

interface OperationsSnapshot {
  displayDeliveries: DisplayDeliveryRecord[];
  displayQueue: DisplayQueueOverview | null;
  gpsMessages: RecentGpsMessageRecord[];
  gpsStatus: GpsStatusResponse | null;
  gtfsOverview: GtfsOverviewResponse | null;
  routeStatus: RouteResolutionStatusResponse | null;
  vehicles: VehicleRecord[];
}

interface DashboardErrorItem {
  detail: string;
  id: string;
  occurredAt: string;
  source: string;
  title: string;
  tone: "critical" | "warn";
}

interface LoadWidgetResult<T> {
  data: T | null;
  error: string | null;
}

const EMPTY_OPERATIONS: OperationsSnapshot = {
  displayDeliveries: [],
  displayQueue: null,
  gpsMessages: [],
  gpsStatus: null,
  gtfsOverview: null,
  routeStatus: null,
  vehicles: []
};

export function AdminDashboard() {
  const navigate = useNavigate();
  const { dashboard, refreshConsole } = useAdminConsole();
  const { logout, user } = useAuth();
  const [operations, setOperations] = useState<OperationsSnapshot>(EMPTY_OPERATIONS);
  const [operationsErrors, setOperationsErrors] = useState<string[]>([]);
  const [operationsUpdatedAt, setOperationsUpdatedAt] = useState<string | null>(null);
  const [isOperationsLoading, setIsOperationsLoading] = useState(true);

  const locale = dashboard?.tenant.locale;
  const canReadFleet = user?.permissions.includes("fleet:read") ?? false;
  const canDispatch = user?.permissions.includes("dispatch:manage") ?? false;
  const canManageDisplays = user?.permissions.includes("content:manage") ?? false;
  const permissionsKey = user?.permissions.join(",") ?? "";

  const handleUnauthorized = useEffectEvent(async () => {
    await logout();
    navigate("/login", { replace: true });
  });

  const loadOperations = useEffectEvent(async () => {
    if (!user) {
      return;
    }

    setIsOperationsLoading(true);
    setOperationsErrors([]);

    try {
      const [
        vehiclesResult,
        gpsStatusResult,
        gpsMessagesResult,
        routeStatusResult,
        gtfsOverviewResult,
        displayQueueResult,
        displayDeliveriesResult
      ] = await Promise.all([
        loadWidget(canReadFleet, "Vehicle registry", () => fetchVehicles()),
        loadWidget(canReadFleet, "GPS status", () => fetchGpsStatus()),
        loadWidget(canReadFleet, "Recent GPS messages", () => fetchGpsMessages(12)),
        loadWidget(canDispatch, "Route resolution", () => fetchRouteResolutionStatus()),
        loadWidget(canDispatch, "GTFS overview", () => fetchGtfsOverview()),
        loadWidget(canManageDisplays, "Display adapter status", () => fetchDisplayAdapterStatus()),
        loadWidget(canManageDisplays, "Display deliveries", () => fetchDisplayDeliveries(12))
      ]);

      startTransition(() => {
        setOperations({
          displayDeliveries: displayDeliveriesResult.data ?? [],
          displayQueue: displayQueueResult.data,
          gpsMessages: gpsMessagesResult.data ?? [],
          gpsStatus: gpsStatusResult.data,
          gtfsOverview: gtfsOverviewResult.data,
          routeStatus: routeStatusResult.data,
          vehicles: vehiclesResult.data ?? []
        });
        setOperationsErrors([
          vehiclesResult.error,
          gpsStatusResult.error,
          gpsMessagesResult.error,
          routeStatusResult.error,
          gtfsOverviewResult.error,
          displayQueueResult.error,
          displayDeliveriesResult.error
        ].filter((error): error is string => error !== null));
        setOperationsUpdatedAt(new Date().toISOString());
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await handleUnauthorized();
        return;
      }

      setOperationsErrors([error instanceof Error ? error.message : "Unable to load operations dashboard."]);
    } finally {
      setIsOperationsLoading(false);
    }
  });

  useEffect(() => {
    void loadOperations();
  }, [permissionsKey, user?.id]);

  async function handleRefresh() {
    await Promise.all([refreshConsole(), loadOperations()]);
  }

  const activeVehicles = operations.vehicles.filter((vehicle) => vehicle.operationalStatus === "active");
  const enabledVehicles = operations.vehicles.filter((vehicle) => vehicle.isEnabled);
  const latestGpsTimestamp = findLatestGpsTimestamp(operations.gpsMessages, operations.gpsStatus?.vehicles ?? []);
  const routeAssignedCount = operations.routeStatus
    ? operations.routeStatus.summary.manualOnlyVehicles
      + operations.routeStatus.summary.scheduledActiveVehicles
      + operations.routeStatus.summary.scheduledUpcomingVehicles
      + operations.routeStatus.summary.scheduledCompletedVehicles
    : 0;
  const activeDataset = operations.gtfsOverview?.activeDataset ?? null;
  const recentErrors = buildRecentErrors(operations);
  const latestVehicles = getLatestVehicleUpdates(operations.gpsStatus?.vehicles ?? []);

  return (
    <div className="page-stack">
      <SectionHeader
        actions={
          <button className="action-button action-button--secondary" onClick={() => void handleRefresh()} type="button">
            {isOperationsLoading ? "Refreshing..." : "Refresh dashboard"}
          </button>
        }
        description="A live operations board for dispatch and admin teams, tuned around fleet readiness, telemetry freshness, route assignment, feed state, and display delivery posture."
        eyebrow="Operations Board"
        title="Dashboard"
      />

      {operationsErrors.length > 0 ? (
        <Notice
          body={operationsErrors.join(" ")}
          title="Some operational widgets are degraded"
          tone="warn"
        />
      ) : null}

      <section className="metric-grid">
        <MetricCard
          detail={`${enabledVehicles.length}/${operations.vehicles.length} vehicles are enabled for live service control.`}
          label="Active vehicles"
          tone="accent"
          value={canReadFleet ? String(activeVehicles.length).padStart(2, "0") : "--"}
        />
        <MetricCard
          detail="Vehicles reporting fresh telemetry inside the configured online threshold."
          label="Online"
          tone="good"
          value={canReadFleet && operations.gpsStatus ? String(operations.gpsStatus.summary.onlineVehicles).padStart(2, "0") : "--"}
        />
        <MetricCard
          detail="Vehicles currently classified as offline by the GPS freshness model."
          label="Offline"
          tone={operations.gpsStatus && operations.gpsStatus.summary.offlineVehicles > 0 ? "warn" : "neutral"}
          value={canReadFleet && operations.gpsStatus ? String(operations.gpsStatus.summary.offlineVehicles).padStart(2, "0") : "--"}
        />
        <MetricCard
          detail="Most recent inbound GPS message or last-seen vehicle heartbeat available to the console."
          label="Latest GPS"
          tone="neutral"
          value={canReadFleet ? formatShortTime(latestGpsTimestamp, locale) : "Restricted"}
        />
        <MetricCard
          detail={canDispatch && operations.routeStatus ? `${operations.routeStatus.summary.awaitingAutoMatch} vehicles still need automatic assignment.` : "Route-assignment status requires dispatch access."}
          label="Route assigned"
          tone={operations.routeStatus && operations.routeStatus.summary.awaitingAutoMatch > 0 ? "warn" : "good"}
          value={canDispatch && operations.routeStatus ? `${routeAssignedCount}/${operations.routeStatus.summary.totalVehicles}` : "Restricted"}
        />
        <MetricCard
          detail={canDispatch && activeDataset ? `Activated ${formatLongTime(activeDataset.activatedAt ?? activeDataset.createdAt, locale)}.` : "Current GTFS dataset selection for the active service feed."}
          label="GTFS dataset"
          tone={activeDataset ? "good" : "warn"}
          value={canDispatch ? summarizeDatasetLabel(activeDataset) : "Restricted"}
        />
        <MetricCard
          detail={canManageDisplays && operations.displayQueue ? `${operations.displayQueue.queueDepth} queued, ${operations.displayQueue.retryDepth} retrying.` : "Display delivery adapter health and queue posture."}
          label="Display adapter"
          tone={adapterTone(operations.displayQueue?.adapter.state)}
          value={canManageDisplays && operations.displayQueue ? formatLabel(operations.displayQueue.adapter.state) : "Restricted"}
        />
        <MetricCard
          detail="Recent delivery, ingest, or import issues visible from the current role scope."
          label="Recent errors"
          tone={recentErrors.length > 0 ? "warn" : "good"}
          value={String(recentErrors.length).padStart(2, "0")}
        />
      </section>

      <section className="panel-grid panel-grid--two">
        <Panel description="Fleet readiness, enablement posture, and telemetry coverage visible to the current operator role." title="Fleet posture">
          {canReadFleet ? (
            <DetailList rows={buildFleetRows(operations)} />
          ) : (
            <div className="empty-state">Fleet status requires the fleet:read permission.</div>
          )}
        </Panel>

        <Panel description="Most recent live GPS updates by vehicle, including freshness and movement state, to help dispatch spot stale or drifting units quickly." title="Latest GPS updates">
          {!canReadFleet ? (
            <div className="empty-state">GPS visibility requires the fleet:read permission.</div>
          ) : isOperationsLoading && latestVehicles.length === 0 ? (
            <div className="empty-state">Loading live GPS updates...</div>
          ) : latestVehicles.length === 0 ? (
            <div className="empty-state">No recent GPS updates are available yet.</div>
          ) : (
            <div className="event-list">
              {latestVehicles.map((vehicle) => (
                <article className="event-item" key={vehicle.vehicleId}>
                  <div className="event-item__header">
                    <strong>{vehicle.vehicleCode}</strong>
                    <span>{formatLongTime(vehicle.lastSeenAt, locale)}</span>
                  </div>
                  <div className="event-item__body">{vehicle.label}</div>
                  <div className="event-item__meta">
                    <span className={`tone-pill tone-pill--${connectionTone(vehicle.connectionState)}`}>{formatLabel(vehicle.connectionState)}</span>
                    <span className={`tone-pill tone-pill--${movementTone(vehicle.movementState)}`}>{formatLabel(vehicle.movementState)}</span>
                    <span>{vehicle.speedKph !== null ? `${Math.round(vehicle.speedKph)} km/h` : "Speed n/a"}</span>
                    <span>{vehicle.freshnessSeconds !== null ? `${vehicle.freshnessSeconds}s old` : "Freshness n/a"}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </section>

      <section className="panel-grid panel-grid--two">
        <Panel description="Schedule-assisted route resolution output so operators can spot manual-only vehicles, scheduled trips, and pending auto-match gaps." title="Route assignment status">
          {!canDispatch ? (
            <div className="empty-state">Route assignment visibility requires the dispatch:manage permission.</div>
          ) : !operations.routeStatus ? (
            <div className="empty-state">Route assignment data is not available.</div>
          ) : (
            <DetailList rows={buildRouteRows(operations.routeStatus, locale)} />
          )}
        </Panel>

        <Panel description="Current active GTFS dataset and the latest import posture so schedule changes stay visible before they affect vehicle assignments or signs." title="GTFS dataset version">
          {!canDispatch ? (
            <div className="empty-state">GTFS operations require the dispatch:manage permission.</div>
          ) : !operations.gtfsOverview ? (
            <div className="empty-state">GTFS overview is not available.</div>
          ) : (
            <DetailList rows={buildGtfsRows(operations.gtfsOverview, locale)} />
          )}
        </Panel>
      </section>

      <section className="panel-grid panel-grid--two">
        <Panel description="Adapter health, queue depth, retry posture, and the most recent delivery outcomes from the display publishing boundary." title="Display adapter status">
          {!canManageDisplays ? (
            <div className="empty-state">Display delivery visibility requires the content:manage permission.</div>
          ) : !operations.displayQueue ? (
            <div className="empty-state">Display adapter status is not available.</div>
          ) : (
            <>
              <DetailList rows={buildDisplayRows(operations.displayQueue, locale)} />
              {operations.displayDeliveries.length > 0 ? (
                <div className="event-list">
                  {operations.displayDeliveries.slice(0, 4).map((delivery) => (
                    <article className="event-item" key={delivery.deliveryId}>
                      <div className="event-item__header">
                        <strong>{delivery.payload.vehicle?.vehicleCode ?? "Preview publish"}</strong>
                        <span>{formatLongTime(delivery.lastAttemptAt ?? delivery.createdAt, locale)}</span>
                      </div>
                      <div className="event-item__body">{formatLabel(delivery.status)} · {delivery.payload.systemStatus}</div>
                      <div className="event-item__meta">
                        <span className={`tone-pill tone-pill--${deliveryTone(delivery.status)}`}>{formatLabel(delivery.status)}</span>
                        <span>{delivery.attemptCount} attempts</span>
                        {delivery.errorMessage ? <span>{delivery.errorMessage}</span> : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </Panel>

        <Panel description="The newest exceptions, failed deliveries, rejected GPS payloads, and GTFS problems visible from your current role scope." title="Recent errors">
          {recentErrors.length === 0 ? (
            <div className="empty-state">No recent errors are visible from the current operational scope.</div>
          ) : (
            <div className="event-list">
              {recentErrors.map((item) => (
                <article className="event-item" key={item.id}>
                  <div className="event-item__header">
                    <strong>{item.source}</strong>
                    <span>{formatLongTime(item.occurredAt, locale)}</span>
                  </div>
                  <div className="event-item__body">{item.title}</div>
                  <div className="event-item__meta">
                    <span className={`tone-pill tone-pill--${item.tone}`}>{item.tone === "critical" ? "critical" : "warning"}</span>
                    <span>{item.detail}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </section>

      <Panel description="Console sync and operator visibility posture for this dashboard render." title="Control plane sync">
        <DetailList
          rows={[
            {
              label: "Dashboard sync",
              meta: "Most recent operations widget refresh time.",
              tone: "neutral",
              value: formatLongTime(operationsUpdatedAt, locale)
            },
            {
              label: "Tenant",
              meta: "Resolved transport deployment context for this shell.",
              tone: "accent",
              value: dashboard?.tenant.displayName ?? "Shared CMS Core"
            },
            {
              label: "Operator role",
              meta: "The permission lens currently applied to the dashboard.",
              tone: "good",
              value: dashboard?.auth.roleLabel ?? user?.role ?? "viewer"
            },
            {
              label: "Widget posture",
              meta: "Modules with operational data available to the current user.",
              tone: operationsErrors.length > 0 ? "warn" : "good",
              value: operationsErrors.length > 0 ? "Partially degraded" : "Nominal"
            }
          ]}
        />
      </Panel>
    </div>
  );
}

function adapterTone(state: DisplayQueueOverview["adapter"]["state"] | undefined): "accent" | "critical" | "good" | "neutral" | "warn" {
  switch (state) {
    case "healthy":
      return "good";
    case "degraded":
      return "warn";
    case "unhealthy":
      return "critical";
    default:
      return "neutral";
  }
}

function buildDisplayRows(queue: DisplayQueueOverview, locale?: string) {
  return [
    {
      label: "Adapter state",
      meta: queue.adapter.message,
      tone: adapterTone(queue.adapter.state),
      value: formatLabel(queue.adapter.state)
    },
    {
      label: "Provider / transport",
      meta: "Controller family and transport contract currently active.",
      tone: "accent" as const,
      value: `${queue.adapter.provider} / ${queue.adapter.transport}`
    },
    {
      label: "Queue depth",
      meta: `Pending ${queue.totals.pending}, delivered ${queue.totals.delivered}, failed ${queue.totals.failed}.`,
      tone: queue.queueDepth > 0 ? "warn" as const : "good" as const,
      value: `${queue.queueDepth} queued`
    },
    {
      label: "Last successful delivery",
      meta: "Most recent accepted publish from the adapter boundary.",
      tone: "neutral" as const,
      value: formatLongTime(queue.adapter.lastSuccessfulDeliveryAt, locale)
    }
  ];
}

function buildFleetRows(operations: OperationsSnapshot) {
  const activeVehicles = operations.vehicles.filter((vehicle) => vehicle.operationalStatus === "active").length;
  const enabledVehicles = operations.vehicles.filter((vehicle) => vehicle.isEnabled).length;
  const gpsSummary = operations.gpsStatus?.summary;

  return [
    {
      label: "Managed vehicles",
      meta: "Vehicles currently registered in the CMS fleet registry.",
      tone: "accent" as const,
      value: String(operations.vehicles.length).padStart(2, "0")
    },
    {
      label: "Active / enabled",
      meta: "Vehicles in active operational status versus units enabled for live control.",
      tone: "good" as const,
      value: `${activeVehicles} active / ${enabledVehicles} enabled`
    },
    {
      label: "Online / stale / offline",
      meta: "GPS freshness distribution across tracked vehicles.",
      tone: gpsSummary && gpsSummary.offlineVehicles > 0 ? "warn" as const : "good" as const,
      value: gpsSummary ? `${gpsSummary.onlineVehicles} / ${gpsSummary.staleVehicles} / ${gpsSummary.offlineVehicles}` : "No GPS data"
    },
    {
      label: "Moving vehicles",
      meta: "Vehicles currently classified as moving by the derived GPS state.",
      tone: "neutral" as const,
      value: gpsSummary ? String(gpsSummary.movingVehicles).padStart(2, "0") : "--"
    }
  ];
}

function buildGtfsRows(overview: GtfsOverviewResponse, locale?: string) {
  const latestJob = overview.jobs[0] ?? null;
  const activeDataset = overview.activeDataset;

  return [
    {
      label: "Active dataset",
      meta: activeDataset ? "Currently activated schedule dataset used by route and trip resolution." : "No GTFS dataset is active yet.",
      tone: activeDataset ? "good" as const : "warn" as const,
      value: summarizeDatasetLabel(activeDataset)
    },
    {
      label: "Dataset counts",
      meta: "Routes, trips, and stops loaded into the active dataset.",
      tone: "accent" as const,
      value: activeDataset ? `${activeDataset.routeCount} routes / ${activeDataset.tripCount} trips / ${activeDataset.stopCount} stops` : "Unavailable"
    },
    {
      label: "Activated",
      meta: "Timestamp of the currently active GTFS dataset selection.",
      tone: "neutral" as const,
      value: formatLongTime(activeDataset?.activatedAt ?? activeDataset?.createdAt ?? null, locale)
    },
    {
      label: "Latest import job",
      meta: latestJob ? `${latestJob.validationErrorCount} validation errors, ${latestJob.warningCount} warnings.` : "No import jobs recorded yet.",
      tone: latestJob?.status === "failed" ? "critical" as const : latestJob ? "neutral" as const : "warn" as const,
      value: latestJob ? `${formatLabel(latestJob.status)} · ${formatLongTime(latestJob.finishedAt ?? latestJob.createdAt, locale)}` : "Unavailable"
    }
  ];
}

function buildRecentErrors(operations: OperationsSnapshot): DashboardErrorItem[] {
  const errors: DashboardErrorItem[] = [];

  for (const message of operations.gpsMessages) {
    if (message.ingestStatus !== "rejected") {
      continue;
    }

    errors.push({
      detail: `${message.sourceName} rejected payload${message.vehicleCode ? ` for ${message.vehicleCode}` : ""}.`,
      id: `gps-${message.id}`,
      occurredAt: message.receivedAt,
      source: "GPS",
      title: "GPS ingest rejected",
      tone: "warn"
    });
  }

  for (const job of operations.gtfsOverview?.jobs ?? []) {
    if (job.status !== "failed" && job.validationErrorCount === 0) {
      continue;
    }

    errors.push({
      detail: job.status === "failed"
        ? (job.errorMessage ?? `GTFS import from ${job.sourceUri} failed.`)
        : `${job.validationErrorCount} validation errors detected during GTFS import.`,
      id: `gtfs-${job.id}`,
      occurredAt: job.finishedAt ?? job.createdAt,
      source: "GTFS",
      title: job.status === "failed" ? "GTFS import failed" : "GTFS validation issues",
      tone: job.status === "failed" ? "critical" : "warn"
    });
  }

  for (const delivery of operations.displayDeliveries) {
    if (delivery.status !== "failed" && delivery.status !== "retry_waiting") {
      continue;
    }

    errors.push({
      detail: delivery.errorMessage ?? `Display delivery ${delivery.deliveryId} is retrying.`,
      id: `display-${delivery.deliveryId}`,
      occurredAt: delivery.lastAttemptAt ?? delivery.createdAt,
      source: "Displays",
      title: delivery.status === "failed" ? "Display delivery failed" : "Display delivery retry pending",
      tone: delivery.status === "failed" ? "critical" : "warn"
    });
  }

  const adapter = operations.displayQueue?.adapter;

  if (adapter && (adapter.state === "degraded" || adapter.state === "unhealthy") && adapter.lastUnhealthyAt) {
    errors.push({
      detail: adapter.lastError ?? adapter.message,
      id: `display-adapter-${adapter.adapterId}`,
      occurredAt: adapter.lastUnhealthyAt,
      source: "Displays",
      title: "Display adapter health degraded",
      tone: adapter.state === "unhealthy" ? "critical" : "warn"
    });
  }

  return errors
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, 6);
}

function buildRouteRows(status: RouteResolutionStatusResponse, locale?: string) {
  return [
    {
      label: "Evaluated at",
      meta: "Most recent route-resolution evaluation timestamp.",
      tone: "neutral" as const,
      value: formatLongTime(status.evaluatedAt, locale)
    },
    {
      label: "Resolved vehicles",
      meta: "Vehicles with a manual or schedule-derived route assignment.",
      tone: "good" as const,
      value: String(
        status.summary.manualOnlyVehicles
        + status.summary.scheduledActiveVehicles
        + status.summary.scheduledUpcomingVehicles
        + status.summary.scheduledCompletedVehicles
      ).padStart(2, "0")
    },
    {
      label: "Awaiting auto match",
      meta: "Vehicles still waiting for schedule or later GPS-assisted resolution.",
      tone: status.summary.awaitingAutoMatch > 0 ? "warn" as const : "good" as const,
      value: String(status.summary.awaitingAutoMatch).padStart(2, "0")
    },
    {
      label: "Manual / scheduled",
      meta: "Current mix of manual route pinning and schedule-selected service.",
      tone: "accent" as const,
      value: `${status.summary.manualOnlyVehicles} manual / ${status.summary.scheduledActiveVehicles + status.summary.scheduledUpcomingVehicles} scheduled`
    }
  ];
}

function connectionTone(state: GpsVehicleStatusRecord["connectionState"]): "accent" | "critical" | "good" | "neutral" | "warn" {
  switch (state) {
    case "online":
      return "good";
    case "stale":
      return "warn";
    case "offline":
      return "critical";
    default:
      return "neutral";
  }
}

function deliveryTone(status: DisplayDeliveryRecord["status"]): "accent" | "critical" | "good" | "neutral" | "warn" {
  switch (status) {
    case "delivered":
      return "good";
    case "retry_waiting":
      return "warn";
    case "failed":
      return "critical";
    case "processing":
      return "accent";
    default:
      return "neutral";
  }
}

function findLatestGpsTimestamp(messages: RecentGpsMessageRecord[], vehicles: GpsVehicleStatusRecord[]): string | null {
  const timestamps = [
    ...messages.map((message) => message.receivedAt),
    ...vehicles.map((vehicle) => vehicle.lastSeenAt).filter((value): value is string => value !== null)
  ];

  if (timestamps.length === 0) {
    return null;
  }

  return timestamps.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function formatLabel(value: string): string {
  return value
    .split(/[-_]/)
    .filter((segment) => segment !== "")
    .map((segment) => segment.slice(0, 1).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatLongTime(timestamp: string | null, locale?: string): string {
  if (!timestamp) {
    return "Unavailable";
  }

  return formatConsoleDateTime(timestamp, locale);
}

function formatShortTime(timestamp: string | null, locale?: string): string {
  if (!timestamp) {
    return "No fix";
  }

  return formatConsoleClock(timestamp, locale);
}

function getLatestVehicleUpdates(vehicles: GpsVehicleStatusRecord[]): GpsVehicleStatusRecord[] {
  const epoch = new Date(0).toISOString();

  return [...vehicles]
    .sort((left, right) => Date.parse(right.lastSeenAt ?? epoch) - Date.parse(left.lastSeenAt ?? epoch))
    .slice(0, 6);
}

async function loadWidget<T>(enabled: boolean, label: string, loader: () => Promise<T>): Promise<LoadWidgetResult<T>> {
  if (!enabled) {
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

function movementTone(state: GpsVehicleStatusRecord["movementState"]): "accent" | "critical" | "good" | "neutral" | "warn" {
  switch (state) {
    case "moving":
      return "accent";
    case "stopped":
      return "neutral";
    default:
      return "warn";
  }
}

function summarizeDatasetLabel(dataset: GtfsDatasetRecord | null): string {
  if (!dataset) {
    return "No active feed";
  }

  const label = dataset.datasetLabel.trim();

  if (label.length <= 18) {
    return label;
  }

  return `${label.slice(0, 15)}...`;
}







