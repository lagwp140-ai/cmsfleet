import { describe, expect, it, vi } from "vitest";

import type { RouteAutoMatcher } from "../../../src/modules/routes/auto-matchers.js";
import type { RouteResolutionRepository } from "../../../src/modules/routes/repository.js";
import { RouteResolutionService } from "../../../src/modules/routes/service.js";
import type {
  NextStopCandidate,
  ResolutionVehicleContext,
  RouteResolutionUpsertInput,
  ScheduledTripCandidate
} from "../../../src/modules/routes/types.js";
import { createTestRuntime } from "../../helpers/config.js";
import { createMockLogger } from "../../helpers/logger.js";

function createVehicle(overrides: Partial<ResolutionVehicleContext> = {}): ResolutionVehicleContext {
  return {
    externalVehicleId: null,
    isEnabled: true,
    label: "Bus 24",
    lastSeenAt: "2026-03-19T08:14:00.000Z",
    latitude: 50.45,
    longitude: 30.52,
    manualRouteAgencyId: null,
    manualRouteExternalId: null,
    manualRouteId: "route-24",
    manualRouteLongName: "Central Station - Riverside",
    manualRouteShortName: "24",
    manualRouteUpdatedAt: "2026-03-19T07:55:00.000Z",
    operationalStatus: "active",
    positionTime: "2026-03-19T08:14:00.000Z",
    registrationPlate: "AA 1000 KT",
    routeOverrideMode: "manual",
    sourceName: "gps-http",
    transportProfileKey: "urban-bus",
    vehicleCode: "BUS-024",
    vehicleId: "vehicle-24",
    ...overrides
  };
}

function createRepository(input: {
  currentCandidate?: ScheduledTripCandidate | null;
  nextStop?: NextStopCandidate | null;
  previousCandidate?: ScheduledTripCandidate | null;
  vehicles?: ResolutionVehicleContext[];
}) {
  const upserts: RouteResolutionUpsertInput[] = [];
  const client = {
    query: vi.fn(async () => undefined),
    release: vi.fn()
  };
  const findScheduledTripCandidate = vi.fn(
    async (_routeId: string, serviceDate: string) =>
      serviceDate === "2026-03-18"
        ? input.previousCandidate ?? null
        : input.currentCandidate ?? null
  );
  const findNextStopCandidate = vi.fn(async () => input.nextStop ?? null);
  const repository = {
    connect: vi.fn(async () => client),
    findNextStopCandidate,
    findScheduledTripCandidate,
    listVehiclesForResolution: vi.fn(async () => input.vehicles ?? [createVehicle()]),
    upsertRouteResolution: vi.fn(async (_client: unknown, record: RouteResolutionUpsertInput) => {
      upserts.push(record);
    })
  } as unknown as RouteResolutionRepository;

  return {
    client,
    findNextStopCandidate,
    findScheduledTripCandidate,
    repository,
    upserts
  };
}

