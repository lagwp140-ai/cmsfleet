import type { CmsConfig } from "@cmsfleet/config-runtime";
import type { FastifyInstance, FastifyReply } from "fastify";

import { GtfsRepository } from "./repository.js";
import { GtfsService } from "./service.js";

export async function registerGtfsModule(app: FastifyInstance, config: CmsConfig): Promise<void> {
  const repository = new GtfsRepository(app.db);
  const service = new GtfsService(config, app.log, repository);

  app.get("/api/admin/gtfs/overview", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "dispatch:manage");

    if (!authUser) {
      return;
    }

    try {
      return await service.getOverview(readLimit(request.query));
    } catch (error) {
      return sendGtfsError(reply, error, "Unable to load GTFS import overview.");
    }
  });

  app.get("/api/admin/gtfs/logs", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "dispatch:manage");

    if (!authUser) {
      return;
    }

    try {
      return {
        jobs: await service.getLogs(readLimit(request.query), readLogFilters(request.query))
      };
    } catch (error) {
      return sendGtfsError(reply, error, "Unable to load GTFS import logs.");
    }
  });
  app.get("/api/admin/gtfs/imports/:jobId/errors", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "dispatch:manage");

    if (!authUser) {
      return;
    }

    const params = request.params as { jobId?: string };

    if (!params.jobId) {
      return reply.code(400).send({ message: "jobId is required." });
    }

    try {
      return {
        errors: await service.getErrors(params.jobId, readLimit(request.query))
      };
    } catch (error) {
      return sendGtfsError(reply, error, "Unable to load GTFS validation errors.");
    }
  });

  app.post("/api/admin/gtfs/imports/from-path", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "dispatch:manage");

    if (!authUser) {
      return;
    }

    let body: { activateOnSuccess: boolean; datasetLabel?: string; filePath: string };

    try {
      body = readPathImportBody(request.body);
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Invalid GTFS import request." });
    }

    try {
      return await service.importFromLocalPath(body, authUser.id);
    } catch (error) {
      return sendGtfsError(reply, error, "Unable to import GTFS package from the provided path.");
    }
  });

  app.post("/api/admin/gtfs/imports/upload", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "dispatch:manage");

    if (!authUser) {
      return;
    }

    let body: { activateOnSuccess: boolean; datasetLabel?: string; fileName: string; zipBase64: string };

    try {
      body = readUploadImportBody(request.body);
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Invalid GTFS upload request." });
    }

    try {
      return await service.importFromUpload(body, authUser.id);
    } catch (error) {
      return sendGtfsError(reply, error, "Unable to import uploaded GTFS package.");
    }
  });

  app.post("/api/admin/gtfs/datasets/:datasetId/activate", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "dispatch:manage");

    if (!authUser) {
      return;
    }

    const params = request.params as { datasetId?: string };

    if (!params.datasetId) {
      return reply.code(400).send({ message: "datasetId is required." });
    }

    try {
      await service.activateDataset(params.datasetId, authUser.id);
      return reply.code(204).send();
    } catch (error) {
      return sendGtfsError(reply, error, "Unable to activate GTFS dataset.");
    }
  });

  app.post("/api/admin/gtfs/datasets/:datasetId/rollback", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "dispatch:manage");

    if (!authUser) {
      return;
    }

    const params = request.params as { datasetId?: string };

    if (!params.datasetId) {
      return reply.code(400).send({ message: "datasetId is required." });
    }

    try {
      await service.rollbackDataset(params.datasetId, authUser.id);
      return reply.code(204).send();
    } catch (error) {
      return sendGtfsError(reply, error, "Unable to roll back GTFS dataset.");
    }
  });
}

function readLogFilters(query: unknown): { search?: string; status?: "queued" | "running" | "succeeded" | "failed" | "cancelled" } {
  if (!isPlainObject(query)) {
    return {};
  }

  const status = query.status === "queued"
    || query.status === "running"
    || query.status === "succeeded"
    || query.status === "failed"
    || query.status === "cancelled"
    ? query.status
    : undefined;
  const search = typeof query.search === "string" && query.search.trim() !== "" ? query.search.trim() : undefined;

  return { search, status };
}
function readLimit(query: unknown): number {
  if (!isPlainObject(query)) {
    return 25;
  }

  const parsed = Number(query.limit);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 25;
  }

  return Math.min(parsed, 200);
}

function readPathImportBody(body: unknown): { activateOnSuccess: boolean; datasetLabel?: string; filePath: string } {
  if (!isPlainObject(body)) {
    throw new Error("GTFS path import body must be an object.");
  }

  const filePath = typeof body.filePath === "string" ? body.filePath.trim() : "";

  if (filePath === "") {
    throw new Error("filePath is required.");
  }

  return {
    activateOnSuccess: Boolean(body.activateOnSuccess),
    datasetLabel: typeof body.datasetLabel === "string" ? body.datasetLabel : undefined,
    filePath
  };
}

function readUploadImportBody(body: unknown): { activateOnSuccess: boolean; datasetLabel?: string; fileName: string; zipBase64: string } {
  if (!isPlainObject(body)) {
    throw new Error("GTFS upload body must be an object.");
  }

  const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
  const zipBase64 = typeof body.zipBase64 === "string" ? body.zipBase64.trim() : "";

  if (fileName === "" || zipBase64 === "") {
    throw new Error("fileName and zipBase64 are required.");
  }

  return {
    activateOnSuccess: Boolean(body.activateOnSuccess),
    datasetLabel: typeof body.datasetLabel === "string" ? body.datasetLabel : undefined,
    fileName,
    zipBase64
  };
}

function sendGtfsError(reply: FastifyReply, error: unknown, fallbackMessage: string) {
  const errorCode = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = error instanceof Error ? error.message : fallbackMessage;

  if (message === "GTFS dataset not found.") {
    return reply.code(404).send({ message });
  }

  if (
    errorCode === "ENOENT" ||
    errorCode === "ENOTDIR" ||
    errorCode === "EACCES" ||
    message.includes("GTFS import source must") ||
    message.includes("Required GTFS file missing") ||
    message.includes("Failed to extract") ||
    message.includes("must include columns")
  ) {
    return reply.code(400).send({ message });
  }

  reply.log.error({ err: error }, fallbackMessage);
  return reply.code(500).send({ message: fallbackMessage });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}


