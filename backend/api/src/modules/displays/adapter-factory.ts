import type { CmsConfig } from "@cmsfleet/config-runtime";
import type { FastifyBaseLogger } from "fastify";

import type { DisplayHardwareAdapter } from "./hardware-adapter.js";
import { MockDisplayHardwareAdapter } from "./mock-adapter.js";

export function createDisplayHardwareAdapter(
  config: CmsConfig,
  logger: FastifyBaseLogger
): DisplayHardwareAdapter {
  return new MockDisplayHardwareAdapter(config, logger);
}
