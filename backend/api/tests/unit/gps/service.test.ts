import { describe, expect, it, vi } from "vitest";

import type { GpsOperationalEnricher } from "../../../src/modules/gps/enrichers.js";
import type { GpsRepository } from "../../../src/modules/gps/repository.js";
import { GpsIngestionService } from "../../../src/modules/gps/service.js";
import { createTestRuntime } from "../../helpers/config.js";
import { createMockLogger } from "../../helpers/logger.js";

describe("GPS ingestion service", () => {
  it("rejects payloads for unknown vehicles and records the rejection metadata", async () => {
    const { config } = createTestRuntime("local");
    const logger = createMockLogger();
    const insertRejectedMessage = vi.fn(async () => "gps-rejected-1");
    const recordSystemEvent = vi.fn(async () => undefined);
    const repository = {
      findVehicleByIdentifier: vi.fn(async () => null),
      insertRejectedMessage,
      recordSystemEvent
    } as unknown as GpsRepository;

    const service = new GpsIngestionService(config, logger as never, repository);
    const result = await service.ingestHttpPayload(
      {
        latitude: 50.4501,
        longitude: 30.5234,
        timestamp: "2026-03-19T08:00:00.000Z",
        vehicleId: "BUS-404"
      },
      {
        adapter: "http_json",
        ipAddress: "127.0.0.1",
        userAgent: "vitest"
      }
    );

    expect(result.httpStatus).toBe(422);
    expect(result.payload.status).toBe("rejected");
    expect(result.payload.message).toContain("not registered");
    expect(insertRejectedMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          ipAddress: "127.0.0.1",
          transport: "http_json",
          userAgent: "vitest"
        }),
        reason: "unknown_vehicle",
        vehicleIdentifier: "BUS-404"
      }),
      null,
      "rejected"
    );
    expect(recordSystemEvent).toHaveBeenCalledTimes(1);
  });

  it("accepts a valid payload and persists derived operational state", async () => {
    const { config } = createTestRuntime("local");
    const logger = createMockLogger();
    const client = {
      query: vi.fn(async () => undefined),
      release: vi.fn()
    };
    const upsertOperationalState = vi.fn(async () => undefined);
    const repository = {
      connect: vi.fn(async () => client),
      findVehicleByIdentifier: vi.fn(async () => ({
        externalVehicleId: null,
        id: "vehicle-100",
        isEnabled: true,
        label: "Bus 100",
        operationalStatus: "active",
        vehicleCode: "BUS-100"
      })),
      getOperationalState: vi.fn(async () => null),
      insertAcceptedMessage: vi.fn(async () => ({
        id: "gps-accepted-1",
        receivedAt: "2026-03-19T08:00:05.000Z"
      })),
      recordSystemEvent: vi.fn(async () => undefined),
      upsertOperationalState,
      upsertVehiclePosition: vi.fn(async () => true)
    } as unknown as GpsRepository;

    const service = new GpsIngestionService(config, logger as never, repository);
    const result = await service.ingestHttpPayload(
      {
        heading: 182,
        latitude: 50.4501,
        longitude: 30.5234,
        speed: 38.5,
        timestamp: "2026-03-19T08:00:00.000Z",
        vehicleId: "BUS-100"
      },
      {
        adapter: "http_json",
        ipAddress: "127.0.0.1",
        userAgent: "vitest"
      }
    );

    expect(result.httpStatus).toBe(202);
    expect(result.payload.status).toBe("accepted");
    expect(result.payload.vehicleCode).toBe("BUS-100");
    expect(result.payload.connectionState).toBe("online");
    expect(client.query).toHaveBeenCalledWith("BEGIN");
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(upsertOperationalState).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        headingDeg: 182,
        movementState: "moving",
        speedKph: 38.5,
        vehicleId: "vehicle-100"
      })
    );
  });

  it("applies configured GPS enrichers without changing the ingest contract", async () => {
    const { config } = createTestRuntime("local");
    const logger = createMockLogger();
    const client = {
      query: vi.fn(async () => undefined),
      release: vi.fn()
    };
    const upsertOperationalState = vi.fn(async () => undefined);
    const repository = {
      connect: vi.fn(async () => client),
      findVehicleByIdentifier: vi.fn(async () => ({
        externalVehicleId: null,
        id: "vehicle-200",
        isEnabled: true,
        label: "Bus 200",
        operationalStatus: "active",
        vehicleCode: "BUS-200"
      })),
      getOperationalState: vi.fn(async () => null),
      insertAcceptedMessage: vi.fn(async () => ({
        id: "gps-accepted-2",
        receivedAt: "2026-03-19T08:10:05.000Z"
      })),
      recordSystemEvent: vi.fn(async () => undefined),
      upsertOperationalState,
      upsertVehiclePosition: vi.fn(async () => true)
    } as unknown as GpsRepository;
    const enricher: GpsOperationalEnricher = {
      id: "eta-preview",
      enrich: vi.fn(async () => ({
        extensions: {
          eta: {
            nextStopEtaSeconds: 135
          }
        },
        processingMetadata: {
          etaStatus: "estimated"
        }
      }))
    };

    const service = new GpsIngestionService(config, logger as never, repository, [enricher]);
    await service.ingestHttpPayload(
      {
        heading: 90,
        latitude: 50.4501,
        longitude: 30.5234,
        speed: 21,
        timestamp: "2026-03-19T08:10:00.000Z",
        vehicleId: "BUS-200"
      },
      {
        adapter: "http_json",
        ipAddress: "127.0.0.1",
        userAgent: "vitest"
      }
    );

    expect(enricher.enrich).toHaveBeenCalledTimes(1);
    expect(upsertOperationalState).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        extensions: expect.objectContaining({
          eta: {
            nextStopEtaSeconds: 135
          }
        }),
        processingMetadata: expect.objectContaining({
          appliedEnrichers: ["eta-preview"],
          etaStatus: "estimated"
        })
      })
    );
  });
});
