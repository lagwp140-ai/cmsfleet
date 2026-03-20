import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readLoaderEnvironment } from "../src/env.js";
import { CmsConfigValidationError, loadCmsConfig } from "../src/loader.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const baseEnv: NodeJS.ProcessEnv = {
  APP_ENV: "test",
  CMS_AUTH_CSRF_SECRET: "test-csrf-secret-1234567890-abcdefghijklmnopqrstuvwxyz",
  CMS_AUTH_SESSION_SECRET: "test-session-secret-1234567890-abcdefghijklmnopqrstuvwxyz",
  CMS_CONFIG_ENV: "test",
  CMS_CORS_ORIGINS: "http://localhost:5173",
  CMS_DATABASE_URL: "postgres://cmsfleet_test:TestDatabasePass2026@127.0.0.1:5434/cmsfleet_test",
  NODE_ENV: "test",
  SERVICE_NAME: "cmsfleet-config-tests"
};

describe("configuration runtime", () => {
  it("extracts selection and nested dynamic overrides from environment variables", () => {
    const environment = readLoaderEnvironment({
      ...baseEnv,
      CMS_CFG__gps__offline_threshold_seconds: "135",
      CMS_CFG__selection__transport_profile: "airport-express"
    });

    expect(environment.selectionOverrides.transportProfile).toBe("airport-express");
    expect(environment.dynamicOverrides).toEqual(
      expect.objectContaining({
        gps: expect.objectContaining({
          offlineThresholdSeconds: 135
        })
      })
    );
  });

  it("loads profile selections and merges typed plus dynamic overrides", () => {
    const loaded = loadCmsConfig({
      cwd: repoRoot,
      rawEnv: {
        ...baseEnv,
        CMS_API_PORT: "3101",
        CMS_CFG__branding__application_name: "Dispatch Test Console",
        CMS_CFG__feature_flags__ops_console: "true",
        CMS_CONFIG_TRANSPORT_PROFILE: "airport-express"
      }
    });

    expect(loaded.config.selection.transportProfile).toBe("airport-express");
    expect(loaded.config.transport.serviceArea).toBe("airport-corridor");
    expect(loaded.config.runtime.api.port).toBe(3101);
    expect(loaded.config.branding.applicationName).toBe("Dispatch Test Console");
    expect(loaded.config.featureFlags.opsConsole).toBe(true);
  });

  it("fails fast when runtime policy validation is violated", () => {
    try {
      loadCmsConfig({
        cwd: repoRoot,
        rawEnv: {
          ...baseEnv,
          CMS_CFG__gps__freshness_threshold_seconds: "60",
          CMS_CFG__gps__offline_threshold_seconds: "30"
        }
      });
      throw new Error("Expected loadCmsConfig to throw.");
    } catch (error) {
      expect(error).toBeInstanceOf(CmsConfigValidationError);
      expect((error as CmsConfigValidationError).details.some((detail) => detail.includes("/gps/offlineThresholdSeconds"))).toBe(true);
    }
  });
});
