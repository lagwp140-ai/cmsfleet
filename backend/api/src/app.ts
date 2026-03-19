import cors from "@fastify/cors";
import Fastify from "fastify";

import type { CmsConfig, ConfigRuntimeContext } from "@cmsfleet/config-runtime";

import { registerAuthModule } from "./modules/auth/module.js";

export async function buildApp(config: CmsConfig, context: ConfigRuntimeContext) {
  const app = Fastify({
    logger: {
      level: config.runtime.observability.logLevel
    }
  });

  await app.register(cors, {
    credentials: true,
    origin: config.runtime.api.corsOrigins
  });

  await registerAuthModule(app, config, context);

  app.get("/health", async () => ({
    environment: config.selection.environment,
    operator: config.branding.operatorName,
    service: context.serviceName,
    status: "ok",
    tenant: config.tenant.id,
    transportProfile: config.selection.transportProfile,
    vehicleProfile: config.selection.vehicleProfile
  }));

  return app;
}