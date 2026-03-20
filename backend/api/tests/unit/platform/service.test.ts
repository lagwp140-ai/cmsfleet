import { describe, expect, it } from "vitest";

import { PlatformArchitectureService } from "../../../src/modules/platform/service.js";
import { createTestRuntime } from "../../helpers/config.js";

describe("PlatformArchitectureService", () => {
  it("returns the roadmap extension catalog for the current MVP", () => {
    const { config } = createTestRuntime("local");
    const service = new PlatformArchitectureService(config);

    const result = service.getExtensionCatalog();

    expect(result.activeModules).toContain("gps");
    expect(result.activeModules).toContain("platform");
    expect(result.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "gps-ingestion-adapters",
          status: "ready"
        }),
        expect.objectContaining({
          id: "automatic-trip-matching",
          status: "ready"
        })
      ])
    );
    expect(result.roadmap).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "mqtt-tcp-gps-ingestion",
          phase: "next"
        }),
        expect.objectContaining({
          id: "multi-tenant-rollout",
          phase: "later"
        })
      ])
    );
  });
});
