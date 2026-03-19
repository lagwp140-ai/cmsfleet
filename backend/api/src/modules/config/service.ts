import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CmsConfigValidationError,
  loadCmsConfig,
  type CmsConfig,
  type ConfigRuntimeContext,
  type LoadedCmsConfig
} from "@cmsfleet/config-runtime";

import { ConfigRepository } from "./repository.js";
import type {
  ConfigApplyResponse,
  ConfigDiffItem,
  ConfigDiffResult,
  ConfigOverviewResponse,
  ConfigScopeDescriptor,
  ConfigScopeResponse,
  ConfigScopeType,
  ConfigValidationResponse,
  ConfigVersionDiffResponse,
  ConfigVersionRecord
} from "./types.js";
import { pickConfigEffectiveSnapshot } from "./types.js";

const DIFF_LIMIT = 250;

export class ConfigManagementService {
  constructor(
    private readonly startupConfig: CmsConfig,
    private readonly runtimeContext: ConfigRuntimeContext,
    private readonly repository: ConfigRepository
  ) {}

  async getOverview(): Promise<ConfigOverviewResponse> {
    const diskLoaded = this.loadResolvedConfig();
    const scopes = this.getActiveScopes(diskLoaded.config);
    const scopedVersions = await Promise.all(
      scopes.map(async (scope) => {
        const activeVersion = await this.ensureScopeVersion(scope);

        return {
          ...scope,
          activeVersionId: activeVersion?.id ?? null,
          activeVersionNumber: activeVersion?.versionNumber ?? null,
          lastPublishedAt: activeVersion?.publishedAt ?? null
        };
      })
    );

    return {
      currentRuntimeSelection: this.startupConfig.selection,
      diskEffective: pickConfigEffectiveSnapshot(diskLoaded.config),
      runtimeEffective: pickConfigEffectiveSnapshot(this.startupConfig),
      runtimeState: this.getRuntimeState(diskLoaded.config),
      scopes: scopedVersions
    };
  }

  async getScope(scopeType: ConfigScopeType, scopeKey: string): Promise<ConfigScopeResponse> {
    const diskLoaded = this.loadResolvedConfig();
    const scope = this.resolveScope(diskLoaded.config, scopeType, scopeKey);
    const payload = await readJsonObject(scope.absolutePath);
    const activeVersion = await this.ensureScopeVersion(scope);
    const history = await this.repository.listVersions(scope.scopeType, scope.scopeKey, 20);

    return {
      activeVersion,
      diffFromRuntime: buildDiff(this.pickScopeEffective(scope.scopeType, this.startupConfig), this.pickScopeEffective(scope.scopeType, diskLoaded.config)),
      diskEffective: this.pickScopeEffective(scope.scopeType, diskLoaded.config),
      history,
      payload,
      runtimeEffective: this.pickScopeEffective(scope.scopeType, this.startupConfig),
      runtimeState: this.getRuntimeState(diskLoaded.config),
      scope
    };
  }

  async validateScopePayload(
    scopeType: ConfigScopeType,
    scopeKey: string,
    payload: Record<string, unknown>
  ): Promise<ConfigValidationResponse> {
    const diskLoaded = this.loadResolvedConfig();
    const scope = this.resolveScope(diskLoaded.config, scopeType, scopeKey);
    const validated = await this.validateCandidate(scope, payload);

    return {
      diff: buildDiff(await readJsonObject(scope.absolutePath), payload),
      diskEffective: this.pickScopeEffective(scope.scopeType, validated.config),
      runtimeState: this.getRuntimeState(validated.config),
      scope,
      validation: {
        details: [],
        valid: true
      }
    };
  }

  async applyScopePayload(input: {
    changeSummary?: string;
    payload: Record<string, unknown>;
    scopeKey: string;
    scopeType: ConfigScopeType;
  }): Promise<ConfigApplyResponse> {
    const diskLoaded = this.loadResolvedConfig();
    const scope = this.resolveScope(diskLoaded.config, input.scopeType, input.scopeKey);
    const currentPayload = await readJsonObject(scope.absolutePath);
    const validated = await this.validateCandidate(scope, input.payload);

    await writeJsonObject(scope.absolutePath, input.payload);

    const version = await this.repository.activateSnapshot({
      changeSummary: normalizeSummary(input.changeSummary) ?? "Applied from CMS configuration editor.",
      configHash: hashJson(input.payload),
      createdByUserId: null,
      payload: input.payload,
      scopeKey: scope.scopeKey,
      scopeType: scope.scopeType
    });

    return {
      diff: buildDiff(currentPayload, input.payload),
      diskEffective: this.pickScopeEffective(scope.scopeType, validated.config),
      runtimeState: this.getRuntimeState(validated.config),
      scope,
      validation: {
        details: [],
        valid: true
      },
      version
    };
  }

