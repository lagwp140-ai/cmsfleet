export type RouteResolutionSource = "none" | "manual" | "schedule" | "gps_assisted";
export type RouteState =
  | "inactive_vehicle"
  | "awaiting_manual_route"
  | "manual_route_only"
  | "scheduled_trip_upcoming"
  | "scheduled_trip_active"
  | "scheduled_trip_completed"
  | "awaiting_auto_match";

export interface RouteResolutionSummary {
  awaitingAutoMatch: number;
  inactiveVehicles: number;
  manualOnlyVehicles: number;
  scheduledActiveVehicles: number;
  scheduledCompletedVehicles: number;
  scheduledUpcomingVehicles: number;
  totalVehicles: number;
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
  operationalStatus: "active" | "inactive" | "maintenance" | "retired";
  referenceTime: string;
  registrationPlate: string | null;
  resolutionMetadata: Record<string, unknown>;
  resolutionSource: RouteResolutionSource;
  route: {
    id: string;
    routeLongName: string | null;
    routeShortName: string;
  } | null;
  routeOverrideMode: "auto" | "manual";
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
