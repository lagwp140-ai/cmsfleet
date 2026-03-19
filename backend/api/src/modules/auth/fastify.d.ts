import type { Pool } from "pg";

import type { FastifyReply, FastifyRequest } from "fastify";

import type { SessionUser } from "./types.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticateRequest: (
      request: FastifyRequest,
      reply: FastifyReply,
      options?: { optional?: boolean }
    ) => Promise<SessionUser | undefined>;
    db: Pool;
    requirePermission: (
      request: FastifyRequest,
      reply: FastifyReply,
      permission: string
    ) => Promise<SessionUser | undefined>;
  }

  interface FastifyRequest {
    authUser?: SessionUser;
    authTokenHash?: string;
  }
}
