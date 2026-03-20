import type { CSSProperties } from "react";

import type { GpsConnectionState, GpsVehicleStatusRecord } from "../../admin/gpsTypes";
import type { VehicleRouteResolutionRecord } from "../../admin/routeTypes";
import { formatConsoleClock } from "../../lib/time";

interface GpsMapPreviewProps {
  locale?: string;
  routeStatusByVehicleId?: Record<string, VehicleRouteResolutionRecord>;
  vehicles: GpsVehicleStatusRecord[];
}

interface PositionedVehicle {
  left: number;
  top: number;
  vehicle: GpsVehicleStatusRecord;
}

const MAP_HEIGHT = 420;
const MAP_WIDTH = 960;
const MARKER_MARGIN = 28;
const RIGA_CENTER = { latitude: 56.9496, longitude: 24.1052 };
const RIGA_LATITUDE_RANGE = { max: 57.08, min: 56.85 };
const RIGA_LONGITUDE_RANGE = { max: 24.32, min: 23.95 };
const ZOOM_LEVEL = 12;

export function GpsMapPreview({ locale, routeStatusByVehicleId = {}, vehicles }: GpsMapPreviewProps) {
  const mappedVehicles = vehicles.filter(hasCoordinates);
  const focus = resolveMapFocus(mappedVehicles);
  const centerPoint = projectPoint(focus.latitude, focus.longitude, ZOOM_LEVEL);
  const topLeft = {
    x: centerPoint.x - MAP_WIDTH / 2,
    y: centerPoint.y - MAP_HEIGHT / 2
  };
  const visibleVehicles = mappedVehicles
    .map((vehicle) => positionVehicle(vehicle, topLeft))
    .filter((vehicle): vehicle is PositionedVehicle => vehicle !== null)
    .sort((left, right) => sortVehicles(left.vehicle, right.vehicle));
  const style = {
    "--gps-map-height": `${MAP_HEIGHT}px`,
    "--gps-map-width": `${MAP_WIDTH}px`
  } as CSSProperties;

  return (
    <div className="gps-map-stack">
      <div className="gps-map-toolbar">
        <div>
          <div className="gps-map-toolbar__label">Riga preview</div>
          <strong>{visibleVehicles.length} vehicles in view</strong>
        </div>
        <div>
          <div className="gps-map-toolbar__label">Map focus</div>
          <strong>{focus.latitude.toFixed(4)}, {focus.longitude.toFixed(4)}</strong>
        </div>
        <div>
          <div className="gps-map-toolbar__label">Feed posture</div>
          <strong>{mappedVehicles.length > 0 ? "Live GPS overlay" : "Awaiting positions"}</strong>
        </div>
      </div>

      <div className="gps-map-frame">
        <div className="gps-map-viewport" style={style}>
          {buildTiles(topLeft).map((tile) => (
            <img
              alt=""
              className="gps-map-tile"
              draggable={false}
              height={256}
              key={`${tile.x}-${tile.y}`}
              loading="lazy"
              src={tile.url}
              style={{ left: `${tile.left}px`, top: `${tile.top}px` }}
              width={256}
            />
          ))}
          <div className="gps-map-overlay" />
          <div className="gps-map-center" aria-hidden="true" />

          {visibleVehicles.length === 0 ? (
            <div className="gps-map-empty">
              No mapped vehicles are visible yet. The preview stays centered on Riga until GPS points arrive.
            </div>
          ) : null}

          {visibleVehicles.map(({ left, top, vehicle }) => (
            <div
              className={`gps-map-marker gps-map-marker--${connectionTone(vehicle.connectionState)}`}
              key={vehicle.vehicleId}
              style={{ left: `${left}px`, top: `${top}px` }}
              title={buildMarkerTitle(vehicle, routeStatusByVehicleId[vehicle.vehicleId], locale)}
            >
              <span className="gps-map-marker__dot" />
              <span className="gps-map-marker__label">{buildMarkerLabel(vehicle, routeStatusByVehicleId[vehicle.vehicleId])}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="gps-map-footnote">
        OpenStreetMap tiles. Preview locked to Riga so dispatch can quickly spot live bus positions without leaving the GPS screen.
      </div>

      {visibleVehicles.length > 0 ? (
        <div className="gps-map-list">
          {visibleVehicles.slice(0, 8).map(({ vehicle }) => (
            <article className="gps-map-list__item" key={`list-${vehicle.vehicleId}`}>
              <div>
<strong>{buildMarkerLabel(vehicle, routeStatusByVehicleId[vehicle.vehicleId])}</strong>
                <div className="gps-map-list__meta">{buildListMeta(vehicle, routeStatusByVehicleId[vehicle.vehicleId])}</div>
              </div>
              <div className="gps-map-list__chips">
                <span className={`tone-pill tone-pill--${connectionTone(vehicle.connectionState)}`}>{formatConnection(vehicle.connectionState)}</span>
                <span className="tone-pill tone-pill--neutral">{vehicle.speedKph === null ? "Speed n/a" : `${Math.round(vehicle.speedKph)} km/h`}</span>
                {routeStatusByVehicleId[vehicle.vehicleId]?.trip?.headsign || routeStatusByVehicleId[vehicle.vehicleId]?.trip?.variantHeadsign ? (
                  <span className="tone-pill tone-pill--accent">{routeStatusByVehicleId[vehicle.vehicleId]?.trip?.headsign ?? routeStatusByVehicleId[vehicle.vehicleId]?.trip?.variantHeadsign}</span>
                ) : null}
                <span className="tone-pill tone-pill--neutral">{formatLastSeen(vehicle.lastSeenAt, locale)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function buildMarkerTitle(vehicle: GpsVehicleStatusRecord, route: VehicleRouteResolutionRecord | undefined, locale?: string): string {
  const parts = [buildMarkerLabel(vehicle, route), vehicle.label, formatConnection(vehicle.connectionState)];

  if (route?.trip?.headsign ?? route?.trip?.variantHeadsign) {
    parts.push(route?.trip?.headsign ?? route?.trip?.variantHeadsign ?? "");
  }

  if (route?.nextStop) {
    parts.push(`next ${route.nextStop.stopName}`);
  }

  if (vehicle.speedKph !== null) {
    parts.push(`${Math.round(vehicle.speedKph)} km/h`);
  }

  if (vehicle.lastSeenAt) {
    parts.push(`last seen ${formatLastSeen(vehicle.lastSeenAt, locale)}`);
  }

  return parts.join(" | ");
}

function buildTiles(topLeft: { x: number; y: number }): Array<{ left: number; top: number; url: string; x: number; y: number }> {
  const tileCount = 2 ** ZOOM_LEVEL;
  const minTileX = Math.floor(topLeft.x / 256);
  const maxTileX = Math.floor((topLeft.x + MAP_WIDTH) / 256);
  const minTileY = Math.floor(topLeft.y / 256);
  const maxTileY = Math.floor((topLeft.y + MAP_HEIGHT) / 256);
  const tiles: Array<{ left: number; top: number; url: string; x: number; y: number }> = [];

  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    if (tileY < 0 || tileY >= tileCount) {
      continue;
    }

    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      const normalizedTileX = ((tileX % tileCount) + tileCount) % tileCount;

      tiles.push({
        left: tileX * 256 - topLeft.x,
        top: tileY * 256 - topLeft.y,
        url: `https://tile.openstreetmap.org/${ZOOM_LEVEL}/${normalizedTileX}/${tileY}.png`,
        x: normalizedTileX,
        y: tileY
      });
    }
  }

  return tiles;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function connectionTone(state: GpsConnectionState): "accent" | "critical" | "good" | "neutral" | "warn" {
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

function formatConnection(state: GpsConnectionState): string {
  switch (state) {
    case "online":
      return "Online";
    case "stale":
      return "Stale";
    case "offline":
      return "Offline";
    default:
      return "No signal";
  }
}

function formatLastSeen(timestamp: string | null, locale?: string): string {
  if (!timestamp) {
    return "No fix";
  }

  return formatConsoleClock(timestamp, locale);
}

function hasCoordinates(vehicle: GpsVehicleStatusRecord): vehicle is GpsVehicleStatusRecord & { latitude: number; longitude: number } {
  return vehicle.latitude !== null && vehicle.longitude !== null;
}

function positionVehicle(vehicle: GpsVehicleStatusRecord & { latitude: number; longitude: number }, topLeft: { x: number; y: number }): PositionedVehicle | null {
  const point = projectPoint(vehicle.latitude, vehicle.longitude, ZOOM_LEVEL);
  const left = point.x - topLeft.x;
  const top = point.y - topLeft.y;

  if (left < -MARKER_MARGIN || left > MAP_WIDTH + MARKER_MARGIN || top < -MARKER_MARGIN || top > MAP_HEIGHT + MARKER_MARGIN) {
    return null;
  }

  return {
    left,
    top,
    vehicle
  };
}

function projectPoint(latitude: number, longitude: number, zoom: number): { x: number; y: number } {
  const scale = 256 * 2 ** zoom;
  const latitudeRadians = latitude * Math.PI / 180;
  const x = ((longitude + 180) / 360) * scale;
  const y = (0.5 - Math.log((1 + Math.sin(latitudeRadians)) / (1 - Math.sin(latitudeRadians))) / (4 * Math.PI)) * scale;

  return { x, y };
}

function resolveMapFocus(vehicles: Array<GpsVehicleStatusRecord & { latitude: number; longitude: number }>): { latitude: number; longitude: number } {
  if (vehicles.length === 0) {
    return RIGA_CENTER;
  }

  const localVehicles = vehicles.filter((vehicle) => isInsideRigaWindow(vehicle.latitude, vehicle.longitude));
  const focusVehicles = localVehicles.length > 0 ? localVehicles : vehicles;
  const latitude = focusVehicles.reduce((sum, vehicle) => sum + vehicle.latitude, 0) / focusVehicles.length;
  const longitude = focusVehicles.reduce((sum, vehicle) => sum + vehicle.longitude, 0) / focusVehicles.length;

  return {
    latitude: clamp(latitude, RIGA_LATITUDE_RANGE.min, RIGA_LATITUDE_RANGE.max),
    longitude: clamp(longitude, RIGA_LONGITUDE_RANGE.min, RIGA_LONGITUDE_RANGE.max)
  };
}

function isInsideRigaWindow(latitude: number, longitude: number): boolean {
  return latitude >= RIGA_LATITUDE_RANGE.min
    && latitude <= RIGA_LATITUDE_RANGE.max
    && longitude >= RIGA_LONGITUDE_RANGE.min
    && longitude <= RIGA_LONGITUDE_RANGE.max;
}

function sortVehicles(left: GpsVehicleStatusRecord, right: GpsVehicleStatusRecord): number {
  const leftFreshness = left.freshnessSeconds ?? Number.MAX_SAFE_INTEGER;
  const rightFreshness = right.freshnessSeconds ?? Number.MAX_SAFE_INTEGER;

  return leftFreshness - rightFreshness || left.vehicleCode.localeCompare(right.vehicleCode);
}

function buildListMeta(vehicle: GpsVehicleStatusRecord, route: VehicleRouteResolutionRecord | undefined): string {
  const parts = [vehicle.label];

  if (route?.route) {
    parts.push(`Route ${route.route.routeShortName}`);
  }

  if (route?.nextStop) {
    parts.push(`Next ${route.nextStop.stopName}`);
  }

  return parts.join(" · ");
}

function buildMarkerLabel(vehicle: GpsVehicleStatusRecord, route: VehicleRouteResolutionRecord | undefined): string {
  return route?.route ? `${route.route.routeShortName} | ${vehicle.vehicleCode}` : vehicle.vehicleCode;
}


