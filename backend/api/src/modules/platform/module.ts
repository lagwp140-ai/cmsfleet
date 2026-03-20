import type { CmsConfig } from "@cmsfleet/config-runtime";
import type { FastifyInstance } from "fastify";

import { PlatformArchitectureService } from "./service.js";

export async function registerPlatformModule(app: FastifyInstance, config: CmsConfig): Promise<void> {
  const service = new PlatformArchitectureService(config);

  app.get("/api/admin/platform/extensions", async (request, reply) => {
    const authUser = await app.requirePermission(request, reply, "admin:access");

    if (!authUser) {
      return;
    }

    return service.getExtensionCatalog();
  });
}
