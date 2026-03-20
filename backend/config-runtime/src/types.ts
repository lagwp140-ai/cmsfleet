export type NodeEnvironment = "development" | "test" | "production";
export type AppEnvironment = "local" | "test" | "staging" | "production";
export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";
export type UserRole = "super_admin" | "dispatcher" | "operator" | "viewer";
export type DisplaySurface = "front" | "side" | "rear" | "interior";
export type DisplayMode = "route" | "destination" | "service_message" | "emergency" | "preview";

export interface ConfigSelection {
  environment: AppEnvironment;
  tenantProfile: string;
  transportProfile: string;
  vehicleProfile: string;
  deviceProfile: string;
  displayProfile: string;
}

export interface RuntimeConfig {
  api: {
    port: number;
    corsOrigins: string[];
    trustProxy: boolean;
    rateLimit: {
      enabled: boolean;
      generalMaxRequests: number;
      generalWindowSeconds: number;
      loginMaxAttempts: number;
      loginWindowSeconds: number;
      mutationMaxRequests: number;
      mutationWindowSeconds: number;
    };
  };
  worker: {
    pollIntervalMs: number;
  };
  observability: {
    logLevel: LogLevel;
  };
  database: {
    url: string;
  };
}

export interface AuthRoleDefinition {
  label: string;
  permissions: string[];
}

export interface AuthConfig {
  bootstrapUsersEnabled: boolean;
  passwordPolicy: {
    algorithm: "pbkdf2_sha512";
    iterations: number;
    keyLength: number;
    maxLength: number;
    minLength: number;
    requireLowercase: boolean;
    requireNumber: boolean;
    requireSymbol: boolean;
    requireUppercase: boolean;
    saltLength: number;
  };
  rbac: {
    roles: Record<UserRole, AuthRoleDefinition>;
  };
  csrf: {
    headerName: string;
    secret: string;
  };
  session: {
    cookieName: string;
    maxAgeMinutes: number;
    sameSite: "lax" | "strict" | "none";
    secret: string;
    secureCookies: boolean;
  };
}

export interface TenantConfig {
  id: string;
  displayName: string;
  locale: string;
  timezone: string;
}

export interface TransportConfig {
  mode: string;
  serviceArea: string;
  routeStrategy: {
    type: string;
    fallbackDestination: string;
    preferRealtimeTripUpdates: boolean;
    resolutionOrder: Array<"manual" | "schedule" | "gps">;
    scheduleEarlyToleranceMinutes: number;
    scheduleLateToleranceMinutes: number;
    scheduleLookaheadMinutes: number;
  };
}

export interface VehicleConfig {
  profileId: string;
  class: string;
  hardwareModel: string;
  passengerCapacity: number;
  accessibility: {
    wheelchairSpaces: number;
    bikeRack: boolean;
  };
}

export interface DeviceConfig {
  profileId: string;
  platform: string;
  operatingSystem: string;
  connectivity: {
    gps: boolean;
    cellular: boolean;
    wifi: boolean;
  };
}

export interface GpsConfig {
  provider: string;
  sourceType: string;
  endpoint: string;
  pollIntervalMs: number;
  freshnessThresholdSeconds: number;
  offlineThresholdSeconds: number;
  movementThresholdKph: number;
  vehicleIdField: string;
  simulate: boolean;
}

export interface LedDisplaySurfaceMappings {
  front: string;
  side: string;
  rear: string;
  interior: string;
}

export interface LedDisplaySurfaceTemplates {
  front: string;
  side: string;
  rear: string;
  interior: string;
}

export interface LedDisplayMessageFormat {
  name: string;
  lineCount: number;
  maxCharactersPerLine: number;
  encoding: string;
}

export interface LedDisplayControllerContract {
  protocolFamily: string;
  transport: string;
  supportedOperations: Array<"publish" | "preview" | "clear" | "set_brightness">;
  supportsMultiZone: boolean;
  maxLines: number;
}

export interface LedDisplayRouteDisplayMode {
  lineTemplate: string;
  destinationTemplate: string;
  useRouteShortName: boolean;
  useHeadsign: boolean;
  sideViaSeparator: string;
  unknownRouteLabel: string;
}

export interface LedDisplayDestinationDisplayMode {
  destinationTemplate: string;
  fallbackDestination: string;
  includeVia: boolean;
  viaSeparator: string;
}

export interface LedDisplayServiceMessageMode {
  template: string;
  defaultDurationSeconds: number;
  prefix: string;
  allowBlink: boolean;
}

export interface LedDisplayEmergencyMode {
  template: string;
  priority: number;
  clearsStandardContent: boolean;
  requiresAcknowledgement: boolean;
}

export interface LedDisplayPreviewSampleValues {
  routeShortName: string;
  routeLongName: string;
  headsign: string;
  destination: string;
  via: string;
  serviceMessage: string;
  emergencyMessage: string;
  nextStop: string;
  publicNote: string;
}

export interface LedDisplayPreviewMode {
  enabled: boolean;
  sampleValues: LedDisplayPreviewSampleValues;
}

export interface LedDisplayModeTemplates {
  route: LedDisplaySurfaceTemplates;
  destination: LedDisplaySurfaceTemplates;
  serviceMessage: LedDisplaySurfaceTemplates;
  emergency: LedDisplaySurfaceTemplates;
  preview: LedDisplaySurfaceTemplates;
}

export interface LedDisplayConfig {
  profileId: string;
  provider: string;
  controller: string;
  brightness: number;
  destinationTemplate: string;
  mappings: LedDisplaySurfaceMappings;
  messageFormat: LedDisplayMessageFormat;
  controllerContract: LedDisplayControllerContract;
  templates: LedDisplayModeTemplates;
  routeDisplayMode: LedDisplayRouteDisplayMode;
  destinationDisplayMode: LedDisplayDestinationDisplayMode;
  serviceMessageMode: LedDisplayServiceMessageMode;
  emergencyMode: LedDisplayEmergencyMode;
  previewMode: LedDisplayPreviewMode;
}

export interface GtfsRealtimeConfig {
  enabled: boolean;
  tripUpdatesUrl: string | null;
  vehiclePositionsUrl: string | null;
  alertsUrl: string | null;
}

export interface GtfsConfig {
  enabled: boolean;
  agencyId: string;
  timezone: string;
  staticFeedUrl: string;
  realtime: GtfsRealtimeConfig;
}

export interface BrandingConfig {
  applicationName: string;
  operatorName: string;
  locale: string;
  palette: {
    primary: string;
    secondary: string;
    surface: string;
    text: string;
  };
  assets: {
    logoUrl: string;
    iconUrl: string;
  };
}

export interface CmsConfig {
  schemaVersion: string;
  selection: ConfigSelection;
  runtime: RuntimeConfig;
  auth: AuthConfig;
  tenant: TenantConfig;
  transport: TransportConfig;
  vehicle: VehicleConfig;
  device: DeviceConfig;
  gps: GpsConfig;
  ledDisplay: LedDisplayConfig;
  gtfs: GtfsConfig;
  branding: BrandingConfig;
  featureFlags: Record<string, boolean>;
}

export interface ConfigRuntimeContext {
  nodeEnv: NodeEnvironment;
  appEnv: AppEnvironment;
  serviceName: string;
  configDirectory: string;
}

export interface LoadedCmsConfig {
  config: CmsConfig;
  context: ConfigRuntimeContext;
  sources: string[];
}

export interface LoadCmsConfigOptions {
  cwd?: string;
  rawEnv?: NodeJS.ProcessEnv;
}
