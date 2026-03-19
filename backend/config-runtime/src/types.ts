export type NodeEnvironment = "development" | "test" | "production";
export type AppEnvironment = "local" | "test" | "staging" | "production";
export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";
export type UserRole = "super_admin" | "dispatcher" | "operator" | "viewer";

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
    minLength: number;
    saltLength: number;
  };
  rbac: {
    roles: Record<UserRole, AuthRoleDefinition>;
  };
  session: {
    cookieName: string;
    maxAgeMinutes: number;
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
  vehicleIdField: string;
  simulate: boolean;
}

export interface LedDisplayConfig {
  profileId: string;
  provider: string;
  controller: string;
  brightness: number;
  destinationTemplate: string;
  mappings: {
    front: string;
    side: string;
    rear: string;
    interior: string;
  };
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