import "dotenv/config";

import { loadCmsConfig } from "@cmsfleet/config-runtime";

const loaded = loadCmsConfig();

console.info(
  JSON.stringify({
    configSources: loaded.sources,
    environment: loaded.config.selection.environment,
    gpsProvider: loaded.config.gps.provider,
    intervalMs: loaded.config.runtime.worker.pollIntervalMs,
    message: "integration worker placeholder started",
    service: loaded.context.serviceName,
    tenant: loaded.config.tenant.id,
    transportProfile: loaded.config.selection.transportProfile,
    vehicleProfile: loaded.config.selection.vehicleProfile
  })
);