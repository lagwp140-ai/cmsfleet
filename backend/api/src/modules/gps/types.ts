import type { VehicleOperationalStatus, VehicleRouteOverrideMode } from "../vehicles/types.js";

export const GPS_INGEST_STATUSES = ["accepted", "duplicate", "rejected"] as const;
export const GPS_CONNECTION_STATES = ["online", "stale", "offline", "unknown"] as const;
export const GPS_MOVEMENT_STATES = ["moving", "stopped", "unknown"] as const;

export type GpsIngestStatus = (typeof GPS_INGEST_STATUSES)[number];
export type GpsConnectionState = (typeof GPS_CONNECTION_STATES)[number];
export type GpsMovementState = (typeof GPS_MOVEMENT_STATES)[number];
export type GpsIngestionAdapter = "http_json";

export interface MatchedVehicleRecord {
  externalVehicleId: string | null;
  id: string;
  isEnabled: boolean;
  label: string;
  operationalStatus: VehicleOperationalStatus;
  vehicleCode: string;
}

export interface NormalizedGpsMessage {
  accuracyM: number | null;
  adapter: GpsIngestionAdapter;
  headingDeg: number | null;
  latitude: number;
  longitude: number;
  metadata: Record<string, unknown>;
  positionTime: string;
  providerMessageId: string | null;
  rawPayload: unknown;
  receivedAt: string;
  sourceName: string;
  speedKph: number | null;
  vehicleIdentifier: string;
}

export interface RejectedGpsMessageInput {
  accuracyM: number | null;
  adapter: GpsIngestionAdapter;
  headingDeg: number | null;
  latitude: number | null;
  longitude: number | null;
  metadata: Record<string, unknown>;
  positionTime: string | null;
  providerMessageId: string | null;
  rawPayload: unknown;
  reason: string;
  receivedAt: string;
  sourceName: string;
  speedKph: number | null;
  vehicleIdentifier: string | null;
}

export interface GpsIngestionResult {
  connectionState: GpsConnectionState | null;
  message: string;
  messageId: string;
  movementState: GpsMovementState | null;
  positionUpdated: boolean;
  receivedAt: string;
  status: GpsIngestStatus;
  vehicleCode?: string;
  vehicleId?: string;
}

export interface GpsOperationalStateExtensions {
  geofence: Record<string, unknown> | null;
  routeProximity: Record<string, unknown> | null;
  stopProximity: Record<string, unknown> | null;
  tripProgress: Record<string, unknown> | null;
}

export interface StoredOperationalStateRecord {
  extensions: GpsOperationalStateExtensions;
  headingDeg: number | null;
  lastPositionMessageId: string | null;
  lastReceivedMessageId: string | null;
  lastSeenAt: string;
  latitude: number;
  longitude: number;
  movementState: GpsMovementState;
  positionTime: string;
  processingMetadata: Record<string, unknown>;
  sourceName: string;
  speedKph: number | null;
  updatedAt: string;
  vehicleId: string;
}

export interface OperationalStateUpsertInput {
  extensions: GpsOperationalStateExtensions;
  headingDeg: number | null;
  lastPositionMessageId: string | null;
  lastReceivedMessageId: string;
  lastSeenAt: string;
  latitude: number;
  longitude: number;
  movementState: GpsMovementState;
  positionTime: string;
  processingMetadata: Record<string, unknown>;
  sourceName: string;
  speedKph: number | null;
  vehicleId: string;
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
  operationalStatus: VehicleOperationalStatus;
  positionTime: string | null;
  registrationPlate: string | null;
  routeOverrideMode: VehicleRouteOverrideMode;
  sourceName: string | null;
  speedKph: number | null;
  transportProfileKey: string;
  vehicleCode: string;
  vehicleId: string;
}

export interface GpsStatusSummary {
  movingVehicles: number;
  offlineVehicles: number;
  onlineVehicles: number;
  staleVehicles: number;
  stoppedVehicles: number;
  trackedVehicles: number;
  unknownVehicles: number;
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
