import type { CmsConfig } from "@cmsfleet/config-runtime";
import type { FastifyInstance } from "fastify";

import { GpsRepository } from "./repository.js";
import { GpsIngestionService } from "./service.js";

export async function registerGpsModule(app: FastifyInstance, config: CmsConfig): Promise<void> {
  const repository = new GpsRepository(app.db);
  const service = new GpsIngestionService(config, app.log, repository);

  app.post("/api/ingest/gps/http", async (request, reply) => {
    try {
      const result = await service.ingestHttpPayload(request.body, {
        adapter: "http_json",
        ipAddress: request.ip,
        userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : undefined
      });

      return reply.code(result.httpStatus).send(result.payload);
    } catch (error) {
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

    return {
      messages: await service.listRecentMessages(limit)
    };
  });
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
