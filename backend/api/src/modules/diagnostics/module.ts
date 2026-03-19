import type { FastifyInstance } from "fastify";

import { DiagnosticsRepository } from "./repository.js";
import type { SystemEventFilters, SystemEventSeverity } from "./types.js";

const SYSTEM_EVENT_SEVERITIES: SystemEventSeverity[] = ["debug", "info", "warn", "error", "critical"];

export async function registerDiagnosticsModule(app: FastifyInstance): Promise<void> {
  const repository = new DiagnosticsRepository(app.db);

  app.get("/api/admin/system-events", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "admin:access");

    if (!authUser) {
      return;
    }

    const filters = readSystemEventFilters(request.query);

    return {
      events: await repository.listSystemEvents(filters)
    };
  });
}

function readSystemEventFilters(query: unknown): SystemEventFilters {
  const value = isPlainObject(query) ? query : {};
  const severity = typeof value.severity === "string" && SYSTEM_EVENT_SEVERITIES.includes(value.severity as SystemEventSeverity)
    ? value.severity as SystemEventSeverity
    : undefined;

  return {
    component: readOptionalString(value.component),
    limit: readLimit(value.limit),
    relatedEntityType: readOptionalString(value.relatedEntityType),
    search: readOptionalString(value.search),
    severity,
    source: readOptionalString(value.source)
  };
}

function readLimit(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(parsed, 200);
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
