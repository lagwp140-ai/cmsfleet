import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import AjvImport, { type ErrorObject } from "ajv";
import addFormatsImport from "ajv-formats";

import { readLoaderEnvironment } from "./env.js";
import type { CmsConfig, ConfigSelection, LoadedCmsConfig, LoadCmsConfigOptions } from "./types.js";

const Ajv = AjvImport as unknown as typeof import("ajv").default;
const addFormats = addFormatsImport as unknown as typeof import("ajv-formats").default;

const PROFILE_DIRECTORY_MAP = {
  deviceProfile: "device-profiles",
  displayProfile: "display-profiles",
  tenantProfile: "tenants",
  transportProfile: "transport-profiles",
  vehicleProfile: "vehicle-profiles"
} satisfies Record<Exclude<keyof ConfigSelection, "environment">, string>;

const DEFAULT_LOCAL_SESSION_SECRET = "local-dev-session-secret-change-me-2026";
const DEFAULT_LOCAL_CSRF_SECRET = "local-dev-csrf-secret-change-me-2026";
const RESTRICTED_DATABASE_USERNAMES = new Set(["postgres", "root", "admin", "administrator"]);
const PLACEHOLDER_DATABASE_PASSWORDS = new Set(["", "postgres", "cmsfleet", "password", "changeme", "admin"]);

export class CmsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CmsConfigError";
  }
}

export class CmsConfigValidationError extends CmsConfigError {
  readonly details: string[];

  constructor(message: string, details: string[]) {
    super(message);
    this.name = "CmsConfigValidationError";
    this.details = details;
  }
}

export function loadCmsConfig(options: LoadCmsConfigOptions = {}): LoadedCmsConfig {
  const environment = readLoaderEnvironment(options.rawEnv);
  const cwd = options.cwd ?? process.cwd();
  const configDirectory = resolveConfigDirectory(environment.requestedConfigDir, cwd);
  const sources: string[] = [];

  const baseConfig = readJsonFile(join(configDirectory, "base.json"), sources);
  const environmentConfig = readJsonFile(
    join(configDirectory, "environments", `${environment.configEnvironment}.json`),
    sources
  );

  const initialConfig = deepMergeAll<Record<string, unknown>>(baseConfig, environmentConfig);
  const selection = resolveSelection(initialConfig, environment.configEnvironment, environment.selectionOverrides);

  const profileLayers = Object.entries(PROFILE_DIRECTORY_MAP).map(([selectionKey, directory]) =>
    readJsonFile(join(configDirectory, directory, `${selection[selectionKey as keyof typeof PROFILE_DIRECTORY_MAP]}.json`), sources)
  );

  const overrideLayers = environment.overrideFiles.map((overrideFile) =>
    readJsonFile(resolveOverrideFile(configDirectory, overrideFile), sources)
  );

  const mergedConfig = deepMergeAll<Record<string, unknown>>(
    baseConfig,
    environmentConfig,
    ...profileLayers,
    ...overrideLayers,
    environment.typedOverrides,
    environment.dynamicOverrides,
    { selection }
  );

  validateConfig(mergedConfig, join(configDirectory, "schemas", "platform-config.schema.json"));

  const validatedConfig = mergedConfig as unknown as CmsConfig;
  validateResolvedConfig(validatedConfig);

  return {
    config: validatedConfig,
    context: {
      appEnv: environment.appEnv,
      configDirectory,
      nodeEnv: environment.nodeEnv,
      serviceName: environment.serviceName
    },
    sources
  };
}

function resolveConfigDirectory(requestedDirectory: string | undefined, cwd: string): string {
  if (requestedDirectory !== undefined) {
    const resolvedDirectory = isAbsolute(requestedDirectory)
      ? requestedDirectory
      : resolve(cwd, requestedDirectory);

    ensureConfigDirectory(resolvedDirectory);
    return resolvedDirectory;
  }

  let currentDirectory = resolve(cwd);

  while (true) {
    const candidateDirectory = join(currentDirectory, "config", "cms");

    if (existsSync(join(candidateDirectory, "base.json"))) {
      ensureConfigDirectory(candidateDirectory);
      return candidateDirectory;
    }

    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      break;
    }

    currentDirectory = parentDirectory;
  }

  throw new CmsConfigError(
    `Unable to locate the CMS configuration directory. Checked upward from: ${cwd}`
  );
}

function ensureConfigDirectory(configDirectory: string): void {
  const requiredFiles = [join(configDirectory, "base.json"), join(configDirectory, "schemas", "platform-config.schema.json")];

  for (const requiredFile of requiredFiles) {
    if (!existsSync(requiredFile)) {
      throw new CmsConfigError(`Configuration directory is missing required file: ${requiredFile}`);
    }
  }
}

