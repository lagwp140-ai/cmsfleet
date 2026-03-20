const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const DEFAULT_CSRF_HEADER_NAME = "x-csrf-token";
const IN_FLIGHT_GET_REQUESTS = new Map<string, Promise<unknown>>();
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
const API_BASE_URL = resolveApiBaseUrl(RAW_API_BASE_URL);

let csrfHeaderName = DEFAULT_CSRF_HEADER_NAME;
let csrfToken: string | null = null;

interface ApiSuccessEnvelope<T> {
  data: T;
  meta: {
    method: string;
    path: string;
    requestId: string;
    statusCode: number;
    timestamp: string;
  };
  success: true;
}

interface ApiErrorEnvelope {
  error: {
    code: string;
    details?: unknown;
    message: string;
  };
  meta: {
    method: string;
    path: string;
    requestId: string;
    statusCode: number;
    timestamp: string;
  };
  success: false;
}

export class ApiError extends Error {
  readonly code?: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(message: string, status: number, options: { code?: string; details?: unknown } = {}) {
    super(message);
    this.code = options.code;
    this.details = options.details;
    this.name = "ApiError";
    this.status = status;
  }
}

export function clearCsrfToken(): void {
  csrfToken = null;
}

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers ?? {});
  const requestUrl = `${API_BASE_URL}${path}`;

  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (MUTATING_METHODS.has(method) && csrfToken) {
    headers.set(csrfHeaderName, csrfToken);
  }

  const requestInit: RequestInit = {
    credentials: "include",
    ...init,
    headers,
    method
  };

  if (method === "GET" && init.body === undefined) {
    const existingRequest = IN_FLIGHT_GET_REQUESTS.get(requestUrl);

    if (existingRequest) {
      return existingRequest as Promise<T>;
    }

    const pendingRequest = performJsonRequest<T>(requestUrl, requestInit).finally(() => {
      IN_FLIGHT_GET_REQUESTS.delete(requestUrl);
    });

    IN_FLIGHT_GET_REQUESTS.set(requestUrl, pendingRequest as Promise<unknown>);
    return pendingRequest;
  }

  return performJsonRequest<T>(requestUrl, requestInit);
}

async function performJsonRequest<T>(requestUrl: string, init: RequestInit): Promise<T> {
  const response = await fetch(requestUrl, init);

  captureCsrfToken(response);

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await readJson(response);

  if (!response.ok) {
    if (response.status === 401) {
      clearCsrfToken();
    }

    if (isApiErrorEnvelope(payload)) {
      throw new ApiError(formatApiErrorMessage(payload.error.message, payload.error.details), response.status, {
        code: payload.error.code,
        details: payload.error.details
      });
    }

    const fallbackMessage = isPlainObject(payload) && typeof payload.message === "string"
      ? payload.message
      : `Request failed with status ${response.status}.`;
    throw new ApiError(fallbackMessage, response.status);
  }

  if (isApiSuccessEnvelope<T>(payload)) {
    return payload.data;
  }

  return payload as T;
}

export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export { API_BASE_URL };

function captureCsrfToken(response: Response): void {
  const directToken = response.headers.get(csrfHeaderName) ?? response.headers.get(DEFAULT_CSRF_HEADER_NAME);

  if (directToken) {
    csrfToken = directToken;
    csrfHeaderName = directToken === response.headers.get(csrfHeaderName) ? csrfHeaderName : DEFAULT_CSRF_HEADER_NAME;
    return;
  }

  response.headers.forEach((value, key) => {
    if (csrfToken || !key.toLowerCase().includes("csrf")) {
      return;
    }

    csrfHeaderName = key;
    csrfToken = value;
  });
}

function formatApiErrorMessage(message: string, details: unknown): string {
  if (Array.isArray(details) && details.every((item) => typeof item === "string")) {
    const suffix = details.join(" ").trim();
    return suffix === "" ? message : `${message} ${suffix}`.trim();
  }

  return message;
}

function isApiErrorEnvelope(payload: unknown): payload is ApiErrorEnvelope {
  return isPlainObject(payload)
    && payload.success === false
    && isPlainObject(payload.error)
    && typeof payload.error.message === "string"
    && typeof payload.error.code === "string";
}

function isApiSuccessEnvelope<T>(payload: unknown): payload is ApiSuccessEnvelope<T> {
  return isPlainObject(payload) && payload.success === true && "data" in payload;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveApiBaseUrl(configuredValue: string): string {
  const normalizedValue = stripTrailingSlash(configuredValue);

  if (typeof window === "undefined") {
    return normalizedValue;
  }

  if (normalizedValue === "") {
    if (window.location.port === "5173" || window.location.port === "4173") {
      return `${window.location.protocol}//${window.location.hostname}:3000`;
    }

    return "";
  }

  try {
    const configuredUrl = new URL(normalizedValue, window.location.origin);

    if (shouldRewriteLoopbackHost(configuredUrl.hostname, window.location.hostname)) {
      configuredUrl.hostname = window.location.hostname;
      return stripTrailingSlash(configuredUrl.toString());
    }

    return stripTrailingSlash(configuredUrl.toString());
  } catch {
    return normalizedValue;
  }
}

function shouldRewriteLoopbackHost(apiHostname: string, pageHostname: string): boolean {
  return LOOPBACK_HOSTS.has(apiHostname.toLowerCase()) && !LOOPBACK_HOSTS.has(pageHostname.toLowerCase());
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}
