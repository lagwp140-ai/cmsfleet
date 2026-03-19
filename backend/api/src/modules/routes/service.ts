import type { CmsConfig } from "@cmsfleet/config-runtime";
import type { FastifyBaseLogger } from "fastify";

import { RouteResolutionRepository } from "./repository.js";
import type {
  NextStopCandidate,
  ResolutionVehicleContext,
  RouteResolutionStatusResponse,
  RouteResolutionSummary,
  RouteResolutionUpsertInput,
  RouteState,
  ScheduledTripCandidate,
  VehicleRouteResolutionRecord
} from "./types.js";

interface ResolvedScheduleCandidate {
  referenceSeconds: number;
  trip: ScheduledTripCandidate;
}

interface ResolvedVehicle {
  persistedState: RouteResolutionUpsertInput;
  record: VehicleRouteResolutionRecord;
}

interface LocalTimeParts {
  dateString: string;
  secondsOfDay: number;
  weekdayIndex: number;
}

export class RouteResolutionService {
  constructor(
    private readonly config: CmsConfig,
    private readonly logger: FastifyBaseLogger,
    private readonly repository: RouteResolutionRepository
  ) {}

  async getStatus(referenceTime = new Date().toISOString()): Promise<RouteResolutionStatusResponse> {
    const vehicles = await this.repository.listVehiclesForResolution();
    const evaluatedAt = new Date().toISOString();
    const results: VehicleRouteResolutionRecord[] = [];
    const client = await this.repository.connect();

    try {
      await client.query("BEGIN");

      for (const vehicle of vehicles) {
        const resolved = await this.resolveVehicle(vehicle, referenceTime, evaluatedAt);
        results.push(resolved.record);
        await this.repository.upsertRouteResolution(client, resolved.persistedState);
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      this.logger.error({ err: error }, "Failed to resolve route state for vehicles");
      throw error;
    } finally {
      client.release();
    }

    return {
      evaluatedAt,
      policy: {
        fallbackDestination: this.config.transport.routeStrategy.fallbackDestination,
        routeStrategyType: this.config.transport.routeStrategy.type,
        scheduleEarlyToleranceMinutes: this.config.transport.routeStrategy.scheduleEarlyToleranceMinutes,
        scheduleLateToleranceMinutes: this.config.transport.routeStrategy.scheduleLateToleranceMinutes,
        scheduleLookaheadMinutes: this.config.transport.routeStrategy.scheduleLookaheadMinutes
      },
      resolutionOrder: [...this.config.transport.routeStrategy.resolutionOrder],
      summary: buildSummary(results),
      vehicles: results
    };
  }

  private async resolveVehicle(vehicle: ResolutionVehicleContext, referenceTime: string, evaluatedAt: string): Promise<ResolvedVehicle> {
    const routeStrategy = this.config.transport.routeStrategy;
    const timezone = this.config.gtfs.timezone || this.config.tenant.timezone;
    const currentLocal = getTimeZoneParts(referenceTime, timezone);
    const baseMetadata: Record<string, unknown> = {
      gpsAssistedMatching: "planned",
      lastSeenAt: vehicle.lastSeenAt,
      manualRouteUpdatedAt: vehicle.manualRouteUpdatedAt,
      positionTime: vehicle.positionTime,
      resolutionOrder: routeStrategy.resolutionOrder,
      sourceName: vehicle.sourceName,
      timezone
    };

    if (!vehicle.isEnabled || vehicle.operationalStatus !== "active") {
      return buildResolvedVehicle(vehicle, {
        evaluatedAt,
        metadata: baseMetadata,
        referenceSeconds: currentLocal.secondsOfDay,
        referenceTime,
        resolutionSource: vehicle.manualRouteId ? "manual" : "none",
        route: vehicle.manualRouteId
          ? {
              id: vehicle.manualRouteId,
              routeLongName: vehicle.manualRouteLongName,
              routeShortName: vehicle.manualRouteShortName ?? ""
            }
          : null,
        routeState: "inactive_vehicle",
        serviceDate: currentLocal.dateString
      });
    }

    if (vehicle.routeOverrideMode === "manual") {
      if (!vehicle.manualRouteId) {
        return buildResolvedVehicle(vehicle, {
          evaluatedAt,
          metadata: baseMetadata,
          referenceSeconds: currentLocal.secondsOfDay,
          referenceTime,
          resolutionSource: "none",
          route: null,
          routeState: "awaiting_manual_route",
          serviceDate: currentLocal.dateString
        });
      }

      const candidate = await this.findBestScheduleCandidate(vehicle.manualRouteId, currentLocal, routeStrategy);

      if (!candidate) {
        return buildResolvedVehicle(vehicle, {
          evaluatedAt,
          metadata: {
            ...baseMetadata,
            matchingMode: "manual_route_only"
          },
          referenceSeconds: currentLocal.secondsOfDay,
          referenceTime,
          resolutionSource: "manual",
          route: {
            id: vehicle.manualRouteId,
            routeLongName: vehicle.manualRouteLongName,
            routeShortName: vehicle.manualRouteShortName ?? ""
          },
          routeState: "manual_route_only",
          serviceDate: currentLocal.dateString
        });
      }

      const nextStop = await this.repository.findNextStopCandidate(candidate.trip.tripId, candidate.referenceSeconds);
      const tripState = classifyTripState(candidate.trip, candidate.referenceSeconds);

      return buildResolvedVehicle(vehicle, {
        directionId: candidate.trip.directionId,
        evaluatedAt,
        metadata: {
          ...baseMetadata,
          matchedServiceDate: candidate.trip.serviceDate,
          matchingMode: "manual_route_then_schedule",
          routeVariantId: candidate.trip.routeVariantId,
          tripEndOffsetSeconds: candidate.trip.tripEndOffsetSeconds,
          tripStartOffsetSeconds: candidate.trip.startOffsetSeconds
        },
        nextStop,
        referenceSeconds: candidate.referenceSeconds,
        referenceTime,
        resolutionSource: "schedule",
        route: {
          id: candidate.trip.routeId,
          routeLongName: candidate.trip.routeLongName,
          routeShortName: candidate.trip.routeShortName
        },
        routeState: tripStateToRouteState(tripState),
        serviceDate: candidate.trip.serviceDate,
        trip: {
          headsign: candidate.trip.tripHeadsign,
          id: candidate.trip.tripId,
          shortName: candidate.trip.tripShortName,
          startOffsetSeconds: candidate.trip.startOffsetSeconds,
          state: tripState,
          tripEndOffsetSeconds: candidate.trip.tripEndOffsetSeconds,
          variantHeadsign: candidate.trip.routeVariantHeadsign,
          variantId: candidate.trip.routeVariantId
        }
      });
    }

    return buildResolvedVehicle(vehicle, {
      evaluatedAt,
      metadata: {
        ...baseMetadata,
        matchingMode: "awaiting_gps_assisted_matching"
      },
      referenceSeconds: currentLocal.secondsOfDay,
      referenceTime,
      resolutionSource: "none",
      route: null,
      routeState: "awaiting_auto_match",
      serviceDate: currentLocal.dateString
    });
  }

  private async findBestScheduleCandidate(
    routeId: string,
    currentLocal: LocalTimeParts,
    routeStrategy: CmsConfig["transport"]["routeStrategy"]
  ): Promise<ResolvedScheduleCandidate | null> {
    const earlyToleranceSeconds = routeStrategy.scheduleEarlyToleranceMinutes * 60;
    const lateToleranceSeconds = routeStrategy.scheduleLateToleranceMinutes * 60;
    const lookaheadSeconds = routeStrategy.scheduleLookaheadMinutes * 60;
    const previousServiceDate = addDays(currentLocal.dateString, -1);
    const previousWeekdayIndex = weekdayIndexFromDateString(previousServiceDate);

    const [currentCandidate, previousCandidate] = await Promise.all([
      this.repository.findScheduledTripCandidate(
        routeId,
        currentLocal.dateString,
        currentLocal.weekdayIndex,
        currentLocal.secondsOfDay,
        earlyToleranceSeconds,
        lateToleranceSeconds,
        lookaheadSeconds
      ),
      this.repository.findScheduledTripCandidate(
        routeId,
        previousServiceDate,
        previousWeekdayIndex,
        currentLocal.secondsOfDay + 86400,
        earlyToleranceSeconds,
        lateToleranceSeconds,
        lookaheadSeconds
      )
    ]);

    return pickBestCandidate([
      currentCandidate ? { referenceSeconds: currentLocal.secondsOfDay, trip: currentCandidate } : null,
      previousCandidate ? { referenceSeconds: currentLocal.secondsOfDay + 86400, trip: previousCandidate } : null
    ]);
  }
}

function addDays(dateString: string, days: number): string {
  const dateParts = parseDateStringParts(dateString);
  const date = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function buildResolvedVehicle(
  vehicle: ResolutionVehicleContext,
  input: {
    directionId?: number | null;
    evaluatedAt: string;
    metadata: Record<string, unknown>;
    nextStop?: NextStopCandidate | null;
    referenceSeconds: number;
    referenceTime: string;
    resolutionSource: VehicleRouteResolutionRecord["resolutionSource"];
    route: VehicleRouteResolutionRecord["route"];
    routeState: RouteState;
    serviceDate: string | null;
    trip?: {
      headsign: string | null;
      id: string;
      shortName: string | null;
      startOffsetSeconds: number;
      state: "active" | "completed" | "upcoming";
      tripEndOffsetSeconds: number;
      variantHeadsign: string | null;
      variantId: string | null;
    } | null;
  }
): ResolvedVehicle {
  const record: VehicleRouteResolutionRecord = {
    directionId: input.directionId ?? null,
    evaluatedAt: input.evaluatedAt,
    externalVehicleId: vehicle.externalVehicleId,
    isEnabled: vehicle.isEnabled,
    label: vehicle.label,
    lastSeenAt: vehicle.lastSeenAt,
    nextStop: input.nextStop
      ? {
          arrivalTimeText: formatGtfsTime(input.nextStop.arrivalOffsetSeconds),
          departureTimeText: formatGtfsTime(input.nextStop.departureOffsetSeconds),
          stopCode: input.nextStop.stopCode,
          stopId: input.nextStop.stopId,
          stopName: input.nextStop.stopName,
          stopSequence: input.nextStop.stopSequence
        }
      : null,
    operationalStatus: vehicle.operationalStatus,
    referenceTime: input.referenceTime,
    registrationPlate: vehicle.registrationPlate,
    resolutionMetadata: {
      ...input.metadata,
      referenceSeconds: input.referenceSeconds
    },
    resolutionSource: input.resolutionSource,
    route: input.route,
    routeOverrideMode: vehicle.routeOverrideMode,
    routeState: input.routeState,
    serviceDate: input.serviceDate,
    transportProfileKey: vehicle.transportProfileKey,
    trip: input.trip
      ? {
          headsign: input.trip.headsign,
          id: input.trip.id,
          shortName: input.trip.shortName,
          startTimeText: formatGtfsTime(input.trip.startOffsetSeconds),
          state: input.trip.state,
          variantHeadsign: input.trip.variantHeadsign
        }
      : null,
    vehicleCode: vehicle.vehicleCode,
    vehicleId: vehicle.vehicleId
  };

  const persistedState: RouteResolutionUpsertInput = {
    directionId: record.directionId,
    evaluatedAt: input.evaluatedAt,
    nextStopId: input.nextStop?.stopId ?? null,
    nextStopSequence: input.nextStop?.stopSequence ?? null,
    referenceSeconds: input.referenceSeconds,
    referenceTime: input.referenceTime,
    resolutionMetadata: record.resolutionMetadata,
    resolutionSource: input.resolutionSource,
    routeId: input.route?.id ?? null,
    routeState: input.routeState,
    routeVariantId: input.trip?.variantId ?? null,
    serviceDate: input.serviceDate,
    tripEndOffsetSeconds: input.trip?.tripEndOffsetSeconds ?? null,
    tripId: input.trip?.id ?? null,
    tripStartOffsetSeconds: input.trip?.startOffsetSeconds ?? null,
    vehicleId: vehicle.vehicleId
  };

  return {
    persistedState,
    record
  };
}

function buildSummary(vehicles: VehicleRouteResolutionRecord[]): RouteResolutionSummary {
  return vehicles.reduce<RouteResolutionSummary>(
    (summary, vehicle) => {
      summary.totalVehicles += 1;

      switch (vehicle.routeState) {
        case "inactive_vehicle":
          summary.inactiveVehicles += 1;
          break;
        case "manual_route_only":
        case "awaiting_manual_route":
          summary.manualOnlyVehicles += 1;
          break;
        case "scheduled_trip_active":
          summary.scheduledActiveVehicles += 1;
          break;
        case "scheduled_trip_upcoming":
          summary.scheduledUpcomingVehicles += 1;
          break;
        case "scheduled_trip_completed":
          summary.scheduledCompletedVehicles += 1;
          break;
        case "awaiting_auto_match":
          summary.awaitingAutoMatch += 1;
          break;
      }

      return summary;
    },
    {
      awaitingAutoMatch: 0,
      inactiveVehicles: 0,
      manualOnlyVehicles: 0,
      scheduledActiveVehicles: 0,
      scheduledCompletedVehicles: 0,
      scheduledUpcomingVehicles: 0,
      totalVehicles: 0
    }
  );
}

function classifyTripState(
  trip: Pick<ScheduledTripCandidate, "startOffsetSeconds" | "tripEndOffsetSeconds">,
  referenceSeconds: number
): "active" | "completed" | "upcoming" {
  if (referenceSeconds < trip.startOffsetSeconds) {
    return "upcoming";
  }

  if (referenceSeconds > trip.tripEndOffsetSeconds) {
    return "completed";
  }

  return "active";
}

function formatGtfsTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getTimeZoneParts(referenceTime: string, timeZone: string): LocalTimeParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    weekday: "short",
    year: "numeric"
  });
  const parts = formatter.formatToParts(new Date(referenceTime));
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value])) as Record<string, string | undefined>;
  const year = readTimeZonePart(lookup, "year");
  const month = readTimeZonePart(lookup, "month");
  const day = readTimeZonePart(lookup, "day");
  const hour = readTimeZonePart(lookup, "hour");
  const minute = readTimeZonePart(lookup, "minute");
  const second = readTimeZonePart(lookup, "second");
  const weekday = readTimeZonePart(lookup, "weekday");

  return {
    dateString: `${year}-${month}-${day}`,
    secondsOfDay: (Number(hour) * 3600) + (Number(minute) * 60) + Number(second),
    weekdayIndex: weekdayIndexFromShortName(weekday)
  };
}

