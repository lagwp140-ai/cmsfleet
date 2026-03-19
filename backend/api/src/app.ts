import cors from "@fastify/cors";
import Fastify from "fastify";
import { Pool } from "pg";

import type { CmsConfig, ConfigRuntimeContext } from "@cmsfleet/config-runtime";

import { registerAuthModule } from "./modules/auth/module.js";
import { registerGpsModule } from "./modules/gps/module.js";
import { registerVehiclesModule } from "./modules/vehicles/module.js";

export async function buildApp(config: CmsConfig, context: ConfigRuntimeContext) {
  const app = Fastify({
    logger: {
      level: config.runtime.observability.logLevel
    }
  });
  const db = new Pool({
    connectionString: config.runtime.database.url
  });

  db.on("error", (error) => {
    app.log.error({ err: error }, "PostgreSQL pool error");
  });

  app.decorate("db", db);

  app.addHook("onClose", async () => {
    await db.end();
  });

  await app.register(cors, {
    credentials: true,
    origin: config.runtime.api.corsOrigins
  });

  await registerAuthModule(app, config, context);
  await registerVehiclesModule(app, config, context);
  await registerGpsModule(app, config);

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
