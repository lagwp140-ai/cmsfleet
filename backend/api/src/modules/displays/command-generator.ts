import type { DisplayMode, DisplaySurface, LedDisplayConfig } from "@cmsfleet/config-runtime";

import { getDisplaySurfaces, getTemplatesForMode, renderTemplate } from "./renderer.js";
import type {
  DisplayCommandContext,
  DisplayCommandFrame,
  DisplayCommandIntent,
  DisplayPanelCommand,
  DisplaySystemStatus
} from "./types.js";

const DEFAULT_FRAME_DURATION_SECONDS = 6;
const PANEL_PRIORITY: DisplaySurface[] = ["front", "side", "rear", "interior"];

export function buildDisplayPanelCommands(input: {
  alternatingMessages: string[];
  config: LedDisplayConfig;
  context: DisplayCommandContext;
  includeInterior: boolean;
  stopAnnouncement: string | null;
  systemStatus: DisplaySystemStatus;
  testPatternLabel: string | null;
}): DisplayPanelCommand[] {
  const surfaces = input.includeInterior ? getDisplaySurfaces() : PANEL_PRIORITY.slice(0, 3);

  return surfaces.map((surface) =>
    buildPanelCommand({
      alternatingMessages: input.alternatingMessages,
      config: input.config,
      context: input.context,
      stopAnnouncement: input.stopAnnouncement,
      surface,
      systemStatus: input.systemStatus,
      testPatternLabel: input.testPatternLabel
    })
  );
}

function buildPanelCommand(input: {
  alternatingMessages: string[];
  config: LedDisplayConfig;
  context: DisplayCommandContext;
  stopAnnouncement: string | null;
  surface: DisplaySurface;
  systemStatus: DisplaySystemStatus;
  testPatternLabel: string | null;
}): DisplayPanelCommand {
  switch (input.systemStatus) {
    case "emergency":
      return buildStaticCommand(input.config, input.surface, "emergency", input.context, "emergency_override");
    case "service_message":
      return buildServiceMessageCommand(input.config, input.surface, input.context, input.alternatingMessages, "service_message");
    case "stop_announcement":
      return buildStopAnnouncementCommand(input.config, input.surface, input.context, input.stopAnnouncement);
    case "test_pattern":
      return buildTestPatternCommand(input.surface, input.testPatternLabel);
    case "preview":
      return buildStaticCommand(input.config, input.surface, "preview", input.context, "preview");
    case "normal":
    default:
      return buildNormalCommand(input.config, input.surface, input.context, input.alternatingMessages);
  }
}

function buildNormalCommand(
  config: LedDisplayConfig,
  surface: DisplaySurface,
  context: DisplayCommandContext,
  alternatingMessages: string[]
): DisplayPanelCommand {
  const mappedMode = resolveSurfaceMode(config.mappings[surface]);
  const baseText = renderModeText(config, mappedMode, surface, context);

  if (alternatingMessages.length === 0) {
    return {
      behavior: "static",
      frames: [{ durationSeconds: DEFAULT_FRAME_DURATION_SECONDS, text: baseText }],
      intent: "route_destination",
      mode: mappedMode,
      panel: surface,
      previewText: baseText
    };
  }

  const frames = [
    { durationSeconds: DEFAULT_FRAME_DURATION_SECONDS, text: baseText },
    ...alternatingMessages.map<DisplayCommandFrame>((message) => ({
      durationSeconds: config.serviceMessageMode.defaultDurationSeconds,
      text: renderModeText(config, "service_message", surface, {
        ...context,
        serviceMessage: message
      })
    }))
  ];

  return {
    behavior: "alternating",
    frames,
    intent: "route_destination",
    mode: mappedMode,
    panel: surface,
    previewText: frames.map((frame) => frame.text).join(" | ")
  };
}

function buildServiceMessageCommand(
  config: LedDisplayConfig,
  surface: DisplaySurface,
  context: DisplayCommandContext,
  alternatingMessages: string[],
  intent: DisplayCommandIntent
): DisplayPanelCommand {
  const messages = alternatingMessages.length > 0 ? alternatingMessages : [context.serviceMessage];
  const frames = messages.map<DisplayCommandFrame>((message) => ({
    durationSeconds: config.serviceMessageMode.defaultDurationSeconds,
    text: renderModeText(config, "service_message", surface, {
      ...context,
      serviceMessage: message
    })
  }));

  return {
    behavior: frames.length > 1 ? "alternating" : "static",
    frames,
    intent,
    mode: "service_message",
    panel: surface,
    previewText: frames.map((frame) => frame.text).join(" | ")
  };
}

function buildStaticCommand(
  config: LedDisplayConfig,
  surface: DisplaySurface,
  mode: DisplayMode,
  context: DisplayCommandContext,
  intent: DisplayCommandIntent
): DisplayPanelCommand {
  const text = renderModeText(config, mode, surface, context);

  return {
    behavior: "static",
    frames: [{ durationSeconds: DEFAULT_FRAME_DURATION_SECONDS, text }],
    intent,
    mode,
    panel: surface,
    previewText: text
  };
}

function buildStopAnnouncementCommand(
  config: LedDisplayConfig,
  surface: DisplaySurface,
  context: DisplayCommandContext,
  stopAnnouncement: string | null
): DisplayPanelCommand {
  const announcement = stopAnnouncement ?? `Next Stop ${context.nextStop}`;

  return buildServiceMessageCommand(
    config,
    surface,
    {
      ...context,
      serviceMessage: announcement
    },
    [announcement],
    "stop_announcement"
  );
}

function buildTestPatternCommand(surface: DisplaySurface, label: string | null): DisplayPanelCommand {
  const normalizedLabel = (label ?? "TEST PATTERN").trim();
  const pattern = surface === "rear" ? `888 ${normalizedLabel}` : `8888 ${normalizedLabel} 8888`;

  return {
    behavior: "test_pattern",
    frames: [{ durationSeconds: DEFAULT_FRAME_DURATION_SECONDS, text: pattern }],
    intent: "test_pattern",
    mode: "preview",
    panel: surface,
    previewText: pattern
  };
}

function renderModeText(
  config: LedDisplayConfig,
  mode: DisplayMode,
  surface: DisplaySurface,
  context: DisplayCommandContext
): string {
  const templates = getTemplatesForMode(config, mode);
  return renderTemplate(templates[surface], context);
}

function resolveSurfaceMode(mapping: string): DisplayMode {
  const normalized = mapping.trim().toLowerCase().replace(/[: ].*$/, "");

  switch (normalized) {
    case "destination":
      return "destination";
    case "service_message":
    case "servicemessage":
    case "service":
      return "service_message";
    case "preview":
      return "preview";
    case "route":
    default:
      return "route";
  }
}
