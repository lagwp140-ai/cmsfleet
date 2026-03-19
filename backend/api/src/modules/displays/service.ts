import type { CmsConfig, DisplayMode } from "@cmsfleet/config-runtime";

import { buildDisplayPanelCommands } from "./command-generator.js";
import { buildSurfacePreview, getDisplayModes, getTemplatesForMode, mergePreviewContext } from "./renderer.js";
import type {
  DisplayCommandContext,
  DisplayCommandRequest,
  DisplayCommandResponse,
  DisplayDomainResponse,
  DisplayModeDefinition,
  DisplayPreviewContext,
  DisplayPreviewRequest,
  DisplayPreviewScenario,
  DisplayPublishEnvelope,
  DisplaySystemStatus,
  VehicleDisplayLiveContext
} from "./types.js";
import { DisplayRepository } from "./repository.js";

export class DisplayDomainService {
  constructor(
    private readonly config: CmsConfig,
    private readonly repository: DisplayRepository
  ) {}

  async generateCommands(request: DisplayCommandRequest): Promise<DisplayCommandResponse> {
    const liveVehicle = request.vehicleId
      ? await this.repository.findVehicleLiveContext(request.vehicleId)
      : null;

    if (request.vehicleId && !liveVehicle) {
      throw new Error(`Vehicle ${request.vehicleId} was not found for display command generation.`);
    }

    const context = this.buildCommandContext(liveVehicle, request);
    const systemStatus = resolveSystemStatus(request, liveVehicle);
    const alternatingMessages = normalizeMessages(request.alternatingMessages);
    const commands = buildDisplayPanelCommands({
      alternatingMessages,
      config: this.config.ledDisplay,
      context,
      includeInterior: request.includeInterior ?? false,
      stopAnnouncement: normalizeText(request.stopAnnouncement),
      systemStatus,
      testPatternLabel: normalizeText(request.testPatternLabel)
    });

    return {
      context,
      payload: {
        brightness: this.config.ledDisplay.brightness,
        contractVersion: "1.0",
        controller: this.config.ledDisplay.controller,
        generatedAt: new Date().toISOString(),
        operations: [...this.config.ledDisplay.controllerContract.supportedOperations],
        panels: commands,
        provider: this.config.ledDisplay.provider,
        systemStatus,
        transport: this.config.ledDisplay.controllerContract.transport,
        vehicle: liveVehicle
          ? {
              label: liveVehicle.label,
              vehicleCode: liveVehicle.vehicleCode,
              vehicleId: liveVehicle.vehicleId
            }
          : null
      }
    };
  }

  getDomainModel(): DisplayDomainResponse {
    const previewContext = this.getPreviewContext();
    const supportedModes = getDisplayModes();

    return {
      abstraction: {
        driverStatus: "abstracted",
        notes: [
          "Transport and route logic only produce display intent and tokens.",
          "Controller drivers consume an abstract publish envelope instead of transport-specific CMS logic.",
          "Preview rendering uses the same template model that later publish adapters will consume."
        ],
        publishEnvelopeKind: "abstract-led-envelope"
      },
      modes: supportedModes.map((mode) => this.buildModeDefinition(mode)),
      previewContext,
      previews: supportedModes.map((mode) => this.buildPreviewScenario({ mode }, previewContext)),
      profile: {
        brightness: this.config.ledDisplay.brightness,
        controller: this.config.ledDisplay.controller,
        controllerContract: this.config.ledDisplay.controllerContract,
        destinationTemplate: this.config.ledDisplay.destinationTemplate,
        mappings: this.config.ledDisplay.mappings,
        messageFormat: this.config.ledDisplay.messageFormat,
        profileId: this.config.ledDisplay.profileId,
        provider: this.config.ledDisplay.provider
      },
      supportedModes
    };
  }

  preview(request: DisplayPreviewRequest): DisplayPreviewScenario {
    const context = mergePreviewContext(this.getPreviewContext(), request.context);
    return this.buildPreviewScenario(request, context);
  }

