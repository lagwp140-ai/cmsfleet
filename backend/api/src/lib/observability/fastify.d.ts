import type { FastifyRequest } from "fastify";

import type { ObservabilityRegistry } from "./service.js";

declare module "fastify" {
  interface FastifyInstance {
    observability: ObservabilityRegistry;
  }

  interface FastifyRequest {
    observabilityStartMs?: number;
  }
}
