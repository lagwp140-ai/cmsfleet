import type { CmsConfig } from "@cmsfleet/config-runtime";
import type { FastifyInstance } from "fastify";

import { computeFreshnessSeconds } from "./service.js";
import { GpsRepository } from "./repository.js";
import { GpsIngestionService } from "./service.js";

export async function registerGpsModule(app: FastifyInstance, config: CmsConfig): Promise<void> {
  const repository = new GpsRepository(app.db);
  const service = new GpsIngestionService(config, app.log, repository);

  app.observability.registerComponentProvider("gps_ingestion", async () => {
    const status = await service.listVehicleStatuses();
    const latestMessage = (await service.listRecentMessages(1))[0] ?? null;
    const hasOperationalRisk = status.summary.offlineVehicles > 0 || status.summary.staleVehicles > 0;
    const hasAnyMessages = latestMessage !== null;

    return {
      details: {
        latestIngestStatus: latestMessage?.ingestStatus ?? null,
        latestReceivedAt: latestMessage?.receivedAt ?? null,
        sourceName: config.gps.provider
      },
      kind: "pipeline",
      message: !hasAnyMessages
        ? "No GPS payloads have been ingested yet."
        : hasOperationalRisk
          ? "GPS ingestion is running but some vehicles are stale or offline."
          : "GPS ingestion pipeline is healthy.",
      metrics: {
        gps_offline_vehicles: status.summary.offlineVehicles,
        gps_online_vehicles: status.summary.onlineVehicles,
        gps_stale_vehicles: status.summary.staleVehicles,
        gps_stopped_vehicles: status.summary.stoppedVehicles,
        gps_tracked_vehicles: status.summary.trackedVehicles,
        gps_unknown_vehicles: status.summary.unknownVehicles,
        gps_seconds_since_last_message: latestMessage ? computeFreshnessSeconds(latestMessage.receivedAt) : -1
      },
      readiness: true,
      status: !hasAnyMessages ? "warn" : hasOperationalRisk ? "warn" : "pass"
    };
  });

  app.post("/api/ingest/gps/http", async (request, reply) => {
    try {
      const result = await service.ingestHttpPayload(request.body, {
        adapter: "http_json",
        ipAddress: request.ip,
        userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : undefined
      });

      app.observability.incrementCounter(`gps_ingest_${result.payload.status}_total`);
      return reply.code(result.httpStatus).send(result.payload);
    } catch (error) {
      app.observability.incrementCounter("gps_ingest_failures_total");
      app.log.error({ err: error }, "Unhandled GPS ingestion failure");
      return reply.code(500).send({ message: "Failed to ingest GPS payload." });
    }
  });

  app.get("/api/admin/gps/status", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "fleet:read");

    if (!authUser) {
      return;
    }

    const status = await service.listVehicleStatuses();

    return {
      freshnessThresholdSeconds: config.gps.freshnessThresholdSeconds,
      movementThresholdKph: config.gps.movementThresholdKph,
      offlineThresholdSeconds: config.gps.offlineThresholdSeconds,
      sourceName: config.gps.provider,
      summary: status.summary,
      vehicles: status.vehicles
    };
  });

  app.get("/api/admin/gps/messages", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "fleet:read");

    if (!authUser) {
      return;
    }

    const limit = readLimit(request.query);
    const filters = readMessageFilters(request.query);

    return {
      messages: await service.listRecentMessages(limit, filters)
    };
  });
}

function readMessageFilters(query: unknown): { ingestStatus?: "accepted" | "duplicate" | "rejected"; search?: string } {
  if (!isPlainObject(query)) {
    return {};
  }

  const ingestStatus = query.ingestStatus === "accepted" || query.ingestStatus === "duplicate" || query.ingestStatus === "rejected"
    ? query.ingestStatus
    : undefined;
  const search = typeof query.search === "string" && query.search.trim() !== "" ? query.search.trim() : undefined;

  return { ingestStatus, search };
}
function readLimit(query: unknown): number {
  if (!isPlainObject(query)) {
    return 25;
  }

  const parsed = Number(query.limit);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 25;
  }

  return Math.min(parsed, 100);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
