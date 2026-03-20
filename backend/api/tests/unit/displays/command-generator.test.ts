import { describe, expect, it } from "vitest";

import { buildDisplayPanelCommands } from "../../../src/modules/displays/command-generator.js";
import { createTestRuntime } from "../../helpers/config.js";

describe("display command generation", () => {
  it("renders route and destination commands for front, side, and rear panels", () => {
    const { config } = createTestRuntime("local");
    const commands = buildDisplayPanelCommands({
      alternatingMessages: [],
      config: config.ledDisplay,
      context: {
        destination: "Central Station",
        emergencyMessage: "Evacuate vehicle",
        headsign: "Central Station",
        nextStop: "Market Square",
        publicNote: "Testing preview",
        routeLongName: "Central Station - Riverside",
        routeShortName: "24",
        serviceMessage: "Board via front door",
        source: "live_vehicle",
        via: "Market Square"
      },
      includeInterior: false,
      stopAnnouncement: null,
      systemStatus: "normal",
      testPatternLabel: null
    });

    expect(commands).toHaveLength(3);
    expect(commands[0]).toEqual(
      expect.objectContaining({
        behavior: "static",
        panel: "front",
        previewText: "24 Central Station"
      })
    );
    expect(commands[1]?.previewText).toBe("Central Station via Market Square");
    expect(commands[2]?.previewText).toBe("24");
  });

  it("builds alternating service frames when supplemental messages are present", () => {
    const { config } = createTestRuntime("local");
    const commands = buildDisplayPanelCommands({
      alternatingMessages: ["Wheelchair ramp deployed", "Use rear door"],
      config: config.ledDisplay,
      context: {
        destination: "Central Station",
        emergencyMessage: "Evacuate vehicle",
        headsign: "Central Station",
        nextStop: "Market Square",
        publicNote: "Testing preview",
        routeLongName: "Central Station - Riverside",
        routeShortName: "24",
        serviceMessage: "Board via front door",
        source: "live_vehicle",
        via: "Market Square"
      },
      includeInterior: false,
      stopAnnouncement: null,
      systemStatus: "normal",
      testPatternLabel: null
    });

    expect(commands[0]?.behavior).toBe("alternating");
    expect(commands[0]?.frames).toHaveLength(3);
    expect(commands[0]?.frames[1]?.text).toBe("Wheelchair ramp deployed");
    expect(commands[0]?.frames[2]?.text).toBe("Use rear door");
  });

  it("switches all panels into emergency override mode", () => {
    const { config } = createTestRuntime("local");
    const commands = buildDisplayPanelCommands({
      alternatingMessages: [],
      config: config.ledDisplay,
      context: {
        destination: "Central Station",
        emergencyMessage: "Fire detected",
        headsign: "Central Station",
        nextStop: "Market Square",
        publicNote: "Testing preview",
        routeLongName: "Central Station - Riverside",
        routeShortName: "24",
        serviceMessage: "Board via front door",
        source: "live_vehicle",
        via: "Market Square"
      },
      includeInterior: true,
      stopAnnouncement: null,
      systemStatus: "emergency",
      testPatternLabel: null
    });

    expect(commands.every((command) => command.intent === "emergency_override")).toBe(true);
    expect(commands[0]?.previewText).toContain("EMERGENCY Fire detected");
  });

  it("generates a panel test pattern without transport context", () => {
    const { config } = createTestRuntime("local");
    const commands = buildDisplayPanelCommands({
      alternatingMessages: [],
      config: config.ledDisplay,
      context: {
        destination: "Central Station",
        emergencyMessage: "Evacuate vehicle",
        headsign: "Central Station",
        nextStop: "Market Square",
        publicNote: "Testing preview",
        routeLongName: "Central Station - Riverside",
        routeShortName: "24",
        serviceMessage: "Board via front door",
        source: "preview_profile",
        via: "Market Square"
      },
      includeInterior: false,
      stopAnnouncement: null,
      systemStatus: "test_pattern",
      testPatternLabel: "PANEL"
    });

    expect(commands[0]).toEqual(
      expect.objectContaining({
        behavior: "test_pattern",
        previewText: "8888 PANEL 8888"
      })
    );
    expect(commands[2]?.previewText).toBe("888 PANEL");
  });
});