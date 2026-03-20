import type { FastifyReply, FastifyRequest } from "fastify";

export interface ApiResponseMeta {
  method: string;
  path: string;
  requestId: string;
  statusCode: number;
  timestamp: string;
}

export interface ApiSuccessEnvelope<T> {
  data: T;
  meta: ApiResponseMeta;
  success: true;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    details?: unknown;
    message: string;
  };
  meta: ApiResponseMeta;
  success: false;
}

export interface ApiErrorLike {
  code: string;
  details?: unknown;
  message: string;
  statusCode: number;
}

export function createErrorEnvelope(request: FastifyRequest, error: ApiErrorLike): ApiErrorEnvelope {
  return {
    error: {
      code: error.code,
      details: error.details,
      message: error.message
    },
    meta: createResponseMeta(request, error.statusCode),
    success: false
  };
}

export function createSuccessEnvelope<T>(
  request: FastifyRequest,
  data: T,
  statusCode: number
): ApiSuccessEnvelope<T> {
  return {
    data,
    meta: createResponseMeta(request, statusCode),
    success: true
  };
}

export function extractErrorLike(
  request: FastifyRequest,
  payload: unknown,
  statusCode: number
): ApiErrorLike {
  if (isApiErrorEnvelope(payload)) {
    return {
      code: payload.error.code,
      details: payload.error.details,
      message: payload.error.message,
      statusCode
    };
  }

  const defaultMessage = defaultErrorMessage(statusCode, request.method, request.url);
  const defaultCode = defaultErrorCode(statusCode);

  if (!isPlainObject(payload)) {
    return {
      code: defaultCode,
      message: defaultMessage,
      statusCode
    };
  }

  const message = typeof payload.message === "string" && payload.message.trim() !== ""
    ? payload.message
    : defaultMessage;
  const code = typeof payload.code === "string" && payload.code.trim() !== ""
    ? payload.code
    : defaultCode;
  const details = "details" in payload ? payload.details : undefined;

  return {
    code,
    details,
    message,
    statusCode
  };
}

export function isApiEnvelope(payload: unknown): payload is ApiErrorEnvelope | ApiSuccessEnvelope<unknown> {
  return isPlainObject(payload) && typeof payload.success === "boolean";
}

export function isRawResponse(request: FastifyRequest, reply: FastifyReply, payload: unknown): boolean {
  if (payload === undefined || reply.statusCode === 204) {
    return true;
  }

  const routeConfig = (request.routeOptions as { config?: { rawResponse?: boolean } } | undefined)?.config;

  if (routeConfig?.rawResponse) {
    return true;
  }

  const contentType = String(reply.getHeader("content-type") ?? "").toLowerCase();

  if (contentType.includes("text/html") || contentType.includes("text/plain")) {
    return true;
  }

  return typeof payload === "string" || Buffer.isBuffer(payload) || payload instanceof Uint8Array;
}

function createResponseMeta(request: FastifyRequest, statusCode: number): ApiResponseMeta {
  return {
    method: request.method,
    path: ((request.routeOptions as { url?: string } | undefined)?.url) ?? request.url,
    requestId: request.id,
    statusCode,
    timestamp: new Date().toISOString()
  };
}

function defaultErrorCode(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return "bad_request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 422:
      return "validation_error";
    case 500:
    default:
      return "internal_error";
  }
}

function defaultErrorMessage(statusCode: number, method: string, url: string): string {
  switch (statusCode) {
    case 400:
      return "The request payload or parameters were invalid.";
    case 401:
      return "Authentication is required for this endpoint.";
    case 403:
      return "You do not have permission to perform this action.";
    case 404:
      return `Route ${method} ${url} was not found.`;
    case 409:
      return "The request conflicts with the current state of the resource.";
    case 422:
      return "The request failed validation.";
    case 500:
    default:
      return "An unexpected server error occurred.";
  }
}

function isApiErrorEnvelope(payload: unknown): payload is ApiErrorEnvelope {
  return isPlainObject(payload)
    && payload.success === false
    && isPlainObject(payload.error)
    && typeof payload.error.message === "string"
    && typeof payload.error.code === "string";
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}


