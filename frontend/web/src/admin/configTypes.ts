export interface ConfigSelection {
  deviceProfile: string;
  displayProfile: string;
  environment: "local" | "test" | "staging" | "production";
  tenantProfile: string;
  transportProfile: string;
  vehicleProfile: string;
}

export type ConfigScopeType = "global" | "tenant" | "transport" | "display";

export interface ConfigScopeSummary {
  activeVersionId: string | null;
  activeVersionNumber: number | null;
  description: string;
  editableSections: string[];
  lastPublishedAt: string | null;
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

export interface ConfigOverviewResponse {
  currentRuntimeSelection: ConfigSelection;
  diskEffective: Record<string, unknown>;
  runtimeEffective: Record<string, unknown>;
  runtimeState: "in_sync" | "restart_required";
  scopes: ConfigScopeSummary[];
}

export interface ConfigScopeResponse {
  activeVersion: ConfigVersionRecord | null;
  diffFromRuntime: ConfigDiffResult;
  diskEffective: Record<string, unknown>;
  history: ConfigVersionRecord[];
  payload: Record<string, unknown>;
  runtimeEffective: Record<string, unknown>;
  runtimeState: "in_sync" | "restart_required";
  scope: Omit<ConfigScopeSummary, "activeVersionId" | "activeVersionNumber" | "lastPublishedAt">;
}

export interface ConfigValidationResponse {
  diff: ConfigDiffResult;
  diskEffective: Record<string, unknown>;
  runtimeState: "in_sync" | "restart_required";
  scope: Omit<ConfigScopeSummary, "activeVersionId" | "activeVersionNumber" | "lastPublishedAt">;
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