  async getVersionDiff(
    scopeType: ConfigScopeType,
    scopeKey: string,
    fromVersionId: string,
    toVersionId?: string
  ): Promise<ConfigVersionDiffResponse> {
    const diskLoaded = this.loadResolvedConfig();
    const scope = this.resolveScope(diskLoaded.config, scopeType, scopeKey);
    const fromVersion = await this.repository.findVersion(scope.scopeType, scope.scopeKey, fromVersionId);

    if (!fromVersion) {
      throw new Error("Configuration version was not found.");
    }

    const toVersion = toVersionId
      ? await this.repository.findVersion(scope.scopeType, scope.scopeKey, toVersionId)
      : await this.ensureScopeVersion(scope);

    if (!toVersion) {
      throw new Error("Comparison configuration version was not found.");
    }

    return {
      diff: buildDiff(fromVersion.payload, toVersion.payload),
      fromVersion,
      toVersion
    };
  }

  async rollbackScope(input: {
    changeSummary?: string;
    scopeKey: string;
    scopeType: ConfigScopeType;
    versionId: string;
  }): Promise<ConfigApplyResponse> {
    const diskLoaded = this.loadResolvedConfig();
    const scope = this.resolveScope(diskLoaded.config, input.scopeType, input.scopeKey);
    const targetVersion = await this.repository.findVersion(scope.scopeType, scope.scopeKey, input.versionId);

    if (!targetVersion) {
      throw new Error("Configuration version was not found.");
    }

    return this.applyScopePayload({
      changeSummary: normalizeSummary(input.changeSummary) ?? `Rollback to version ${targetVersion.versionNumber}.`,
      payload: targetVersion.payload,
      scopeKey: input.scopeKey,
      scopeType: input.scopeType
    });
  }

  private async ensureScopeVersion(scope: ConfigScopeDescriptor): Promise<ConfigVersionRecord | null> {
    const payload = await readJsonObject(scope.absolutePath);

    return this.repository.activateSnapshot({
      changeSummary: "Synchronized from file system.",
      configHash: hashJson(payload),
      createdByUserId: null,
      payload,
      scopeKey: scope.scopeKey,
      scopeType: scope.scopeType
    });
  }

  private getActiveScopes(config: CmsConfig): ConfigScopeDescriptor[] {
    return [
      {
        absolutePath: join(this.runtimeContext.configDirectory, "environments", `${config.selection.environment}.json`),
        description: "Environment-specific runtime overrides such as log level, secure cookies, and simulation posture.",
        editableSections: ["runtime", "auth", "gps", "gtfs", "featureFlags"],
        relativePath: `environments/${config.selection.environment}.json`,
        scopeKey: config.selection.environment,
        scopeType: "global",
        title: "Environment overrides"
      },
      {
        absolutePath: join(this.runtimeContext.configDirectory, "tenants", `${config.selection.tenantProfile}.json`),
        description: "Tenant-level branding, locale, operator identity, and deployment feature flags.",
        editableSections: ["tenant", "branding", "featureFlags"],
        relativePath: `tenants/${config.selection.tenantProfile}.json`,
        scopeKey: config.selection.tenantProfile,
        scopeType: "tenant",
        title: "Tenant profile"
      },
      {
        absolutePath: join(this.runtimeContext.configDirectory, "transport-profiles", `${config.selection.transportProfile}.json`),
        description: "Transport routing strategy, GPS source settings, GTFS defaults, and schedule resolution behavior.",
        editableSections: ["transport", "gps", "gtfs"],
        relativePath: `transport-profiles/${config.selection.transportProfile}.json`,
        scopeKey: config.selection.transportProfile,
        scopeType: "transport",
        title: "Transport profile"
      },
      {
        absolutePath: join(this.runtimeContext.configDirectory, "display-profiles", `${config.selection.displayProfile}.json`),
        description: "Display controller abstraction, mappings, templates, preview values, and message mode settings.",
        editableSections: ["ledDisplay"],
        relativePath: `display-profiles/${config.selection.displayProfile}.json`,
        scopeKey: config.selection.displayProfile,
        scopeType: "display",
        title: "Display profile"
      }
    ];
  }

  private getRuntimeState(diskConfig: CmsConfig): "in_sync" | "restart_required" {
    return hashJson(this.startupConfig) === hashJson(diskConfig)
      ? "in_sync"
      : "restart_required";
  }