  private buildCommandContext(
    liveVehicle: VehicleDisplayLiveContext | null,
    request: DisplayCommandRequest
  ): DisplayCommandContext {
    const previewContext = this.getPreviewContext();
    const routeShortName = normalizeText(request.routeShortName)
      ?? liveVehicle?.routeShortName
      ?? previewContext.routeShortName;
    const routeLongName = normalizeText(request.routeLongName)
      ?? liveVehicle?.routeLongName
      ?? previewContext.routeLongName;
    const headsign = normalizeText(request.headsign)
      ?? liveVehicle?.tripHeadsign
      ?? liveVehicle?.tripShortName
      ?? routeLongName
      ?? previewContext.headsign;
    const destination = normalizeText(request.destination)
      ?? headsign
      ?? this.config.transport.routeStrategy.fallbackDestination
      ?? this.config.ledDisplay.destinationDisplayMode.fallbackDestination;
    const nextStop = normalizeText(request.nextStop)
      ?? liveVehicle?.nextStopName
      ?? previewContext.nextStop;
    const via = normalizeText(request.via)
      ?? (liveVehicle?.nextStopName && liveVehicle.nextStopName !== destination ? liveVehicle.nextStopName : null)
      ?? previewContext.via;
    const serviceMessage = normalizeText(request.serviceMessage)
      ?? normalizeText(request.stopAnnouncement)
      ?? (liveVehicle && (!liveVehicle.isEnabled || liveVehicle.operationalStatus !== "active") ? "Out of Service" : null)
      ?? previewContext.serviceMessage;
    const emergencyMessage = normalizeText(request.emergencyMessage) ?? previewContext.emergencyMessage;
    const publicNote = normalizeText(request.publicNote)
      ?? (liveVehicle ? `Vehicle ${liveVehicle.vehicleCode}` : null)
      ?? previewContext.publicNote;

    return {
      destination,
      emergencyMessage,
      headsign,
      nextStop,
      publicNote,
      routeLongName,
      routeShortName,
      serviceMessage,
      source: liveVehicle ? "live_vehicle" : "preview_profile",
      via
    };
  }

  private buildModeDefinition(mode: DisplayMode): DisplayModeDefinition {
    switch (mode) {
      case "route":
        return {
          description: "Compose route short name and live headsign intent for standard passenger-facing service.",
          mode,
          policy: {
            destinationTemplate: this.config.ledDisplay.routeDisplayMode.destinationTemplate,
            lineTemplate: this.config.ledDisplay.routeDisplayMode.lineTemplate,
            sideViaSeparator: this.config.ledDisplay.routeDisplayMode.sideViaSeparator,
            unknownRouteLabel: this.config.ledDisplay.routeDisplayMode.unknownRouteLabel,
            useHeadsign: this.config.ledDisplay.routeDisplayMode.useHeadsign,
            useRouteShortName: this.config.ledDisplay.routeDisplayMode.useRouteShortName
          },
          templates: getTemplatesForMode(this.config.ledDisplay, mode)
        };
      case "destination":
        return {
          description: "Render destination-first signage for fallback or destination-only operating states.",
          mode,
          policy: {
            destinationTemplate: this.config.ledDisplay.destinationDisplayMode.destinationTemplate,
            fallbackDestination: this.config.transport.routeStrategy.fallbackDestination || this.config.ledDisplay.destinationDisplayMode.fallbackDestination,
            includeVia: this.config.ledDisplay.destinationDisplayMode.includeVia,
            viaSeparator: this.config.ledDisplay.destinationDisplayMode.viaSeparator
          },
          templates: getTemplatesForMode(this.config.ledDisplay, mode)
        };
      case "service_message":
        return {
          description: "Render temporary passenger-facing notices without binding them to one hardware protocol.",
          mode,
          policy: {
            allowBlink: this.config.ledDisplay.serviceMessageMode.allowBlink,
            defaultDurationSeconds: this.config.ledDisplay.serviceMessageMode.defaultDurationSeconds,
            prefix: this.config.ledDisplay.serviceMessageMode.prefix,
            template: this.config.ledDisplay.serviceMessageMode.template
          },
          templates: getTemplatesForMode(this.config.ledDisplay, mode)
        };
      case "emergency":
        return {
          description: "Render a highest-priority override state that can suspend normal route and destination content.",
          mode,
          policy: {
            clearsStandardContent: this.config.ledDisplay.emergencyMode.clearsStandardContent,
            priority: this.config.ledDisplay.emergencyMode.priority,
            requiresAcknowledgement: this.config.ledDisplay.emergencyMode.requiresAcknowledgement,
            template: this.config.ledDisplay.emergencyMode.template
          },
          templates: getTemplatesForMode(this.config.ledDisplay, mode)
        };
      case "preview":
        return {
          description: "Provide an operator-safe preview rendering path that mirrors publish intent without touching field hardware.",
          mode,
          policy: {
            enabled: this.config.ledDisplay.previewMode.enabled,
            sampleRoute: this.config.ledDisplay.previewMode.sampleValues.routeShortName,
            sampleServiceMessage: this.config.ledDisplay.previewMode.sampleValues.serviceMessage
          },
          templates: getTemplatesForMode(this.config.ledDisplay, mode)
        };
      default:
        return {
          description: "Display mode definition unavailable.",
          mode,
          policy: {},
          templates: getTemplatesForMode(this.config.ledDisplay, "preview")
        };
    }
  }

