export type GpsConnectionState = "online" | "stale" | "offline" | "unknown";
export type GpsMovementState = "moving" | "stopped" | "unknown";
export type GpsIngestStatus = "accepted" | "duplicate" | "rejected";

export interface GpsStatusSummary {
  movingVehicles: number;
  offlineVehicles: number;
  onlineVehicles: number;
  staleVehicles: number;
  stoppedVehicles: number;
  trackedVehicles: number;
  unknownVehicles: number;
}

export interface GpsVehicleStatusRecord {
  connectionState: GpsConnectionState;
  externalVehicleId: string | null;
  freshnessSeconds: number | null;
  headingDeg: number | null;
  isEnabled: boolean;
  isOffline: boolean;
  isStale: boolean;
  label: string;
  lastSeenAt: string | null;
  latitude: number | null;
  longitude: number | null;
  movementState: GpsMovementState;
  operationalStatus: "active" | "inactive" | "maintenance" | "retired";
  positionTime: string | null;
  registrationPlate: string | null;
  routeOverrideMode: "auto" | "manual";
  sourceName: string | null;
  speedKph: number | null;
  transportProfileKey: string;
  vehicleCode: string;
  vehicleId: string;
}

export interface GpsStatusResponse {
  freshnessThresholdSeconds: number;
  movementThresholdKph: number;
  offlineThresholdSeconds: number;
  sourceName: string;
  summary: GpsStatusSummary;
  vehicles: GpsVehicleStatusRecord[];
}

export interface RecentGpsMessageRecord {
  accuracyM: number | null;
  headingDeg: number | null;
  id: string;
  ingestStatus: GpsIngestStatus;
  latitude: number | null;
  longitude: number | null;
  metadata: Record<string, unknown>;
  positionTime: string | null;
  providerMessageId: string | null;
  rawPayload: unknown;
  receivedAt: string;
  sourceName: string;
  speedKph: number | null;
  vehicleCode: string | null;
  vehicleId: string | null;
  vehicleLabel: string | null;
}
