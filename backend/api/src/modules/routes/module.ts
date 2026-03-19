import type { CmsConfig } from "@cmsfleet/config-runtime";
import type { FastifyInstance } from "fastify";

import { RouteResolutionRepository } from "./repository.js";
import { RouteResolutionService } from "./service.js";

export async function registerRoutesModule(app: FastifyInstance, config: CmsConfig): Promise<void> {
  const repository = new RouteResolutionRepository(app.db);
  const service = new RouteResolutionService(config, app.log, repository);

  app.get("/api/admin/routes/status", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "dispatch:manage");

    if (!authUser) {
      return;
    }

    const query = request.query as { at?: string } | undefined;
    const referenceTime = query?.at && !Number.isNaN(Date.parse(query.at)) ? new Date(query.at).toISOString() : undefined;

    return service.getStatus(referenceTime);
  });
}