function parseDateStringParts(dateString: string): { day: number; month: number; year: number } {
  const parts = dateString.split("-");

  if (parts.length !== 3) {
    throw new Error(`Invalid date string for route resolution: ${dateString}`);
  }

  const [yearRaw, monthRaw, dayRaw] = parts;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`Invalid date string for route resolution: ${dateString}`);
  }

  return { day, month, year };
}

function pickBestCandidate(candidates: Array<ResolvedScheduleCandidate | null>): ResolvedScheduleCandidate | null {
  const resolvedCandidates = candidates.filter((candidate): candidate is ResolvedScheduleCandidate => candidate !== null);

  if (resolvedCandidates.length === 0) {
    return null;
  }

  return [...resolvedCandidates].sort((left, right) => {
    const leftRank = tripStateRank(classifyTripState(left.trip, left.referenceSeconds));
    const rightRank = tripStateRank(classifyTripState(right.trip, right.referenceSeconds));

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const leftDistance = tripStateDistance(left.trip, left.referenceSeconds);
    const rightDistance = tripStateDistance(right.trip, right.referenceSeconds);

    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    return left.trip.startOffsetSeconds - right.trip.startOffsetSeconds;
  })[0] ?? null;
}

function readTimeZonePart(lookup: Record<string, string | undefined>, key: string): string {
  const value = lookup[key];

  if (!value) {
    throw new Error(`Missing ${key} while resolving local GTFS time.`);
  }

  return value;
}

