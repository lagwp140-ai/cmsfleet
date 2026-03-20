import Fastify from "fastify";

import { registerApiInfrastructure } from "../../src/lib/api/runtime.js";
import { registerAuthModule } from "../../src/modules/auth/module.js";
import { InMemoryAuthStore } from "../../src/modules/auth/store.js";
import { createTestRuntime } from "./config.js";

export async function createAuthApiTestApp() {
  const { config, context } = createTestRuntime("local");
  const app = Fastify({ logger: false });
  const store = new InMemoryAuthStore([]);

  registerApiInfrastructure(app, config, context);
  await registerAuthModule(app, config, context, { store });
  await app.ready();

  return {
    app,
    config,
    context,
    store
  };
}
