import type { CmsConfig, ConfigRuntimeContext } from "@cmsfleet/config-runtime";
import type { FastifyInstance, FastifyReply } from "fastify";

import type { ConfigScopeType } from "./types.js";
import { ConfigRepository } from "./repository.js";
import { ConfigManagementService, readConfigScopeType } from "./service.js";

export async function registerConfigModule(
  app: FastifyInstance,
  config: CmsConfig,
  context: ConfigRuntimeContext
): Promise<void> {
  const repository = new ConfigRepository(app.db);
  const service = new ConfigManagementService(config, context, repository);

  app.get("/api/admin/config/overview", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "admin:access");

    if (!authUser) {
      return;
    }

    try {
      return await service.getOverview();
    } catch (error) {
      return sendConfigError(reply, error, "Unable to load configuration overview.");
    }
  });

  app.get("/api/admin/config/scopes/:scopeType/:scopeKey", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "admin:access");

    if (!authUser) {
      return;
    }

    const params = readScopeParams(request.params);

    if (!params) {
      return reply.code(400).send({ message: "scopeType and scopeKey are required." });
    }

    try {
      return await service.getScope(params.scopeType, params.scopeKey);
    } catch (error) {
      return sendConfigError(reply, error, "Unable to load configuration scope.");
    }
  });

  app.post("/api/admin/config/scopes/:scopeType/:scopeKey/validate", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "users:manage");

    if (!authUser) {
      return;
    }

    const params = readScopeParams(request.params);

    if (!params) {
      return reply.code(400).send({ message: "scopeType and scopeKey are required." });
    }

    let body: { payload: Record<string, unknown> };

    try {
      body = readPayloadBody(request.body);
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Invalid configuration payload." });
    }

    try {
      return await service.validateScopePayload(params.scopeType, params.scopeKey, body.payload);
    } catch (error) {
      return sendConfigError(reply, error, "Unable to validate configuration changes.");
    }
  });

  app.post("/api/admin/config/scopes/:scopeType/:scopeKey/apply", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "users:manage");

    if (!authUser) {
      return;
    }

    const params = readScopeParams(request.params);

    if (!params) {
      return reply.code(400).send({ message: "scopeType and scopeKey are required." });
    }

    let body: { changeSummary?: string; payload: Record<string, unknown> };

    try {
      body = readApplyBody(request.body);
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Invalid configuration payload." });
    }

    try {
      return await service.applyScopePayload({
        changeSummary: body.changeSummary,
        payload: body.payload,
        scopeKey: params.scopeKey,
        scopeType: params.scopeType
      });
    } catch (error) {
      return sendConfigError(reply, error, "Unable to apply configuration changes.");
    }
  });

  app.get("/api/admin/config/scopes/:scopeType/:scopeKey/diff", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "admin:access");

    if (!authUser) {
      return;
    }

    const params = readScopeParams(request.params);

    if (!params) {
      return reply.code(400).send({ message: "scopeType and scopeKey are required." });
    }

    const query = isPlainObject(request.query) ? request.query : {};
    const fromVersionId = typeof query.fromVersionId === "string" ? query.fromVersionId : "";
    const toVersionId = typeof query.toVersionId === "string" && query.toVersionId.trim() !== "" ? query.toVersionId : undefined;

    if (fromVersionId.trim() === "") {
      return reply.code(400).send({ message: "fromVersionId is required." });
    }

    try {
      return await service.getVersionDiff(params.scopeType, params.scopeKey, fromVersionId, toVersionId);
    } catch (error) {
      return sendConfigError(reply, error, "Unable to compare configuration versions.");
    }
  });

  app.post("/api/admin/config/scopes/:scopeType/:scopeKey/rollback", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "users:manage");

    if (!authUser) {
      return;
    }

    const params = readScopeParams(request.params);

    if (!params) {
      return reply.code(400).send({ message: "scopeType and scopeKey are required." });
    }

    let body: { changeSummary?: string; versionId: string };

    try {
      body = readRollbackBody(request.body);
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Invalid rollback payload." });
    }

    try {
      return await service.rollbackScope({
        changeSummary: body.changeSummary,
        scopeKey: params.scopeKey,
        scopeType: params.scopeType,
        versionId: body.versionId
      });
    } catch (error) {
      return sendConfigError(reply, error, "Unable to roll back configuration scope.");
    }
  });
}

function readApplyBody(body: unknown): { changeSummary?: string; payload: Record<string, unknown> } {
  if (!isPlainObject(body) || !isPlainObject(body.payload)) {
    throw new Error("Configuration apply body must include a payload object.");
  }

  return {
    changeSummary: typeof body.changeSummary === "string" ? body.changeSummary : undefined,
    payload: body.payload
  };
}

function readPayloadBody(body: unknown): { payload: Record<string, unknown> } {
  if (!isPlainObject(body) || !isPlainObject(body.payload)) {
    throw new Error("Configuration validation body must include a payload object.");
  }

  return {
    payload: body.payload
  };
}

function readRollbackBody(body: unknown): { changeSummary?: string; versionId: string } {
  if (!isPlainObject(body)) {
    throw new Error("Rollback body must be an object.");
  }

  const versionId = typeof body.versionId === "string" ? body.versionId.trim() : "";

  if (versionId === "") {
    throw new Error("versionId is required.");
  }

  return {
    changeSummary: typeof body.changeSummary === "string" ? body.changeSummary : undefined,
    versionId
  };
}

function readScopeParams(params: unknown): { scopeKey: string; scopeType: ConfigScopeType } | null {
  if (!isPlainObject(params)) {
    return null;
  }

  const scopeType = readConfigScopeType(params.scopeType);
  const scopeKey = typeof params.scopeKey === "string" ? params.scopeKey.trim() : "";

  if (!scopeType || scopeKey === "") {
    return null;
  }

  return { scopeKey, scopeType };
}

function sendConfigError(reply: FastifyReply, error: unknown, fallbackMessage: string) {
  const details =
    typeof error === "object" && error !== null && "details" in error && Array.isArray((error as { details?: unknown }).details)
      ? ((error as { details?: string[] }).details ?? [])
      : undefined;
  const message = error instanceof Error ? error.message : fallbackMessage;

  if (message.includes("failed validation") || message.includes("runtime policy checks")) {
    return reply.code(400).send({ details, message });
  }

  if (message.includes("not found") || message.includes("active deployment selection")) {
    return reply.code(404).send({ message });
  }

  reply.log.error({ err: error }, fallbackMessage);
  return reply.code(500).send({ message: fallbackMessage });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}