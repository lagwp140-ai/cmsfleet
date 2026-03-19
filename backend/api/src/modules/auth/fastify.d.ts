import type { SessionUser } from "./types.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: SessionUser;
    authTokenHash?: string;
  }
}