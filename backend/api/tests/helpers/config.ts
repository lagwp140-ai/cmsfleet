import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCmsConfig, type AppEnvironment, type CmsConfig, type ConfigRuntimeContext } from "@cmsfleet/config-runtime";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");

export function createTestRuntime(environment: AppEnvironment = "local"): {
  config: CmsConfig;
  context: ConfigRuntimeContext;
  repoRoot: string;
} {
  const loaded = loadCmsConfig({
    cwd: repoRoot,
    rawEnv: {
      APP_ENV: environment,
      CMS_AUTH_CSRF_SECRET: "test-csrf-secret-1234567890-abcdefghijklmnopqrstuvwxyz",
      CMS_AUTH_SESSION_SECRET: "test-session-secret-1234567890-abcdefghijklmnopqrstuvwxyz",
      CMS_CONFIG_ENV: environment,
      CMS_CORS_ORIGINS: "http://localhost:5173",
      CMS_DATABASE_URL: "postgres://cmsfleet_test:TestDatabasePass2026@127.0.0.1:5434/cmsfleet_test",
      NODE_ENV: "test",
      SERVICE_NAME: "cmsfleet-test-suite"
    }
  });

  return {
    config: structuredClone(loaded.config),
    context: { ...loaded.context },
    repoRoot
  };
}

export function getGtfsFixtureDirectory(name = "minimal"): string {
  return resolve(repoRoot, "backend/api/tests/fixtures/gtfs", name);
}