  private buildPreviewScenario(
    request: DisplayPreviewRequest,
    context: DisplayPreviewContext
  ): DisplayPreviewScenario {
    const surfaces = buildSurfacePreview(this.config.ledDisplay, request.mode, context);
    const envelope = this.buildPublishEnvelope(request.mode, surfaces);

    return {
      envelope,
      mode: request.mode,
      surfaces
    };
  }

  private buildPublishEnvelope(mode: DisplayMode, surfaces: DisplayPreviewScenario["surfaces"]): DisplayPublishEnvelope {
    return {
      contractVersion: "1.0",
      controller: this.config.ledDisplay.controller,
      mode,
      operations: [...this.config.ledDisplay.controllerContract.supportedOperations],
      provider: this.config.ledDisplay.provider,
      surfaces: {
        front: surfaces.find((surface) => surface.surface === "front")?.text ?? "",
        side: surfaces.find((surface) => surface.surface === "side")?.text ?? "",
        rear: surfaces.find((surface) => surface.surface === "rear")?.text ?? "",
        interior: surfaces.find((surface) => surface.surface === "interior")?.text ?? ""
      },
      transport: this.config.ledDisplay.controllerContract.transport
    };
  }

  private getPreviewContext(): DisplayPreviewContext {
    const sample = this.config.ledDisplay.previewMode.sampleValues;

    return {
      destination: sample.destination,
      emergencyMessage: sample.emergencyMessage,
      headsign: sample.headsign,
      nextStop: sample.nextStop,
      publicNote: sample.publicNote,
      routeLongName: sample.routeLongName,
      routeShortName: sample.routeShortName,
      serviceMessage: sample.serviceMessage,
      via: sample.via
    };
  }
}

function isDisplaySystemStatus(value: unknown): value is DisplaySystemStatus {
  return value === "normal"
    || value === "service_message"
    || value === "stop_announcement"
    || value === "emergency"
    || value === "test_pattern"
    || value === "preview";
}

function normalizeMessages(messages: unknown): string[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message): message is string => typeof message === "string")
    .map((message) => message.trim())
    .filter((message) => message !== "");
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function resolveSystemStatus(
  request: DisplayCommandRequest,
  liveVehicle: VehicleDisplayLiveContext | null
): DisplaySystemStatus {
  if (request.systemStatus && isDisplaySystemStatus(request.systemStatus)) {
    return request.systemStatus;
  }

  if (normalizeText(request.emergencyMessage)) {
    return "emergency";
  }

  if (normalizeText(request.testPatternLabel)) {
    return "test_pattern";
  }

  if (normalizeText(request.stopAnnouncement)) {
    return "stop_announcement";
  }

  if (normalizeText(request.serviceMessage) || normalizeMessages(request.alternatingMessages).length > 0) {
    return "service_message";
  }

  if (!request.vehicleId) {
    return "preview";
  }

  if (liveVehicle && (!liveVehicle.isEnabled || liveVehicle.operationalStatus !== "active")) {
    return "service_message";
  }

  return "normal";
}
