import "dotenv/config";

import { buildApp } from "./app.js";
import { loadApiConfig } from "./config/env.js";

const loaded = loadApiConfig();
const app = await buildApp(loaded.config, loaded.context);

app.log.info(
  {
    configSources: loaded.sources,
    deviceProfile: loaded.config.selection.deviceProfile,
    displayProfile: loaded.config.selection.displayProfile,
    tenantProfile: loaded.config.selection.tenantProfile,
    transportProfile: loaded.config.selection.transportProfile,
    vehicleProfile: loaded.config.selection.vehicleProfile
  },
  "Loaded CMS runtime configuration"
);

try {
  await app.listen({ host: "0.0.0.0", port: loaded.config.runtime.api.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}