function resolveOverrideFile(configDirectory: string, overrideFile: string): string {
  return isAbsolute(overrideFile) ? overrideFile : join(configDirectory, overrideFile);
}

function readJsonFile(filePath: string, sources?: string[]): unknown {
  if (!existsSync(filePath)) {
    throw new CmsConfigError(`Required configuration file is missing: ${filePath}`);
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    sources?.push(filePath);
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CmsConfigError(`Invalid JSON in configuration file ${filePath}: ${message}`);
  }
}

function resolveSelection(
  initialConfig: Record<string, unknown>,
  configEnvironment: ConfigSelection["environment"],
  overrides: Partial<Record<Exclude<keyof ConfigSelection, "environment">, string>>
): ConfigSelection {
  const selectionRoot = isPlainObject(initialConfig.selection) ? initialConfig.selection : {};

  return {
    environment: configEnvironment,
    tenantProfile: resolveProfileName(selectionRoot.tenantProfile, overrides.tenantProfile, "tenantProfile"),
    transportProfile: resolveProfileName(
      selectionRoot.transportProfile,
      overrides.transportProfile,
      "transportProfile"
    ),
    vehicleProfile: resolveProfileName(selectionRoot.vehicleProfile, overrides.vehicleProfile, "vehicleProfile"),
    deviceProfile: resolveProfileName(selectionRoot.deviceProfile, overrides.deviceProfile, "deviceProfile"),
    displayProfile: resolveProfileName(selectionRoot.displayProfile, overrides.displayProfile, "displayProfile")
  };
}

function resolveProfileName(
  seededValue: unknown,
  overrideValue: string | undefined,
  key: Exclude<keyof ConfigSelection, "environment">
): string {
  if (overrideValue !== undefined) {
    return overrideValue;
  }

  if (typeof seededValue === "string" && seededValue.trim() !== "") {
    return seededValue.trim();
  }

  throw new CmsConfigError(`Configuration selection is missing a value for ${key}.`);
}

function validateConfig(config: Record<string, unknown>, schemaPath: string): void {
  const schema = readJsonFile(schemaPath) as object;
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);

  const validate = ajv.compile(schema);

  if (!validate(config)) {
    const details = (validate.errors ?? []).map((error: ErrorObject) => {
      const instancePath = error.instancePath === "" ? "/" : error.instancePath;
      const params = error.params as { additionalProperty?: string };
      const extra =
        error.keyword === "additionalProperties" && typeof params.additionalProperty === "string"
          ? ` (${params.additionalProperty})`
          : "";

      return `${instancePath}: ${error.message ?? "validation error"}${extra}`;
    });

    throw new CmsConfigValidationError("CMS configuration failed validation.", details);
  }
}

function validateResolvedConfig(config: CmsConfig): void {
  const details: string[] = [];
  const isLocal = config.selection.environment === "local";
  const isProduction = config.selection.environment === "production";
  const isNonLocal = !isLocal;
  const sessionSecret = config.auth.session.secret.trim();
  const csrfSecret = config.auth.csrf.secret.trim();

  if (config.gps.offlineThresholdSeconds <= config.gps.freshnessThresholdSeconds) {
    details.push("/gps/offlineThresholdSeconds: must be greater than freshnessThresholdSeconds.");
  }

  if (config.gps.movementThresholdKph <= 0) {
    details.push("/gps/movementThresholdKph: must be greater than 0.");
  }

  if (config.runtime.api.corsOrigins.length === 0) {
    details.push("/runtime/api/corsOrigins: at least one allowed origin is required.");
  }

  if (config.runtime.api.corsOrigins.some((origin) => origin.trim() === "*")) {
    details.push("/runtime/api/corsOrigins: wildcard origins are not allowed when credentials are enabled.");
  }

  if (config.runtime.api.rateLimit.generalWindowSeconds < 10) {
    details.push("/runtime/api/rateLimit/generalWindowSeconds: must be at least 10 seconds.");
  }

  if (config.runtime.api.rateLimit.loginWindowSeconds < 10) {
    details.push("/runtime/api/rateLimit/loginWindowSeconds: must be at least 10 seconds.");
  }

  if (config.runtime.api.rateLimit.mutationWindowSeconds < 10) {
    details.push("/runtime/api/rateLimit/mutationWindowSeconds: must be at least 10 seconds.");
  }

  if (sessionSecret.length < 32) {
    details.push("/auth/session/secret: use a value with at least 32 characters.");
  }

  if (csrfSecret.length < 32) {
    details.push("/auth/csrf/secret: use a value with at least 32 characters.");
  }

  if (!isLocal && sessionSecret === DEFAULT_LOCAL_SESSION_SECRET) {
    details.push("/auth/session/secret: non-local environments must override the placeholder session secret.");
  }

  if (!isLocal && csrfSecret === DEFAULT_LOCAL_CSRF_SECRET) {
    details.push("/auth/csrf/secret: non-local environments must override the placeholder CSRF secret.");
  }

  if (config.auth.session.sameSite === "none" && !config.auth.session.secureCookies) {
    details.push("/auth/session/sameSite: 'none' requires secureCookies to be enabled.");
  }

  if (!config.auth.csrf.headerName.startsWith("X-")) {
    details.push("/auth/csrf/headerName: must use an X- prefixed header name.");
  }

  if (!isLocal && config.auth.bootstrapUsersEnabled) {
    details.push("/auth/bootstrapUsersEnabled: bootstrap users must stay disabled outside local development.");
  }

  if (isProduction && !config.auth.session.secureCookies) {
    details.push("/auth/session/secureCookies: production requires secure cookies.");
  }

  validatePasswordPolicy(config, details, isNonLocal);
  validateDatabaseAccess(config, details, isLocal);

  if (details.length > 0) {
    throw new CmsConfigValidationError("CMS configuration failed runtime policy checks.", details);
  }
}

