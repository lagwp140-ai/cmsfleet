import type { AppEnvironment, CmsConfig, ConfigRuntimeContext, ConfigSelection } from "./types.js";

const APP_ENVIRONMENTS = ["local", "test", "staging", "production"] as const;
const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace"] as const;
const NODE_ENVIRONMENTS = ["development", "test", "production"] as const;
const CONFIG_OVERRIDE_PREFIX = "CMS_CFG__";

type SelectionOverrideKey = Exclude<keyof ConfigSelection, "environment">;

export interface LoaderEnvironment extends ConfigRuntimeContext {
  configEnvironment: AppEnvironment;
  dynamicOverrides: Record<string, unknown>;
  overrideFiles: string[];
  requestedConfigDir?: string;
  selectionOverrides: Partial<Record<SelectionOverrideKey, string>>;
  typedOverrides: Partial<CmsConfig>;
}

export function readLoaderEnvironment(rawEnv: NodeJS.ProcessEnv = process.env): LoaderEnvironment {
  const appEnv = readEnum(rawEnv, "APP_ENV", APP_ENVIRONMENTS, "local");
  const configEnvironment = readEnum(rawEnv, "CMS_CONFIG_ENV", APP_ENVIRONMENTS, appEnv);
  const nodeEnv = readEnum(rawEnv, "NODE_ENV", NODE_ENVIRONMENTS, "development");
  const serviceName = readString(rawEnv, "SERVICE_NAME") ?? "cmsfleet-service";

  const dynamicOverrides = extractDynamicOverrides(rawEnv);
  const selectionOverrides = readSelectionOverrides(rawEnv, dynamicOverrides);

  return {
    appEnv,
    configEnvironment,
    configDirectory: "",
    dynamicOverrides: omitSelection(dynamicOverrides),
    nodeEnv,
    overrideFiles: splitCsv(readString(rawEnv, "CMS_CONFIG_OVERRIDES")),
    requestedConfigDir: readString(rawEnv, "CMS_CONFIG_DIR"),
    selectionOverrides,
    serviceName,
    typedOverrides: buildTypedOverrides(rawEnv)
  };
}

function buildTypedOverrides(rawEnv: NodeJS.ProcessEnv): Partial<CmsConfig> {
  const databaseUrl = readString(rawEnv, "CMS_DATABASE_URL") ?? readString(rawEnv, "DATABASE_URL");
  const apiPort = readPositiveInt(rawEnv, "CMS_API_PORT") ?? readPositiveInt(rawEnv, "PORT");
  const workerPollIntervalMs =
    readPositiveInt(rawEnv, "CMS_WORKER_POLL_INTERVAL_MS") ??
    readPositiveInt(rawEnv, "JOB_POLL_INTERVAL_MS");
  const logLevel =
    readOptionalEnum(rawEnv, "CMS_LOG_LEVEL", LOG_LEVELS) ?? readOptionalEnum(rawEnv, "LOG_LEVEL", LOG_LEVELS);
  const corsOrigins = splitCsv(readString(rawEnv, "CMS_CORS_ORIGINS") ?? readString(rawEnv, "CORS_ORIGINS"));
  const authSessionSecret = readString(rawEnv, "CMS_AUTH_SESSION_SECRET");
  const authCookieName = readString(rawEnv, "CMS_AUTH_COOKIE_NAME");
  const authSessionMaxAgeMinutes = readPositiveInt(rawEnv, "CMS_AUTH_SESSION_MAX_AGE_MINUTES");
  const authPasswordMinLength = readPositiveInt(rawEnv, "CMS_AUTH_PASSWORD_MIN_LENGTH");
  const authPasswordIterations = readPositiveInt(rawEnv, "CMS_AUTH_PASSWORD_ITERATIONS");
  const authSecureCookies = readBoolean(rawEnv, "CMS_AUTH_SECURE_COOKIES");
  const authBootstrapUsersEnabled = readBoolean(rawEnv, "CMS_AUTH_BOOTSTRAP_USERS_ENABLED");

  const overrides: Record<string, unknown> = {};

  if (databaseUrl !== undefined) {
    setPath(overrides, ["runtime", "database", "url"], databaseUrl);
  }

  if (apiPort !== undefined) {
    setPath(overrides, ["runtime", "api", "port"], apiPort);
  }

  if (workerPollIntervalMs !== undefined) {
    setPath(overrides, ["runtime", "worker", "pollIntervalMs"], workerPollIntervalMs);
  }

  if (logLevel !== undefined) {
    setPath(overrides, ["runtime", "observability", "logLevel"], logLevel);
  }

  if (corsOrigins.length > 0) {
    setPath(overrides, ["runtime", "api", "corsOrigins"], corsOrigins);
  }

  if (authSessionSecret !== undefined) {
    setPath(overrides, ["auth", "session", "secret"], authSessionSecret);
  }

  if (authCookieName !== undefined) {
    setPath(overrides, ["auth", "session", "cookieName"], authCookieName);
  }

  if (authSessionMaxAgeMinutes !== undefined) {
    setPath(overrides, ["auth", "session", "maxAgeMinutes"], authSessionMaxAgeMinutes);
  }

  if (authSecureCookies !== undefined) {
    setPath(overrides, ["auth", "session", "secureCookies"], authSecureCookies);
  }

  if (authPasswordMinLength !== undefined) {
    setPath(overrides, ["auth", "passwordPolicy", "minLength"], authPasswordMinLength);
  }

  if (authPasswordIterations !== undefined) {
    setPath(overrides, ["auth", "passwordPolicy", "iterations"], authPasswordIterations);
  }

  if (authBootstrapUsersEnabled !== undefined) {
    setPath(overrides, ["auth", "bootstrapUsersEnabled"], authBootstrapUsersEnabled);
  }

  return overrides as Partial<CmsConfig>;
}

