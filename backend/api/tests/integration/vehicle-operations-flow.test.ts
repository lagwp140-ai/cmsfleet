import { describe, expect, it, vi } from "vitest";

import { buildDisplayPanelCommands } from "../../src/modules/displays/command-generator.js";
import type { RouteResolutionRepository } from "../../src/modules/routes/repository.js";
import { RouteResolutionService } from "../../src/modules/routes/service.js";
import type {
  NextStopCandidate,
  ResolutionVehicleContext,
  RouteResolutionUpsertInput,
  ScheduledTripCandidate
} from "../../src/modules/routes/types.js";
import { createTestRuntime } from "../helpers/config.js";
import { createMockLogger } from "../helpers/logger.js";

function createVehicle(): ResolutionVehicleContext {
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
    vehicleId: "vehicle-24"
  };
}

describe("vehicle operations flow", () => {
  it("resolves a route and turns it into dispatch-ready display commands", async () => {
    const { config } = createTestRuntime("local");
    config.gtfs.timezone = "UTC";
    config.tenant.timezone = "UTC";
    const logger = createMockLogger();
    const upserts: RouteResolutionUpsertInput[] = [];
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
    const repository = {
      connect: vi.fn(async () => ({
        query: vi.fn(async () => undefined),
        release: vi.fn()
      })),
      findNextStopCandidate: vi.fn(async () => nextStop),
      findScheduledTripCandidate: vi.fn(async (_routeId: string, serviceDate: string) =>
        serviceDate === "2026-03-19" ? scheduledCandidate : null
      ),
      listVehiclesForResolution: vi.fn(async () => [createVehicle()]),
      upsertRouteResolution: vi.fn(async (_client: unknown, record: RouteResolutionUpsertInput) => {
        upserts.push(record);
      })
    } as unknown as RouteResolutionRepository;

    const routeService = new RouteResolutionService(config, logger as never, repository);
    const status = await routeService.getStatus("2026-03-19T08:15:00.000Z");
    const vehicle = status.vehicles[0]!;
    const commands = buildDisplayPanelCommands({
      alternatingMessages: [],
      config: config.ledDisplay,
      context: {
        destination: vehicle.trip?.headsign ?? vehicle.route?.routeLongName ?? "Depot",
        emergencyMessage: "Evacuate vehicle",
        headsign: vehicle.trip?.headsign ?? "",
        nextStop: vehicle.nextStop?.stopName ?? "Unknown stop",
        publicNote: "Integration preview",
        routeLongName: vehicle.route?.routeLongName ?? "",
        routeShortName: vehicle.route?.routeShortName ?? "",
        serviceMessage: "Board via front door",
        source: "live_vehicle",
        via: vehicle.trip?.variantHeadsign ?? ""
      },
      includeInterior: false,
      stopAnnouncement: vehicle.nextStop?.stopName ?? null,
      systemStatus: "normal",
      testPatternLabel: null
    });

    expect(status.summary.scheduledActiveVehicles).toBe(1);
    expect(vehicle.routeState).toBe("scheduled_trip_active");
    expect(upserts).toHaveLength(1);
    expect(commands[0]?.previewText).toBe("24 Central Station");
    expect(commands[1]?.previewText).toBe("Central Station via Downtown");
    expect(commands[2]?.previewText).toBe("24");
  });
});