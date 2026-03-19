import type {
  BrandingConfig,
  CmsConfig,
  ConfigSelection,
  GpsConfig,
  LedDisplayConfig,
  TransportConfig
} from "@cmsfleet/config-runtime";

export const CONFIG_SCOPE_TYPES = ["global", "tenant", "transport", "display"] as const;

export type ConfigScopeType = (typeof CONFIG_SCOPE_TYPES)[number];

export interface ConfigScopeDescriptor {
  absolutePath: string;
  description: string;
  editableSections: string[];
  relativePath: string;
  scopeKey: string;
  scopeType: ConfigScopeType;
  title: string;
}

export interface ConfigVersionRecord {
  changeSummary: string | null;
  configHash: string;
  createdAt: string;
  createdByUserId: string | null;
  id: string;
  isActive: boolean;
  payload: Record<string, unknown>;
  publishedAt: string | null;
  scopeKey: string;
  scopeType: ConfigScopeType;
  versionNumber: number;
}

export interface ConfigDiffItem {
  after?: unknown;
  before?: unknown;
  changeType: "added" | "changed" | "removed";
  path: string;
}

export interface ConfigDiffResult {
  changeCount: number;
  items: ConfigDiffItem[];
  truncated: boolean;
}

export interface ConfigEffectiveSnapshot {
  branding: BrandingConfig;
  featureFlags: Record<string, boolean>;
  gps: GpsConfig;
  ledDisplay: LedDisplayConfig;
  transport: TransportConfig;
}

export interface ConfigOverviewResponse {
  currentRuntimeSelection: ConfigSelection;
  diskEffective: ConfigEffectiveSnapshot;
  runtimeEffective: ConfigEffectiveSnapshot;
  scopes: Array<ConfigScopeDescriptor & {
    activeVersionId: string | null;
    activeVersionNumber: number | null;
    lastPublishedAt: string | null;
  }>;
  runtimeState: "in_sync" | "restart_required";
}

export interface ConfigScopeResponse {
  activeVersion: ConfigVersionRecord | null;
  diffFromRuntime: ConfigDiffResult;
  diskEffective: Record<string, unknown>;
  history: ConfigVersionRecord[];
  payload: Record<string, unknown>;
  runtimeEffective: Record<string, unknown>;
  runtimeState: "in_sync" | "restart_required";
  scope: ConfigScopeDescriptor;
}

export interface ConfigValidationResponse {
  diff: ConfigDiffResult;
  diskEffective: Record<string, unknown>;
  runtimeState: "in_sync" | "restart_required";
  scope: ConfigScopeDescriptor;
  validation: {
    details: string[];
    valid: true;
  };
}

export interface ConfigApplyResponse extends ConfigValidationResponse {
  version: ConfigVersionRecord;
}

export interface ConfigVersionDiffResponse {
  diff: ConfigDiffResult;
  fromVersion: ConfigVersionRecord;
  toVersion: ConfigVersionRecord;
}

export function pickConfigEffectiveSnapshot(config: CmsConfig): ConfigEffectiveSnapshot {
  return {
    branding: config.branding,
    featureFlags: config.featureFlags,
    gps: config.gps,
    ledDisplay: config.ledDisplay,
    transport: config.transport
  };
}