function readSelectionOverrides(
  rawEnv: NodeJS.ProcessEnv,
  dynamicOverrides: Record<string, unknown>
): Partial<Record<SelectionOverrideKey, string>> {
  const selectionOverrideKeys: SelectionOverrideKey[] = [
    "tenantProfile",
    "transportProfile",
    "vehicleProfile",
    "deviceProfile",
    "displayProfile"
  ];

  const selectionOverrideMap: Record<SelectionOverrideKey, string | undefined> = {
    tenantProfile: readString(rawEnv, "CMS_CONFIG_TENANT_PROFILE"),
    transportProfile: readString(rawEnv, "CMS_CONFIG_TRANSPORT_PROFILE"),
    vehicleProfile: readString(rawEnv, "CMS_CONFIG_VEHICLE_PROFILE"),
    deviceProfile: readString(rawEnv, "CMS_CONFIG_DEVICE_PROFILE"),
    displayProfile: readString(rawEnv, "CMS_CONFIG_DISPLAY_PROFILE")
  };

  const dynamicSelection = isPlainObject(dynamicOverrides.selection) ? dynamicOverrides.selection : undefined;

  if (dynamicSelection && dynamicSelection.environment !== undefined) {
    throw new Error(
      "Use CMS_CONFIG_ENV to select an environment-specific configuration file. " +
        "CMS_CFG__selection__environment is not supported."
    );
  }

  for (const key of selectionOverrideKeys) {
    const dynamicValue = dynamicSelection?.[key];

    if (selectionOverrideMap[key] === undefined && typeof dynamicValue === "string" && dynamicValue.trim() !== "") {
      selectionOverrideMap[key] = dynamicValue.trim();
    }
  }

  return Object.fromEntries(
    selectionOverrideKeys
      .map((key) => [key, selectionOverrideMap[key]])
      .filter((entry): entry is [SelectionOverrideKey, string] => typeof entry[1] === "string")
  );
}

function omitSelection(overrides: Record<string, unknown>): Record<string, unknown> {
  const clone = cloneValue(overrides);

  if (isPlainObject(clone)) {
    delete clone.selection;
  }

  return isPlainObject(clone) ? clone : {};
}

function extractDynamicOverrides(rawEnv: NodeJS.ProcessEnv): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(rawEnv)) {
    if (!key.startsWith(CONFIG_OVERRIDE_PREFIX) || rawValue === undefined) {
      continue;
    }

    const path = key
      .slice(CONFIG_OVERRIDE_PREFIX.length)
      .split("__")
      .filter((segment) => segment.trim() !== "")
      .map(normalizeSegment);

    if (path.length === 0) {
      continue;
    }

    setPath(overrides, path, parseOverrideValue(rawValue));
  }

  return overrides;
}

function parseOverrideValue(rawValue: string): unknown {
  const value = rawValue.trim();

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (value === "null") {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  if (
    (value.startsWith("{") && value.endsWith("}")) ||
    (value.startsWith("[") && value.endsWith("]"))
  ) {
    return JSON.parse(value);
  }

  return value;
}

function normalizeSegment(segment: string): string {
  const parts = segment
    .trim()
    .toLowerCase()
    .split("_")
    .filter((part) => part !== "");

  return parts
    .map((part, index) => (index === 0 ? part : part.slice(0, 1).toUpperCase() + part.slice(1)))
    .join("");
}

function readEnum<const T extends readonly string[]>(
  rawEnv: NodeJS.ProcessEnv,
  key: string,
  values: T,
  fallback?: T[number]
): T[number] {
  const value = readString(rawEnv, key);

  if (value === undefined) {
    if (fallback !== undefined) {
      return fallback;
    }

    throw new Error(`Missing required environment variable: ${key}`);
  }

  if (!values.includes(value as T[number])) {
    throw new Error(`${key} must be one of: ${values.join(", ")}. Received: ${value}`);
  }

  return value as T[number];
}

function readOptionalEnum<const T extends readonly string[]>(
  rawEnv: NodeJS.ProcessEnv,
  key: string,
  values: T
): T[number] | undefined {
  const value = readString(rawEnv, key);

  if (value === undefined) {
    return undefined;
  }

  if (!values.includes(value as T[number])) {
    throw new Error(`${key} must be one of: ${values.join(", ")}. Received: ${value}`);
  }

  return value as T[number];
}

function readBoolean(rawEnv: NodeJS.ProcessEnv, key: string): boolean | undefined {
  const value = readString(rawEnv, key);

  if (value === undefined) {
    return undefined;
  }

  if (value !== "true" && value !== "false") {
    throw new Error(`${key} must be either true or false. Received: ${value}`);
  }

  return value === "true";
}

function readPositiveInt(rawEnv: NodeJS.ProcessEnv, key: string): number | undefined {
  const value = readString(rawEnv, key);

  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer. Received: ${value}`);
  }

  return parsed;
}

function readString(rawEnv: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = rawEnv[key];

  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function splitCsv(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

function setPath(target: Record<string, unknown>, path: string[], value: unknown): void {
  const leaf = path.at(-1);

  if (!leaf) {
    return;
  }

  let cursor: Record<string, unknown> = target;

  for (const segment of path.slice(0, -1)) {
    const existing = cursor[segment];

    if (!isPlainObject(existing)) {
      cursor[segment] = {};
    }

    cursor = cursor[segment] as Record<string, unknown>;
  }

  cursor[leaf] = value;
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