function tripStateDistance(trip: ScheduledTripCandidate, referenceSeconds: number): number {
  const state = classifyTripState(trip, referenceSeconds);

  switch (state) {
    case "active":
      return Math.abs(referenceSeconds - trip.startOffsetSeconds);
    case "upcoming":
      return trip.startOffsetSeconds - referenceSeconds;
    case "completed":
      return referenceSeconds - trip.tripEndOffsetSeconds;
    default:
      return Number.MAX_SAFE_INTEGER;
  }
}

function tripStateRank(state: "active" | "completed" | "upcoming"): number {
  switch (state) {
    case "active":
      return 0;
    case "upcoming":
      return 1;
    case "completed":
      return 2;
    default:
      return 3;
  }
}

function tripStateToRouteState(state: "active" | "completed" | "upcoming"): RouteState {
  switch (state) {
    case "active":
      return "scheduled_trip_active";
    case "upcoming":
      return "scheduled_trip_upcoming";
    case "completed":
      return "scheduled_trip_completed";
    default:
      return "manual_route_only";
  }
}

function weekdayIndexFromDateString(dateString: string): number {
  const dateParts = parseDateStringParts(dateString);
  return new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day)).getUTCDay();
}

function weekdayIndexFromShortName(value: string): number {
  switch (value.toLowerCase()) {
    case "sun":
      return 0;
    case "mon":
      return 1;
    case "tue":
      return 2;
    case "wed":
      return 3;
    case "thu":
      return 4;
    case "fri":
      return 5;
    case "sat":
      return 6;
    default:
      return 0;
  }
}
