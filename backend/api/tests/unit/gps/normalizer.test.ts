import { describe, expect, it } from "vitest";

import { GpsPayloadValidationError, normalizeHttpGpsPayload } from "../../../src/modules/gps/normalizer.js";
import { classifyConnectionState, computeFreshnessSeconds } from "../../../src/modules/gps/service.js";

describe("GPS normalization", () => {
  it("normalizes coordinates, timestamps, and numeric strings from HTTP payloads", () => {
    const result = normalizeHttpGpsPayload(
      {
        heading: "361.4",
        latitude: "50.4501234",
        longitude: "30.5234567",
        speed: "42.7",
        timestamp: "1710849600",
        unitCode: "BUS-100"
      },
      {
        adapter: "http_json",
        receivedAt: "2026-03-19T08:00:00.000Z",
        sourceName: "test-gps",
        vehicleIdField: "vehicleId"
      }
    );

    expect(result.vehicleIdentifier).toBe("BUS-100");
    expect(result.latitude).toBe(50.450123);
    expect(result.longitude).toBe(30.523457);
    expect(result.speedKph).toBe(42.7);
    expect(result.headingDeg).toBe(1.4);
    expect(result.positionTime).toBe("2024-03-19T12:00:00.000Z");
  });

  it("rejects invalid coordinates with a validation error", () => {
    expect(() =>
      normalizeHttpGpsPayload(
        {
          latitude: 120,
          longitude: 30.5,
          vehicleId: "BUS-101"
        },
        {
          adapter: "http_json",
          receivedAt: "2026-03-19T08:00:00.000Z",
          sourceName: "test-gps",
          vehicleIdField: "vehicleId"
        }
      )
    ).toThrowError(GpsPayloadValidationError);
  });

  it("computes freshness and classifies online, stale, and offline states", () => {
    const referenceTime = new Date("2026-03-19T10:00:45.000Z");

    expect(computeFreshnessSeconds("2026-03-19T10:00:30.000Z", referenceTime)).toBe(15);
    expect(classifyConnectionState(10, 30, 120)).toBe("online");
    expect(classifyConnectionState(90, 30, 120)).toBe("stale");
    expect(classifyConnectionState(240, 30, 120)).toBe("offline");
    expect(classifyConnectionState(null, 30, 120)).toBe("unknown");
  });
});
