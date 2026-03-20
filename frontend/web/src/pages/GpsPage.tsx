import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchGpsMessages, fetchGpsStatus } from "../admin/gpsClient";
import { fetchRouteResolutionStatus } from "../admin/routeClient";
import type {
  GpsConnectionState,
  GpsMovementState,
  GpsStatusResponse,
  GpsVehicleStatusRecord,
  RecentGpsMessageRecord
} from "../admin/gpsTypes";
import type { VehicleRouteResolutionRecord } from "../admin/routeTypes";
import { useAdminConsole } from "../admin/useAdminConsole";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../auth/authClient";
import { GpsMapPreview } from "../components/admin/GpsMapPreview";
import { MetricCard, Notice, Panel, SectionHeader } from "../components/admin/AdminPrimitives";
import { formatConsoleDateTime } from "../lib/time";

export function GpsPage() {
  const navigate = useNavigate();
  const { dashboard } = useAdminConsole();
  const { logout, user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState<RecentGpsMessageRecord[]>([]);
  const [routeStatusByVehicleId, setRouteStatusByVehicleId] = useState<Record<string, VehicleRouteResolutionRecord>>({});
  const [status, setStatus] = useState<GpsStatusResponse | null>(null);
  const locale = dashboard?.tenant.locale;
  const canInspectRoutes = user?.permissions.includes("dispatch:manage") ?? false;

  const handleUnauthorized = useEffectEvent(async () => {
    await logout();
    navigate("/login", { replace: true });
  });

  const loadGpsData = useEffectEvent(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [nextStatus, nextMessages, nextRouteStatus] = await Promise.all([
        fetchGpsStatus(),
        fetchGpsMessages(16),
        canInspectRoutes
          ? fetchRouteResolutionStatus().catch((requestError) => {
              if (requestError instanceof ApiError && requestError.status === 403) {
                return null;
              }

              throw requestError;
            })
          : Promise.resolve(null)
      ]);

      startTransition(() => {
        setStatus(nextStatus);
        setMessages(nextMessages);
        setRouteStatusByVehicleId(buildRouteStatusByVehicleId(nextRouteStatus?.vehicles ?? []));
      });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to load GPS status.");
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void loadGpsData();
  }, [user?.id]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadGpsData();
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [user?.id]);

  const summary = status?.summary;
  const trackedVehicles = summary?.trackedVehicles ?? 0;
  const attentionVehicles = (summary?.staleVehicles ?? 0) + (summary?.offlineVehicles ?? 0) + (summary?.unknownVehicles ?? 0);
  const movingVehicles = summary?.movingVehicles ?? 0;
  const stoppedVehicles = summary?.stoppedVehicles ?? 0;

  return (
    <div className="page-stack">
      <SectionHeader
        actions={
          <button className="action-button action-button--secondary" onClick={() => void loadGpsData()} type="button">
            Refresh GPS
          </button>
        }
        description="Monitor live AVL ingress, inspect recent raw messages, and see each bus as an operational state with connection health, movement, speed, heading, and last-seen telemetry."
        eyebrow="AVL Operations"
        title="GPS"
      />

      {error ? <Notice body={error} title="GPS data unavailable" tone="critical" /> : null}

      <section className="metric-grid">
        <MetricCard detail="Vehicles registered in the fleet and eligible for telemetry state tracking." label="Tracked vehicles" tone="accent" value={String(trackedVehicles).padStart(2, "0")} />
        <MetricCard detail="Vehicles currently inside the online freshness window." label="Online" tone="good" value={String(summary?.onlineVehicles ?? 0).padStart(2, "0")} />
        <MetricCard detail="Vehicles that are stale, offline, or have not reported into the CMS yet." label="Needs attention" tone={attentionVehicles > 0 ? "warn" : "good"} value={String(attentionVehicles).padStart(2, "0")} />
        <MetricCard detail={`Moving now: ${movingVehicles}. Stopped with telemetry: ${stoppedVehicles}.`} label="Movement" tone={movingVehicles > 0 ? "accent" : "neutral"} value={String(movingVehicles).padStart(2, "0")} />
      </section>

      <Panel description="Live bus positions rendered over an OpenStreetMap preview centered on Riga so dispatch can confirm where telemetry is landing right now." title="Riga map preview">
        <GpsMapPreview locale={locale} routeStatusByVehicleId={routeStatusByVehicleId} vehicles={status?.vehicles ?? []} />
      </Panel>

      <section className="panel-grid panel-grid--two">
        <Panel description="Runtime thresholds and processing behavior resolved from configuration and applied to the current GPS pipeline." title="Processing policy">
          <div className="detail-list">
            <div className="detail-row">
              <div>
                <div className="detail-row__label">Configured source</div>
                <div className="detail-row__meta">Primary source name attached to stored GPS messages and derived operational state.</div>
              </div>
              <span className="tone-pill tone-pill--accent">{status?.sourceName ?? "Pending"}</span>
            </div>
            <div className="detail-row">
              <div>
                <div className="detail-row__label">Online threshold</div>
                <div className="detail-row__meta">Message age allowed before a vehicle is marked stale.</div>
              </div>
              <span className="tone-pill tone-pill--good">{status?.freshnessThresholdSeconds ?? 0}s</span>
            </div>
            <div className="detail-row">
              <div>
                <div className="detail-row__label">Offline threshold</div>
                <div className="detail-row__meta">Message age after which a vehicle is treated as offline.</div>
              </div>
              <span className="tone-pill tone-pill--warn">{status?.offlineThresholdSeconds ?? 0}s</span>
            </div>
            <div className="detail-row">
              <div>
                <div className="detail-row__label">Movement threshold</div>
                <div className="detail-row__meta">Speed used to classify a bus as moving instead of stopped.</div>
              </div>
              <span className="tone-pill tone-pill--neutral">{status?.movementThresholdKph ?? 0} km/h</span>
            </div>
            <div className="detail-row">
              <div>
                <div className="detail-row__label">Extension points</div>
                <div className="detail-row__meta">Geofence, route proximity, stop proximity, and trip progress are reserved in the derived-state pipeline.</div>
              </div>
              <span className="tone-pill tone-pill--neutral">Ready</span>
            </div>
          </div>
        </Panel>

        <Panel description="Recent raw ingestion records, including rejected or duplicate messages that did not replace the latest live position snapshot." title="Recent messages">
          {isLoading ? (
            <div className="empty-state">Loading recent GPS messages...</div>
          ) : messages.length === 0 ? (
            <div className="empty-state">No GPS messages have been recorded yet.</div>
          ) : (
            <div className="event-list">
              {messages.map((message) => (
                <article className="event-item" key={message.id}>
                  <div className="event-item__header">
                    <strong>{message.vehicleCode ?? "unmatched device"}</strong>
                    <span>{formatConsoleDateTime(message.receivedAt, locale)}</span>
                  </div>
                  <div className="event-item__body">{message.ingestStatus.toUpperCase()} � {message.sourceName}</div>
                  <div className="event-item__meta">
                    <span className={`tone-pill tone-pill--${messageTone(message.ingestStatus)}`}>{message.ingestStatus}</span>
                    {message.providerMessageId ? <span>{message.providerMessageId}</span> : null}
                    {message.latitude !== null && message.longitude !== null ? <span>{message.latitude.toFixed(6)}, {message.longitude.toFixed(6)}</span> : null}
                    {message.positionTime ? <span>fix {formatConsoleDateTime(message.positionTime, locale)}</span> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </section>

      <Panel description="Fleet-level operational state derived from the latest accepted telemetry per registered bus." title="Vehicle operational state">
        {isLoading ? (
          <div className="empty-state">Loading vehicle operational state...</div>
        ) : status?.vehicles.length ? (
          <div className="detail-list">
            {status.vehicles.map((vehicle) => (
              <div className="detail-row" key={vehicle.vehicleId}>
                <div>
                  <div className="detail-row__label">{vehicle.vehicleCode} � {vehicle.label}</div>
                  <div className="detail-row__meta">{buildVehicleMeta(vehicle, routeStatusByVehicleId[vehicle.vehicleId], locale)}</div>
                </div>
                <span className={`tone-pill tone-pill--${connectionTone(vehicle.connectionState)}`}>
                  {formatConnectionLabel(vehicle.connectionState, vehicle.freshnessSeconds)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">No vehicles are registered for GPS tracking yet.</div>
        )}
      </Panel>
    </div>
  );
}

function buildVehicleMeta(vehicle: GpsVehicleStatusRecord, route: VehicleRouteResolutionRecord | undefined, locale?: string): string {
  const parts = [
    vehicle.registrationPlate ?? "no plate",
    vehicle.transportProfileKey,
    vehicle.isEnabled ? "enabled" : "disabled",
    vehicle.operationalStatus,
    vehicle.routeOverrideMode === "manual" ? "manual route" : "auto route",
    movementLabel(vehicle.movementState)
  ];

  if (route?.route) {
    parts.push(`route ${route.route.routeShortName}`);
  }

  if (route?.trip?.headsign ?? route?.trip?.variantHeadsign) {
    parts.push(route?.trip?.headsign ?? route?.trip?.variantHeadsign ?? "");
  }

  if (route?.nextStop) {
    parts.push(`next ${route.nextStop.stopName}`);
  }

  if (vehicle.sourceName) {
    parts.push(vehicle.sourceName);
  }

  if (vehicle.lastSeenAt) {
    parts.push(`last seen ${formatConsoleDateTime(vehicle.lastSeenAt, locale)}`);
  }

  if (vehicle.positionTime) {
    parts.push(`fix ${formatConsoleDateTime(vehicle.positionTime, locale)}`);
  }

  if (vehicle.speedKph !== null) {
    parts.push(`${vehicle.speedKph.toFixed(1)} km/h`);
  }

  if (vehicle.headingDeg !== null) {
    parts.push(`${Math.round(vehicle.headingDeg)} deg`);
  }

  if (vehicle.latitude !== null && vehicle.longitude !== null) {
    parts.push(`${vehicle.latitude.toFixed(5)}, ${vehicle.longitude.toFixed(5)}`);
  }

  return parts.join(" � ");
}

function connectionTone(state: GpsConnectionState): "accent" | "critical" | "good" | "neutral" | "warn" {
  switch (state) {
    case "online":
      return "good";
    case "stale":
      return "warn";
    case "offline":
      return "critical";
    case "unknown":
      return "neutral";
    default:
      return "neutral";
  }
}

function formatAge(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

function formatConnectionLabel(state: GpsConnectionState, freshnessSeconds: number | null): string {
  switch (state) {
    case "online":
      return freshnessSeconds === null ? "Online" : `Online � ${formatAge(freshnessSeconds)}`;
    case "stale":
      return freshnessSeconds === null ? "Stale" : `Stale � ${formatAge(freshnessSeconds)}`;
    case "offline":
      return freshnessSeconds === null ? "Offline" : `Offline � ${formatAge(freshnessSeconds)}`;
    case "unknown":
      return "No signal yet";
    default:
      return state;
  }
}



function messageTone(status: RecentGpsMessageRecord["ingestStatus"]): "accent" | "critical" | "good" | "neutral" | "warn" {
  switch (status) {
    case "accepted":
      return "good";
    case "duplicate":
      return "warn";
    case "rejected":
      return "critical";
    default:
      return "neutral";
  }
}

function movementLabel(state: GpsMovementState): string {
  switch (state) {
    case "moving":
      return "moving";
    case "stopped":
      return "stopped";
    case "unknown":
      return "movement unknown";
    default:
      return state;
  }
}

function buildRouteStatusByVehicleId(vehicles: VehicleRouteResolutionRecord[]): Record<string, VehicleRouteResolutionRecord> {
  return Object.fromEntries(vehicles.map((vehicle) => [vehicle.vehicleId, vehicle]));
}

