const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const DEFAULT_CSRF_HEADER_NAME = "x-csrf-token";
const DEFAULT_PRIMARY_TIMEOUT_MS = 5_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const IN_FLIGHT_GET_REQUESTS = new Map<string, Promise<unknown>>();
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
const API_BASE_URLS = resolveApiBaseUrls(RAW_API_BASE_URL);

let csrfHeaderName = DEFAULT_CSRF_HEADER_NAME;
let csrfToken: string | null = null;
let preferredApiBaseUrl = API_BASE_URLS[0] ?? "";

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

export interface ApiAttemptDebugEntry {
  baseUrl: string;
  message: string;
  requestUrl: string;
  status?: number;
  timeoutMs: number;
}

export interface ApiDebugInfo {
  candidateBaseUrls: string[];
  configuredBaseUrl: string;
  path: string;
  preferredBaseUrl: string;
  requestUrls: string[];
  attempts: ApiAttemptDebugEntry[];
}

export class ApiError extends Error {
  readonly code?: string;
  readonly debug?: ApiDebugInfo;
  readonly details?: unknown;
  readonly status: number;

  constructor(message: string, status: number, options: { code?: string; debug?: ApiDebugInfo; details?: unknown } = {}) {
    super(message);
    this.code = options.code;
    this.debug = options.debug;
    this.details = options.details;
    this.name = "ApiError";
    this.status = status;
  }
}

export function clearCsrfToken(): void {
  csrfToken = null;
}

export function getApiDebugInfo(path: string): ApiDebugInfo {
  return buildApiDebugInfo(path, getCandidateApiBaseUrls());
}

export async function requestJson<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, ...requestOptions } = init;
  const method = (requestOptions.method ?? "GET").toUpperCase();
  const headers = new Headers(requestOptions.headers ?? {});
  const requestKey = `${preferredApiBaseUrl}${path}`;

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
    const existingRequest = IN_FLIGHT_GET_REQUESTS.get(requestKey);

    if (existingRequest) {
      return existingRequest as Promise<T>;
    }

    const pendingRequest = performJsonRequest<T>(path, requestInit, timeoutMs).finally(() => {
      IN_FLIGHT_GET_REQUESTS.delete(requestKey);
    });

    IN_FLIGHT_GET_REQUESTS.set(requestKey, pendingRequest as Promise<unknown>);
    return pendingRequest;
  }

  return performJsonRequest<T>(path, requestInit, timeoutMs);
}

async function performJsonRequest<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const attempt = await fetchWithFallback(path, init, timeoutMs);
  const { debug, response } = attempt;

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
        debug,
        details: payload.error.details
      });
    }

    const fallbackMessage = isPlainObject(payload) && typeof payload.message === "string"
      ? payload.message
      : `Request failed with status ${response.status}.`;
    throw new ApiError(fallbackMessage, response.status, { debug });
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

export const API_BASE_URL = preferredApiBaseUrl;

function buildApiDebugInfo(path: string, candidateBaseUrls: string[]): ApiDebugInfo {
  return {
    attempts: [],
    candidateBaseUrls,
    configuredBaseUrl: RAW_API_BASE_URL,
    path,
    preferredBaseUrl: preferredApiBaseUrl,
    requestUrls: candidateBaseUrls.map((baseUrl) => `${baseUrl}${path}`)
  };
}

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

async function fetchWithFallback(
  path: string,
  init: RequestInit,
  timeoutMs: number
): Promise<{ debug: ApiDebugInfo; response: Response }> {
  const candidates = getCandidateApiBaseUrls();
  const debug = buildApiDebugInfo(path, candidates);
  let lastError: unknown;

  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index] ?? "";
    const requestUrl = `${baseUrl}${path}`;
    const attemptTimeout = candidates.length > 1 && index === 0
      ? Math.min(timeoutMs, DEFAULT_PRIMARY_TIMEOUT_MS)
      : timeoutMs;

    try {
      const response = await fetchWithTimeout(requestUrl, init, attemptTimeout);
      debug.attempts.push({
        baseUrl,
        message: response.ok ? "response_ok" : `response_${response.status}`,
        requestUrl,
        status: response.status,
        timeoutMs: attemptTimeout
      });
      preferredApiBaseUrl = baseUrl;
      debug.preferredBaseUrl = preferredApiBaseUrl;
      return { debug, response };
    } catch (error) {
      const apiError = toApiError(error, debug);
      debug.attempts.push({
        baseUrl,
        message: apiError.code ?? apiError.name,
        requestUrl,
        status: apiError.status || undefined,
        timeoutMs: attemptTimeout
      });
      lastError = apiError;

      if (!shouldRetryWithAlternativeBase(apiError) || index === candidates.length - 1) {
        throw apiError;
      }
    }
  }

  throw toApiError(lastError, debug);
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
      throw new ApiError("Unable to reach the API. Check the backend address, proxy settings, and browser network access.", 0, {
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

function getCandidateApiBaseUrls(): string[] {
  if (preferredApiBaseUrl !== "") {
    return [preferredApiBaseUrl, ...API_BASE_URLS.filter((candidate) => candidate !== preferredApiBaseUrl)];
  }

  return [...new Set([preferredApiBaseUrl, ...API_BASE_URLS])];
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

function resolveApiBaseUrls(configuredValue: string): string[] {
  const normalizedValue = stripTrailingSlash(configuredValue);

  if (typeof window === "undefined") {
    return normalizedValue === "" ? [""] : ["", normalizedValue];
  }

  const candidates = [""];

  if (normalizedValue !== "") {
    try {
      const configuredUrl = new URL(normalizedValue, window.location.origin);

      if (shouldRewriteLoopbackHost(configuredUrl.hostname, window.location.hostname)) {
        configuredUrl.hostname = window.location.hostname;
      }

      candidates.push(stripTrailingSlash(configuredUrl.toString()));
    } catch {
      candidates.push(normalizedValue);
    }
  }

  const directBackendUrl = buildDirectBackendUrl();

  if (directBackendUrl) {
    candidates.push(directBackendUrl);
  }

  return [...new Set(candidates)];
}

function buildDirectBackendUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (window.location.port === "3000") {
    return null;
  }

  return `${window.location.protocol}//${window.location.hostname}:3000`;
}

function shouldRetryWithAlternativeBase(error: unknown): boolean {
  return error instanceof ApiError && (error.code === "network_error" || error.code === "request_timeout");
}

function shouldRewriteLoopbackHost(apiHostname: string, pageHostname: string): boolean {
  return LOOPBACK_HOSTS.has(apiHostname.toLowerCase()) && !LOOPBACK_HOSTS.has(pageHostname.toLowerCase());
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function toApiError(error: unknown, debug: ApiDebugInfo): ApiError {
  if (error instanceof ApiError) {
    return new ApiError(error.message, error.status, {
      code: error.code,
      debug,
      details: error.details
    });
  }

  if (error instanceof Error) {
    return new ApiError(error.message, 0, { debug });
  }

  return new ApiError("Unable to reach the API.", 0, {
    code: "network_error",
    debug
  });
}
