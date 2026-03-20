import type { FastifyInstance } from "fastify";

import type { CmsConfig, ConfigRuntimeContext } from "@cmsfleet/config-runtime";

import {
  createErrorEnvelope,
  createSuccessEnvelope,
  extractErrorLike,
  isApiEnvelope,
  isRawResponse
} from "./contracts.js";
import { normalizeApiError } from "./errors.js";
import { createOpenApiDocument, renderApiDocsHtml } from "./openapi.js";

export function registerApiInfrastructure(
  app: FastifyInstance,
  config: CmsConfig,
  context: ConfigRuntimeContext
): void {
  app.addHook("preSerialization", async (request, reply, payload) => {
    if (isRawResponse(request, reply, payload) || isApiEnvelope(payload)) {
      return payload;
    }

    if (reply.statusCode >= 400) {
      return createErrorEnvelope(request, extractErrorLike(request, payload, reply.statusCode));
    }

    return createSuccessEnvelope(request, payload, reply.statusCode);
  });

  app.setErrorHandler((error, request, reply) => {
    const normalizedError = normalizeApiError(error);

    if (normalizedError.statusCode >= 500) {
      request.log.error({ err: error }, "Unhandled API error");
    }

    reply.status(normalizedError.statusCode).send(createErrorEnvelope(request, normalizedError));
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(
      createErrorEnvelope(request, {
        code: "not_found",
        message: `Route ${request.method} ${request.url} was not found.`,
        statusCode: 404
      })
    );
  });

  const openApiDocument = createOpenApiDocument(config, context);

  app.get("/api/openapi.json", { config: { rawResponse: true } }, async () => openApiDocument);
  app.get("/api/docs", { config: { rawResponse: true } }, async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return renderApiDocsHtml();
  });
}
