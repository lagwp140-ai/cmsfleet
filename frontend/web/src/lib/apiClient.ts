const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const DEFAULT_CSRF_HEADER_NAME = "x-csrf-token";
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
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

type ApiRequestInit = RequestInit & {
  timeoutMs?: number;
};

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

export async function requestJson<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, ...requestOptions } = init;
  const method = (requestOptions.method ?? "GET").toUpperCase();
  const headers = new Headers(requestOptions.headers ?? {});
  const requestUrl = `${API_BASE_URL}${path}`;

  if (requestOptions.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (MUTATING_METHODS.has(method) && csrfToken) {
    headers.set(csrfHeaderName, csrfToken);
  }

  const requestInit: RequestInit = {
    credentials: "include",
    ...requestOptions,
    headers,
    method
  };

  if (method === "GET" && requestOptions.body === undefined) {
    const existingRequest = IN_FLIGHT_GET_REQUESTS.get(requestUrl);

    if (existingRequest) {
      return existingRequest as Promise<T>;
    }

    const pendingRequest = performJsonRequest<T>(requestUrl, requestInit, timeoutMs).finally(() => {
      IN_FLIGHT_GET_REQUESTS.delete(requestUrl);
    });

    IN_FLIGHT_GET_REQUESTS.set(requestUrl, pendingRequest as Promise<unknown>);
    return pendingRequest;
  }

  return performJsonRequest<T>(requestUrl, requestInit, timeoutMs);
}

async function performJsonRequest<T>(requestUrl: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const response = await fetchWithTimeout(requestUrl, init, timeoutMs);

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

async function fetchWithTimeout(requestUrl: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init.signal;
  const abortListener = () => controller.abort(externalSignal?.reason);
  const timeoutId = timeoutMs > 0
    ? setTimeout(() => controller.abort(new DOMException("Request timeout", "AbortError")), timeoutMs)
    : null;

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener("abort", abortListener, { once: true });
    }
  }

  try {
    return await fetch(requestUrl, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (isAbortLikeError(error) && !externalSignal?.aborted && timeoutMs > 0) {
      throw new ApiError(`Request timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`, 408, {
        code: "request_timeout"
      });
    }

    if (error instanceof TypeError) {
      throw new ApiError("Unable to reach the API. Check the backend address, CORS origins, and browser network access.", 0, {
        code: "network_error"
      });
    }

    throw error;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    if (externalSignal) {
      externalSignal.removeEventListener("abort", abortListener);
    }
  }
}

function formatApiErrorMessage(message: string, details: unknown): string {
  if (Array.isArray(details) && details.every((item) => typeof item === "string")) {
    const suffix = details.join(" ").trim();
    return suffix === "" ? message : `${message} ${suffix}`.trim();
  }

  return message;
}

function isAbortLikeError(value: unknown): boolean {
  return value instanceof DOMException && value.name === "AbortError";
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
