import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchRouteResolutionStatus } from "../admin/routeClient";
import type { RouteResolutionStatusResponse, RouteState, VehicleRouteResolutionRecord } from "../admin/routeTypes";
import { useAdminConsole } from "../admin/useAdminConsole";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../auth/authClient";
import { MetricCard, Notice, Panel, SectionHeader } from "../components/admin/AdminPrimitives";
import { formatConsoleDateTime } from "../lib/time";

export function RoutesPage() {
  const navigate = useNavigate();
  const { dashboard } = useAdminConsole();
  const { logout, user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<RouteResolutionStatusResponse | null>(null);

  const canManageRoutes = user?.permissions?.includes("dispatch:manage") ?? false;
  const locale = dashboard?.tenant.locale;

  const handleUnauthorized = useEffectEvent(async () => {
    await logout();
    navigate("/login", { replace: true });
  });

  const loadStatus = useEffectEvent(async () => {
    if (!canManageRoutes) {
      setIsLoading(false);
      setStatus(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextStatus = await fetchRouteResolutionStatus();
      startTransition(() => {
        setStatus(nextStatus);
      });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      if (requestError instanceof ApiError && requestError.status === 403) {
        setError("Your role can access the console, but route resolution requires the dispatch:manage permission.");
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to load route resolution status.");
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void loadStatus();
  }, [canManageRoutes]);

  const summary = status?.summary;
  const vehicles = status?.vehicles ?? [];

  return (
    <div className="page-stack">
      <SectionHeader
        actions={
          canManageRoutes ? (
            <button className="action-button action-button--secondary" onClick={() => void loadStatus()} type="button">
              Refresh resolution
            </button>
          ) : undefined
        }
        description="Resolve the current operating route per bus with a manual-first policy, enrich it with GTFS schedule context, and leave a clean path open for GPS-assisted trip matching later."
        eyebrow="Route Resolution"
        title="Routes"
      />

      {!canManageRoutes ? (
        <Notice
          body={`Your ${user?.role ?? "viewer"} role can open the admin shell, but route resolution and dispatch controls require the dispatch:manage permission.`}
          title="Route control restricted"
          tone="warn"
        />
      ) : null}

      {error ? <Notice body={error} title="Route resolution unavailable" tone="critical" /> : null}

      <section className="metric-grid">
        <MetricCard detail="Vehicles currently evaluated by the manual-first route engine." label="Resolved vehicles" tone="accent" value={String(summary?.totalVehicles ?? 0).padStart(2, "0")} />
        <MetricCard detail="Buses with a schedule-selected trip that is active right now." label="Scheduled active" tone="good" value={String(summary?.scheduledActiveVehicles ?? 0).padStart(2, "0")} />
        <MetricCard detail="Vehicles that still only have a manual route assignment or need a manual route to proceed." label="Manual only" tone={summary && summary.manualOnlyVehicles > 0 ? "warn" : "neutral"} value={String(summary?.manualOnlyVehicles ?? 0).padStart(2, "0")} />
        <MetricCard detail="Vehicles waiting for the later GPS-assisted auto-matching stage because no manual route is pinned." label="Awaiting auto match" tone={summary && summary.awaitingAutoMatch > 0 ? "warn" : "neutral"} value={String(summary?.awaitingAutoMatch ?? 0).padStart(2, "0")} />
      </section>

      <section className="panel-grid panel-grid--two">
        <Panel description="The route engine resolves in the configured order and uses GTFS service calendars plus stop_times once a manual route is available." title="Resolution policy">
          <div className="detail-list">
            <div className="detail-row">
              <div>
                <div className="detail-row__label">Strategy type</div>
                <div className="detail-row__meta">Transport-profile route strategy currently active for this deployment.</div>
              </div>
              <span className="tone-pill tone-pill--accent">{status?.policy.routeStrategyType ?? "pending"}</span>
            </div>
            <div className="detail-row">
              <div>
                <div className="detail-row__label">Resolution order</div>
                <div className="detail-row__meta">Manual route overrides are evaluated before schedule support, and GPS matching is reserved for the next rollout.</div>
              </div>
              <span className="tone-pill tone-pill--good">{status?.resolutionOrder?.join(" -> ") ?? "manual -> schedule -> gps"}</span>
            </div>
            <div className="detail-row">
              <div>
                <div className="detail-row__label">Schedule window</div>
                <div className="detail-row__meta">How far early, late, and ahead the engine can look when selecting a GTFS trip on a pinned route.</div>
              </div>
              <span className="tone-pill tone-pill--neutral">
                E {status?.policy.scheduleEarlyToleranceMinutes ?? 0}m / L {status?.policy.scheduleLateToleranceMinutes ?? 0}m / +{status?.policy.scheduleLookaheadMinutes ?? 0}m
              </span>
            </div>
            <div className="detail-row">
              <div>
                <div className="detail-row__label">Fallback destination</div>
                <div className="detail-row__meta">Display fallback when schedule context is unavailable or unresolved.</div>
              </div>
              <span className="tone-pill tone-pill--warn">{status?.policy.fallbackDestination ?? "Not configured"}</span>
            </div>
          </div>
        </Panel>

        <Panel description="A quick fleet summary of where dispatch effort is needed right now." title="Resolution posture">
          {isLoading ? (
            <div className="empty-state">Resolving fleet routes...</div>
          ) : (
            <div className="detail-list">
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Upcoming departures</div>
                  <div className="detail-row__meta">Vehicles already pinned to a route with a next scheduled trip coming soon.</div>
                </div>
                <span className="tone-pill tone-pill--accent">{summary?.scheduledUpcomingVehicles ?? 0}</span>
              </div>
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Completed trips</div>
                  <div className="detail-row__meta">Vehicles whose selected trip has already run through the scheduled terminal stop window.</div>
                </div>
                <span className="tone-pill tone-pill--neutral">{summary?.scheduledCompletedVehicles ?? 0}</span>
              </div>
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Inactive vehicles</div>
                  <div className="detail-row__meta">Units disabled or not in active fleet status stay visible but are not pushed through live schedule matching.</div>
                </div>
                <span className="tone-pill tone-pill--warn">{summary?.inactiveVehicles ?? 0}</span>
              </div>
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Evaluated at</div>
                  <div className="detail-row__meta">Latest backend resolution timestamp for this screen refresh.</div>
                </div>
                <span className="tone-pill tone-pill--good">{status?.evaluatedAt ? formatConsoleTime(status.evaluatedAt, locale) : "Pending"}</span>
              </div>
            </div>
          )}
        </Panel>
      </section>

      <Panel description="Each card shows the route state chosen for the vehicle, the current or upcoming scheduled trip when one exists, and the next stop candidate derived from GTFS stop_times." title="Vehicle route state">
        {isLoading ? (
          <div className="empty-state">Resolving route state for vehicles...</div>
        ) : vehicles.length === 0 ? (
          <div className="empty-state">No vehicles are registered for route resolution yet.</div>
        ) : (
          <div className="registry-grid">
            {vehicles.map((vehicle) => (
              <article className="registry-card" key={vehicle.vehicleId}>
                <div className="registry-card__header">
                  <div>
                    <div className="registry-card__eyebrow">{vehicle.vehicleCode}</div>
                    <h3 className="registry-card__title">{vehicle.label}</h3>
                    <div className="registry-card__subtext">{buildVehicleRouteMeta(vehicle, locale)}</div>
                  </div>
                  <div className="badge-row">
                    <span className={`tone-pill tone-pill--${routeStateTone(vehicle.routeState)}`}>{formatLabel(vehicle.routeState)}</span>
                    <span className={`tone-pill tone-pill--${vehicle.routeOverrideMode === "manual" ? "accent" : "neutral"}`}>{vehicle.routeOverrideMode === "manual" ? "Manual route" : "Auto mode"}</span>
                    <span className={`tone-pill tone-pill--${vehicle.resolutionSource === "schedule" ? "good" : vehicle.resolutionSource === "manual" ? "accent" : "neutral"}`}>{formatLabel(vehicle.resolutionSource)}</span>
                  </div>
                </div>
                <div className="registry-card__specs">
                  <div className="registry-card__spec"><span>Route</span><strong>{vehicle.route ? formatRouteLabel(vehicle.route.routeShortName, vehicle.route.routeLongName) : "Unresolved"}</strong></div>
                  <div className="registry-card__spec"><span>Trip</span><strong>{vehicle.trip ? formatTripLabel(vehicle.trip) : "No scheduled trip"}</strong></div>
                  <div className="registry-card__spec"><span>Next stop</span><strong>{vehicle.nextStop ? formatNextStopLabel(vehicle.nextStop) : "None"}</strong></div>
                  <div className="registry-card__spec"><span>Service date</span><strong>{vehicle.serviceDate ?? "Not selected"}</strong></div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function buildVehicleRouteMeta(vehicle: VehicleRouteResolutionRecord, locale?: string): string {
  const parts = [vehicle.transportProfileKey, vehicle.operationalStatus, vehicle.isEnabled ? "enabled" : "disabled"];

  if (vehicle.registrationPlate) {
    parts.push(vehicle.registrationPlate);
  }

  if (vehicle.trip) {
    parts.push(`${vehicle.trip.state} trip ${vehicle.trip.startTimeText}`);
  }

  if (vehicle.lastSeenAt) {
    parts.push(`last seen ${formatConsoleTime(vehicle.lastSeenAt, locale)}`);
  }

  return parts.join(" · ");
}

function formatConsoleTime(timestamp: string, locale?: string): string {
  return formatConsoleDateTime(timestamp, locale);
}

function formatLabel(value: string): string {
  return value
    .split(/[-_]/)
    .filter((segment) => segment !== "")
    .map((segment) => segment.slice(0, 1).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatNextStopLabel(stop: NonNullable<VehicleRouteResolutionRecord["nextStop"]>): string {
  return `${stop.stopSequence}. ${stop.stopName} @ ${stop.departureTimeText}`;
}

function formatRouteLabel(shortName: string, longName: string | null): string {
  return longName ? `${shortName} · ${longName}` : shortName;
}

function formatTripLabel(trip: NonNullable<VehicleRouteResolutionRecord["trip"]>): string {
  const name = trip.shortName ?? trip.headsign ?? trip.id;
  return `${name} @ ${trip.startTimeText}`;
}

function routeStateTone(state: RouteState): "accent" | "critical" | "good" | "neutral" | "warn" {
  switch (state) {
    case "scheduled_trip_active":
      return "good";
    case "scheduled_trip_upcoming":
      return "accent";
    case "manual_route_only":
    case "awaiting_manual_route":
    case "awaiting_auto_match":
      return "warn";
    case "inactive_vehicle":
    case "scheduled_trip_completed":
      return "neutral";
    default:
      return "neutral";
  }
}





