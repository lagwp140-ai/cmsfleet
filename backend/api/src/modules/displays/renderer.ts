import type { DisplayMode, DisplaySurface, LedDisplayConfig } from "@cmsfleet/config-runtime";

import type { DisplayPreviewContext, DisplayRenderedSurface } from "./types.js";

const DISPLAY_SURFACES: DisplaySurface[] = ["front", "side", "rear", "interior"];
const DISPLAY_MODES: DisplayMode[] = ["route", "destination", "service_message", "emergency", "preview"];

export function buildSurfacePreview(
  config: LedDisplayConfig,
  mode: DisplayMode,
  context: DisplayPreviewContext
): DisplayRenderedSurface[] {
  const templates = getTemplatesForMode(config, mode);

  return DISPLAY_SURFACES.map((surface) => ({
    surface,
    text: renderTemplate(templates[surface], context)
  }));
}

export function getDisplayModes(): DisplayMode[] {
  return [...DISPLAY_MODES];
}

export function getDisplaySurfaces(): DisplaySurface[] {
  return [...DISPLAY_SURFACES];
}

export function getTemplatesForMode(
  config: LedDisplayConfig,
  mode: DisplayMode
): Record<DisplaySurface, string> {
  switch (mode) {
    case "route":
      return config.templates.route;
    case "destination":
      return config.templates.destination;
    case "service_message":
      return config.templates.serviceMessage;
    case "emergency":
      return config.templates.emergency;
    case "preview":
      return config.templates.preview;
    default:
      return config.templates.preview;
  }
}

export function mergePreviewContext(
  baseContext: DisplayPreviewContext,
  overrides: Partial<DisplayPreviewContext> | undefined
): DisplayPreviewContext {
  return {
    ...baseContext,
    ...(overrides ?? {})
  };
}

export function renderTemplate(template: string, context: DisplayPreviewContext): string {
  return template.replace(/\{([A-Za-z0-9]+)\}/g, (_match, token: keyof DisplayPreviewContext) => {
    const value = context[token];
    return typeof value === "string" ? value : "";
  });
}
