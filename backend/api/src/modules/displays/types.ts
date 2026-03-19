import type {
  DisplayMode,
  DisplaySurface,
  LedDisplayConfig,
  LedDisplayControllerContract,
  LedDisplayMessageFormat
} from "@cmsfleet/config-runtime";

export type DisplaySystemStatus =
  | "normal"
  | "service_message"
  | "stop_announcement"
  | "emergency"
  | "test_pattern"
  | "preview";

export type DisplayCommandBehavior = "static" | "alternating" | "test_pattern";
export type DisplayCommandIntent =
  | "route_destination"
  | "service_message"
  | "stop_announcement"
  | "emergency_override"
  | "test_pattern"
  | "preview";
export type DisplayAdapterMode = "mock" | "hardware";
export type DisplayAdapterHealthState = "healthy" | "degraded" | "unhealthy";
export type DisplayDeliveryStatus =
  | "queued"
  | "processing"
  | "retry_waiting"
  | "delivered"
  | "failed";

export interface DisplayPreviewContext {
  destination: string;
  emergencyMessage: string;
  headsign: string;
  nextStop: string;
  publicNote: string;
  routeLongName: string;
  routeShortName: string;
  serviceMessage: string;
  via: string;
}

export interface DisplayRenderedSurface {
  surface: DisplaySurface;
  text: string;
}

export interface DisplayPreviewScenario {
  envelope: DisplayPublishEnvelope;
  mode: DisplayMode;
  surfaces: DisplayRenderedSurface[];
}

export interface DisplayPublishEnvelope {
  contractVersion: string;
  controller: string;
  mode: DisplayMode;
  operations: Array<"preview" | "publish" | "clear" | "set_brightness">;
  provider: string;
  surfaces: Record<DisplaySurface, string>;
  transport: string;
}

export interface DisplayModeDefinition {
  description: string;
  mode: DisplayMode;
  policy: Record<string, boolean | number | string>;
  templates: Record<DisplaySurface, string>;
}

export interface DisplayDomainProfile {
  brightness: number;
  controller: string;
  controllerContract: LedDisplayControllerContract;
  destinationTemplate: string;
  mappings: LedDisplayConfig["mappings"];
  messageFormat: LedDisplayMessageFormat;
  profileId: string;
  provider: string;
}

export interface DisplayDomainResponse {
  abstraction: {
    driverStatus: "abstracted";
    notes: string[];
    publishEnvelopeKind: string;
  };
  modes: DisplayModeDefinition[];
  previewContext: DisplayPreviewContext;
  previews: DisplayPreviewScenario[];
  profile: DisplayDomainProfile;
  supportedModes: DisplayMode[];
}

export interface DisplayPreviewRequest {
  context?: Partial<DisplayPreviewContext>;
  mode: DisplayMode;
}

export interface DisplayCommandFrame {
  durationSeconds: number;
  text: string;
}

export interface DisplayPanelCommand {
  behavior: DisplayCommandBehavior;
  frames: DisplayCommandFrame[];
  intent: DisplayCommandIntent;
  mode: DisplayMode;
  panel: DisplaySurface;
  previewText: string;
}

export interface DisplayPayloadVehicleInfo {
  label: string;
  vehicleCode: string;
  vehicleId: string;
}

export interface DisplayCommandPayload {
  brightness: number;
  contractVersion: string;
  controller: string;
  generatedAt: string;
  operations: Array<"preview" | "publish" | "clear" | "set_brightness">;
  panels: DisplayPanelCommand[];
  provider: string;
  systemStatus: DisplaySystemStatus;
  transport: string;
  vehicle: DisplayPayloadVehicleInfo | null;
}

export interface DisplayCommandContext {
  destination: string;
  emergencyMessage: string;
  headsign: string;
  nextStop: string;
  publicNote: string;
  routeLongName: string;
  routeShortName: string;
  serviceMessage: string;
  source: "live_vehicle" | "preview_profile";
  via: string;
}

export interface DisplayCommandResponse {
  context: DisplayCommandContext;
  payload: DisplayCommandPayload;
}

export interface DisplayAdapterDeliveryInput {
  attemptNumber: number;
  deliveryId: string;
  payload: DisplayCommandPayload;
  requestedAt: string;
  requestedByUserId: string | null;
}

export interface DisplayAdapterSendResult {
  acceptedAt: string;
  adapterMessageId: string;
  metadata?: Record<string, boolean | number | string>;
}

export interface DisplayAdapterHealthReport {
  adapterId: string;
  adapterMode: DisplayAdapterMode;
  controller: string;
  lastError: string | null;
  lastHealthyAt: string | null;
  lastSuccessfulDeliveryAt: string | null;
  lastUnhealthyAt: string | null;
  message: string;
  provider: string;
  state: DisplayAdapterHealthState;
  supportedOperations: Array<"preview" | "publish" | "clear" | "set_brightness">;
  transport: string;
}

export interface DisplayDeliveryRecord {
  adapterId: string;
  adapterMessageId: string | null;
  adapterMode: DisplayAdapterMode;
  attemptCount: number;
  context: DisplayCommandContext;
  createdAt: string;
  deliveryId: string;
  deliveredAt: string | null;
  errorMessage: string | null;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  payload: DisplayCommandPayload;
  requestedByUserId: string | null;
  status: DisplayDeliveryStatus;
}

export interface DisplayQueueOverview {
  activeDeliveryId: string | null;
  adapter: DisplayAdapterHealthReport;
  maxAttempts: number;
  processing: boolean;
  queueDepth: number;
  retainedDeliveries: number;
  retryDepth: number;
  retryIntervalMs: number;
  totals: {
    delivered: number;
    failed: number;
    pending: number;
  };
}

export interface DisplayDeliveryListResponse {
  deliveries: DisplayDeliveryRecord[];
  queue: DisplayQueueOverview;
}

export interface DisplayPublishResponse {
  command: DisplayCommandResponse;
  delivery: DisplayDeliveryRecord;
  queue: DisplayQueueOverview;
}

export interface DisplayCommandRequest {
  alternatingMessages?: string[];
  destination?: string;
  emergencyMessage?: string;
  headsign?: string;
  includeInterior?: boolean;
  nextStop?: string;
  publicNote?: string;
  routeLongName?: string;
  routeShortName?: string;
  serviceMessage?: string;
  stopAnnouncement?: string;
  systemStatus?: DisplaySystemStatus;
  testPatternLabel?: string;
  vehicleId?: string;
  via?: string;
}

export interface VehicleDisplayLiveContext {
  isEnabled: boolean;
  label: string;
  nextStopName: string | null;
  operationalStatus: string;
  resolutionSource: string | null;
  routeLongName: string | null;
  routeShortName: string | null;
  routeState: string | null;
  tripHeadsign: string | null;
  tripShortName: string | null;
  vehicleCode: string;
  vehicleId: string;
}