function validateDatabaseAccess(config: CmsConfig, details: string[], isLocal: boolean): void {
  let databaseUrl: URL;

  try {
    databaseUrl = new URL(config.runtime.database.url);
  } catch {
    details.push("/runtime/database/url: must be a valid PostgreSQL connection URL.");
    return;
  }

  if (!isLocal) {
    const username = decodeURIComponent(databaseUrl.username ?? "").trim().toLowerCase();
    const password = decodeURIComponent(databaseUrl.password ?? "").trim().toLowerCase();

    if (RESTRICTED_DATABASE_USERNAMES.has(username)) {
      details.push("/runtime/database/url: production-style environments must not run with a superuser database account.");
    }

    if (PLACEHOLDER_DATABASE_PASSWORDS.has(password)) {
      details.push("/runtime/database/url: non-local environments must use a non-placeholder database password.");
    }
  }
}

function validatePasswordPolicy(config: CmsConfig, details: string[], isNonLocal: boolean): void {
  const policy = config.auth.passwordPolicy;

  if (policy.maxLength < policy.minLength) {
    details.push("/auth/passwordPolicy/maxLength: must be greater than or equal to minLength.");
  }

  if (policy.maxLength > 256) {
    details.push("/auth/passwordPolicy/maxLength: must be less than or equal to 256.");
  }

  if (isNonLocal && policy.minLength < 12) {
    details.push("/auth/passwordPolicy/minLength: non-local environments require a minimum length of at least 12.");
  }

  if (isNonLocal && !policy.requireLowercase) {
    details.push("/auth/passwordPolicy/requireLowercase: non-local environments must require lowercase characters.");
  }

  if (isNonLocal && !policy.requireUppercase) {
    details.push("/auth/passwordPolicy/requireUppercase: non-local environments must require uppercase characters.");
  }

  if (isNonLocal && !policy.requireNumber) {
    details.push("/auth/passwordPolicy/requireNumber: non-local environments must require numeric characters.");
  }

  if (isNonLocal && !policy.requireSymbol) {
    details.push("/auth/passwordPolicy/requireSymbol: non-local environments must require symbol characters.");
  }
}

function deepMergeAll<T>(...layers: unknown[]): T {
  let result: unknown = {};

  for (const layer of layers) {
    result = deepMerge(result, layer);
  }

  return result as T;
}

function deepMerge(base: unknown, override: unknown): unknown {
  if (override === undefined) {
    return cloneValue(base);
  }

  if (Array.isArray(base) && Array.isArray(override)) {
    return override.map((item) => cloneValue(item));
  }

  if (isPlainObject(base) && isPlainObject(override)) {
    const mergedEntries = new Map<string, unknown>();

    for (const [key, value] of Object.entries(base)) {
      mergedEntries.set(key, cloneValue(value));
    }

    for (const [key, value] of Object.entries(override)) {
      const existingValue = mergedEntries.get(key);
      mergedEntries.set(key, existingValue === undefined ? cloneValue(value) : deepMerge(existingValue, value));
    }

    return Object.fromEntries(mergedEntries);
  }

  return cloneValue(override);
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T;
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)])) as T;
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
