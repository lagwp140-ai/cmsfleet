import type { CmsConfig } from "@cmsfleet/config-runtime";
import type { FastifyInstance, FastifyReply } from "fastify";

import { createDisplayHardwareAdapter } from "./adapter-factory.js";
import { DisplayDeliveryService } from "./delivery-service.js";
import { DisplayRepository } from "./repository.js";
import { DisplayDomainService } from "./service.js";
import type {
  DisplayCommandRequest,
  DisplayPreviewRequest,
  DisplayPublishResponse
} from "./types.js";

export async function registerDisplaysModule(app: FastifyInstance, config: CmsConfig): Promise<void> {
  const repository = new DisplayRepository(app.db);
  const service = new DisplayDomainService(config, repository);
  const adapter = createDisplayHardwareAdapter(config, app.log);
  const deliveryService = new DisplayDeliveryService(adapter, app.log, app.observability);

  app.observability.registerComponentProvider("display_adapter", async () => {
    const overview = await deliveryService.getQueueOverview();
    const adapterState = overview.adapter.state;
    const status = adapterState === "unhealthy"
      ? "fail"
      : adapterState === "degraded" || overview.retryDepth > 0 || overview.totals.failed > 0
        ? "warn"
        : "pass";

    return {
      details: {
        activeDeliveryId: overview.activeDeliveryId,
        adapterId: overview.adapter.adapterId,
        adapterMessage: overview.adapter.message,
        lastSuccessfulDeliveryAt: overview.adapter.lastSuccessfulDeliveryAt,
        queueDepth: overview.queueDepth,
        retryDepth: overview.retryDepth
      },
      kind: "adapter",
      message: status === "pass"
        ? "Display adapter and delivery queue are healthy."
        : status === "warn"
          ? "Display adapter is operating with retries or recent delivery failures."
          : "Display adapter is unhealthy.",
      metrics: {
        display_adapter_failed_deliveries: overview.totals.failed,
        display_adapter_pending_deliveries: overview.totals.pending,
        display_adapter_queue_depth: overview.queueDepth,
        display_adapter_retry_depth: overview.retryDepth,
        display_adapter_successful_deliveries: overview.totals.delivered
      },
      readiness: true,
      status
    };
  });

  app.addHook("onClose", async () => {
    await deliveryService.close();
  });

  app.get("/api/admin/displays/domain", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "content:manage");

    if (!authUser) {
      return;
    }

    return service.getDomainModel();
  });

  app.get("/api/admin/displays/adapter-status", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "content:manage");

    if (!authUser) {
      return;
    }

    return deliveryService.getQueueOverview();
  });

  app.get("/api/admin/displays/deliveries", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "content:manage");

    if (!authUser) {
      return;
    }

    const query = (request as { query?: Record<string, unknown> }).query ?? {};
    const limit = readLimit(query.limit);
    const filters = readDeliveryFilters(query);
    return deliveryService.listDeliveries(limit, filters);
  });

  app.post("/api/admin/displays/commands", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "content:manage");

    if (!authUser) {
      return;
    }

    if (!isPlainObject(request.body)) {
      return reply.code(400).send({ message: "Display command payload must be a JSON object." });
    }

    try {
      return await service.generateCommands(request.body as DisplayCommandRequest);
    } catch (error) {
      return sendDisplayError(app, reply, error);
    }
  });

  app.post("/api/admin/displays/publish", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "content:manage");

    if (!authUser) {
      return;
    }

    if (!isPlainObject(request.body)) {
      return reply.code(400).send({ message: "Display publish payload must be a JSON object." });
    }

    try {
      const command = await service.generateCommands(request.body as DisplayCommandRequest);
      const delivery = await deliveryService.enqueue(command, authUser.id);
      const response: DisplayPublishResponse = {
        command,
        delivery,
        queue: await deliveryService.getQueueOverview()
      };
      return response;
    } catch (error) {
      return sendDisplayError(app, reply, error);
    }
  });

  app.post("/api/admin/displays/preview", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "content:manage");

    if (!authUser) {
      return;
    }

    const body = request.body as DisplayPreviewRequest | undefined;

    if (!body || typeof body.mode !== "string") {
      return reply.code(400).send({ message: "Display preview payload must include a mode." });
    }

    return service.preview(body);
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDeliveryFilters(query: Record<string, unknown>): { search?: string; status?: "queued" | "processing" | "retry_waiting" | "delivered" | "failed" } {
  const status = query.status === "queued"
    || query.status === "processing"
    || query.status === "retry_waiting"
    || query.status === "delivered"
    || query.status === "failed"
    ? query.status
    : undefined;
  const search = typeof query.search === "string" && query.search.trim() !== "" ? query.search.trim() : undefined;

  return { search, status };
}
function readLimit(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 25;
  }

  return Math.min(Math.trunc(parsed), 100);
}

function sendDisplayError(app: FastifyInstance, reply: FastifyReply, error: unknown) {
  app.observability.incrementCounter("display_operation_failures_total");

  if (error instanceof Error && error.message.includes("was not found")) {
    return reply.code(404).send({ message: error.message });
  }

  throw error;
}
