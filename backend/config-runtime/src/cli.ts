import "dotenv/config";

import { loadCmsConfig } from "./index.js";

const loaded = loadCmsConfig();

console.info(
  JSON.stringify(
    {
      configDirectory: loaded.context.configDirectory,
      environment: loaded.config.selection.environment,
      selection: loaded.config.selection,
      sources: loaded.sources
    },
    null,
    2
  )
);