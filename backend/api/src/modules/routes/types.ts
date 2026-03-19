import type { VehicleOperationalStatus, VehicleRouteOverrideMode } from "../vehicles/types.js";

export const ROUTE_RESOLUTION_SOURCES = ["none", "manual", "schedule", "gps_assisted"] as const;
export const ROUTE_STATES = [
  "inactive_vehicle",
  "awaiting_manual_route",
  "manual_route_only",
  "scheduled_trip_upcoming",
  "scheduled_trip_active",
  "scheduled_trip_completed",
  "awaiting_auto_match"
] as const;

export type RouteResolutionSource = (typeof ROUTE_RESOLUTION_SOURCES)[number];
export type RouteState = (typeof ROUTE_STATES)[number];

export interface ResolutionVehicleContext {
  externalVehicleId: string | null;
  isEnabled: boolean;
  label: string;
  lastSeenAt: string | null;
  latitude: number | null;
  longitude: number | null;
  manualRouteAgencyId: string | null;
  manualRouteExternalId: string | null;
  manualRouteId: string | null;
  manualRouteLongName: string | null;
  manualRouteShortName: string | null;
  manualRouteUpdatedAt: string | null;
  operationalStatus: VehicleOperationalStatus;
  positionTime: string | null;
  registrationPlate: string | null;
  routeOverrideMode: VehicleRouteOverrideMode;
  sourceName: string | null;
  transportProfileKey: string;
  vehicleCode: string;
  vehicleId: string;
}

export interface ScheduledTripCandidate {
  directionId: number | null;
  routeId: string;
  routeLongName: string | null;
  routeShortName: string;
  routeVariantHeadsign: string | null;
  routeVariantId: string | null;
  serviceDate: string;
  startOffsetSeconds: number;
  tripEndOffsetSeconds: number;
  tripHeadsign: string | null;
  tripId: string;
  tripShortName: string | null;
}

export interface NextStopCandidate {
  arrivalOffsetSeconds: number;
  departureOffsetSeconds: number;
  stopCode: string | null;
  stopId: string;
  stopName: string;
  stopSequence: number;
}

export interface VehicleRouteResolutionRecord {
  directionId: number | null;
  evaluatedAt: string;
  externalVehicleId: string | null;
  isEnabled: boolean;
  label: string;
  lastSeenAt: string | null;
  nextStop: {
    arrivalTimeText: string;
    departureTimeText: string;
    stopCode: string | null;
    stopId: string;
    stopName: string;
    stopSequence: number;
  } | null;
  operationalStatus: VehicleOperationalStatus;
  referenceTime: string;
  registrationPlate: string | null;
  resolutionMetadata: Record<string, unknown>;
  resolutionSource: RouteResolutionSource;
  route: {
    id: string;
    routeLongName: string | null;
    routeShortName: string;
  } | null;
  routeOverrideMode: VehicleRouteOverrideMode;
  routeState: RouteState;
  serviceDate: string | null;
  transportProfileKey: string;
  trip: {
    headsign: string | null;
    id: string;
    shortName: string | null;
    startTimeText: string;
    state: "active" | "completed" | "upcoming";
    variantHeadsign: string | null;
  } | null;
  vehicleCode: string;
  vehicleId: string;
}

export interface RouteResolutionSummary {
  awaitingAutoMatch: number;
  inactiveVehicles: number;
  manualOnlyVehicles: number;
  scheduledActiveVehicles: number;
  scheduledCompletedVehicles: number;
  scheduledUpcomingVehicles: number;
  totalVehicles: number;
}

export interface RouteResolutionStatusResponse {
  evaluatedAt: string;
  policy: {
    fallbackDestination: string;
    routeStrategyType: string;
    scheduleEarlyToleranceMinutes: number;
    scheduleLateToleranceMinutes: number;
    scheduleLookaheadMinutes: number;
  };
  resolutionOrder: string[];
  summary: RouteResolutionSummary;
  vehicles: VehicleRouteResolutionRecord[];
}

export interface RouteResolutionUpsertInput {
  directionId: number | null;
  evaluatedAt: string;
  nextStopId: string | null;
  nextStopSequence: number | null;
  referenceSeconds: number | null;
  referenceTime: string;
  resolutionMetadata: Record<string, unknown>;
  resolutionSource: RouteResolutionSource;
  routeId: string | null;
  routeState: RouteState;
  routeVariantId: string | null;
  serviceDate: string | null;
  tripEndOffsetSeconds: number | null;
  tripId: string | null;
  tripStartOffsetSeconds: number | null;
  vehicleId: string;
}