describe("RouteResolutionService", () => {
  it("resolves a manually assigned route to an active scheduled trip", async () => {
    const { config } = createTestRuntime("local");
    config.gtfs.timezone = "UTC";
    config.tenant.timezone = "UTC";
    const logger = createMockLogger();
    const scheduledCandidate: ScheduledTripCandidate = {
      directionId: 0,
      routeId: "route-24",
      routeLongName: "Central Station - Riverside",
      routeShortName: "24",
      routeVariantHeadsign: "Downtown",
      routeVariantId: "variant-24-a",
      serviceDate: "2026-03-19",
      startOffsetSeconds: 28800,
      tripEndOffsetSeconds: 32400,
      tripHeadsign: "Central Station",
      tripId: "trip-24-0800",
      tripShortName: "24A"
    };
    const nextStop: NextStopCandidate = {
      arrivalOffsetSeconds: 29700,
      departureOffsetSeconds: 29730,
      stopCode: "MSQ",
      stopId: "stop-market-square",
      stopName: "Market Square",
      stopSequence: 4
    };
    const { client, findNextStopCandidate, findScheduledTripCandidate, repository, upserts } = createRepository({
      currentCandidate: scheduledCandidate,
      nextStop
    });

    const service = new RouteResolutionService(config, logger as never, repository);
    const result = await service.getStatus("2026-03-19T08:15:00.000Z");

    expect(client.query).toHaveBeenCalledWith("BEGIN");
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(findScheduledTripCandidate).toHaveBeenCalled();
    expect(findNextStopCandidate).toHaveBeenCalledWith("trip-24-0800", 29700);
    expect(result.summary.scheduledActiveVehicles).toBe(1);
    expect(result.vehicles[0]?.routeState).toBe("scheduled_trip_active");
    expect(result.vehicles[0]?.trip?.id).toBe("trip-24-0800");
    expect(result.vehicles[0]?.nextStop?.stopName).toBe("Market Square");
    expect(upserts[0]).toEqual(
      expect.objectContaining({
        routeId: "route-24",
        routeState: "scheduled_trip_active",
        tripId: "trip-24-0800",
        vehicleId: "vehicle-24"
      })
    );
  });

  it("marks disabled vehicles as inactive without invoking schedule lookup", async () => {
    const { config } = createTestRuntime("local");
    config.gtfs.timezone = "UTC";
    config.tenant.timezone = "UTC";
    const logger = createMockLogger();
    const vehicle = createVehicle({
      isEnabled: false,
      operationalStatus: "inactive"
    });
    const { findScheduledTripCandidate, repository, upserts } = createRepository({
      vehicles: [vehicle]
    });

    const service = new RouteResolutionService(config, logger as never, repository);
    const result = await service.getStatus("2026-03-19T08:15:00.000Z");

    expect(findScheduledTripCandidate).not.toHaveBeenCalled();
    expect(result.summary.inactiveVehicles).toBe(1);
    expect(result.vehicles[0]?.routeState).toBe("inactive_vehicle");
    expect(upserts[0]).toEqual(
      expect.objectContaining({
        resolutionSource: "manual",
        routeId: "route-24",
        routeState: "inactive_vehicle"
      })
    );
  });

  it("uses a configured auto matcher for vehicles in automatic route mode", async () => {
    const { config } = createTestRuntime("local");
    config.gtfs.timezone = "UTC";
    config.tenant.timezone = "UTC";
    const logger = createMockLogger();
    const vehicle = createVehicle({
      manualRouteId: null,
      manualRouteLongName: null,
      manualRouteShortName: null,
      routeOverrideMode: "auto"
    });
    const { repository, upserts } = createRepository({
      vehicles: [vehicle]
    });
    const autoMatcher: RouteAutoMatcher = {
      id: "gps-trip-matcher",
      match: vi.fn(async () => ({
        directionId: 1,
        metadata: {
          confidence: 0.97
        },
        route: {
          id: "route-77",
          routeLongName: "Airport Express",
          routeShortName: "77"
        },
        routeState: "scheduled_trip_active",
        serviceDate: "2026-03-19",
        trip: {
          headsign: "Airport",
          id: "trip-77-0815",
          shortName: "77A",
          startOffsetSeconds: 29700,
          state: "active",
          tripEndOffsetSeconds: 33000,
          variantHeadsign: "Express",
          variantId: "variant-77-a"
        }
      }))
    };

    const service = new RouteResolutionService(config, logger as never, repository, [autoMatcher]);
    const result = await service.getStatus("2026-03-19T08:15:00.000Z");

    expect(autoMatcher.match).toHaveBeenCalledTimes(1);
    expect(result.vehicles[0]?.resolutionSource).toBe("gps_assisted");
    expect(result.vehicles[0]?.route?.routeShortName).toBe("77");
    expect(result.vehicles[0]?.trip?.id).toBe("trip-77-0815");
    expect(result.vehicles[0]?.resolutionMetadata).toEqual(
      expect.objectContaining({
        autoMatcherId: "gps-trip-matcher",
        confidence: 0.97,
        matchingMode: "gps_assisted_auto_match"
      })
    );
    expect(upserts[0]).toEqual(
      expect.objectContaining({
        resolutionSource: "gps_assisted",
        routeId: "route-77",
        tripId: "trip-77-0815"
      })
    );
  });
});