  private loadResolvedConfig(configDirectory = this.runtimeContext.configDirectory): LoadedCmsConfig {
    const rawEnv: NodeJS.ProcessEnv = { ...process.env };
    rawEnv.CMS_CONFIG_DIR = configDirectory;

    return loadCmsConfig({ rawEnv });
  }

  private pickScopeEffective(scopeType: ConfigScopeType, config: CmsConfig): Record<string, unknown> {
    switch (scopeType) {
      case "global":
        return {
          auth: config.auth,
          featureFlags: config.featureFlags,
          gps: config.gps,
          gtfs: config.gtfs,
          runtime: config.runtime
        };
      case "tenant":
        return {
          branding: config.branding,
          featureFlags: config.featureFlags,
          tenant: config.tenant
        };
      case "transport":
        return {
          gps: config.gps,
          gtfs: config.gtfs,
          transport: config.transport
        };
      case "display":
        return {
          ledDisplay: config.ledDisplay
        };
      default:
        return {};
    }
  }

  private resolveScope(config: CmsConfig, scopeType: ConfigScopeType, scopeKey: string): ConfigScopeDescriptor {
    const scope = this.getActiveScopes(config).find((candidate) => candidate.scopeType === scopeType && candidate.scopeKey === scopeKey);

    if (!scope) {
      throw new Error("Configuration scope was not found for the active deployment selection.");
    }

    return scope;
  }

  private async validateCandidate(
    scope: ConfigScopeDescriptor,
    payload: Record<string, unknown>
  ): Promise<LoadedCmsConfig> {
    const workRoot = await mkdtemp(join(tmpdir(), "cmsfleet-config-validate-"));
    const stagedConfigRoot = join(workRoot, "config", "cms");

    try {
      await mkdir(join(workRoot, "config"), { recursive: true });
      await cp(this.runtimeContext.configDirectory, stagedConfigRoot, { recursive: true });
      const stagedPath = join(workRoot, "config", "cms", ...scope.relativePath.split("/"));
      await writeJsonObject(stagedPath, payload);
      return this.loadResolvedConfig(stagedConfigRoot);
    } catch (error) {
      if (error instanceof CmsConfigValidationError) {
        throw error;
      }

      throw error;
    } finally {
      await rm(workRoot, { force: true, recursive: true }).catch(() => undefined);
    }
  }
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown>> {
  const content = await readFile(filePath, "utf8");
  const parsed = JSON.parse(content) as unknown;

  if (!isPlainObject(parsed)) {
    throw new Error(`Configuration file must contain a JSON object: ${filePath}`);
  }

  return parsed;
}

async function writeJsonObject(filePath: string, payload: Record<string, unknown>): Promise<void> {
  const nextContent = `${JSON.stringify(payload, null, 2)}\n`;
  const temporaryPath = `${filePath}.tmp`;

  await writeFile(temporaryPath, nextContent, "utf8");
  await rename(temporaryPath, filePath);
}

function buildDiff(before: unknown, after: unknown): ConfigDiffResult {
  const items: ConfigDiffItem[] = [];
  walkDiff(before, after, "", items);

  return {
    changeCount: items.length,
    items: items.slice(0, DIFF_LIMIT),
    truncated: items.length > DIFF_LIMIT
  };
}

function walkDiff(before: unknown, after: unknown, path: string, items: ConfigDiffItem[]): void {
  if (items.length > DIFF_LIMIT) {
    return;
  }

  if (before === undefined && after === undefined) {
    return;
  }

  if (before === undefined) {
    items.push({ after, changeType: "added", path: path || "/" });
    return;
  }

  if (after === undefined) {
    items.push({ before, changeType: "removed", path: path || "/" });
    return;
  }

  if (Array.isArray(before) || Array.isArray(after)) {
    if (hashJson(before) !== hashJson(after)) {
      items.push({ after, before, changeType: "changed", path: path || "/" });
    }

    return;
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort((left, right) => left.localeCompare(right));

    for (const key of keys) {
      const nextPath = `${path}/${key}`;
      walkDiff(before[key], after[key], nextPath, items);

      if (items.length > DIFF_LIMIT) {
        return;
      }
    }

    return;
  }

  if (Object.is(before, after)) {
    return;
  }

  if (hashJson(before) !== hashJson(after)) {
    items.push({ after, before, changeType: "changed", path: path || "/" });
  }
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(normalizeJson(value))).digest("hex");
}

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJson(entry));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, normalizeJson(value[key])])
    );
  }

  return value;
}

function normalizeSummary(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "" ? trimmed : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readConfigScopeType(value: unknown): ConfigScopeType | null {
  return value === "global" || value === "tenant" || value === "transport" || value === "display"
    ? value
    : null;
}