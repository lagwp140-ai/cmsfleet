import type { FastifyError } from "fastify";

import type { ApiErrorLike } from "./contracts.js";

interface ValidationIssue {
  instancePath?: string;
  keyword?: string;
  message?: string;
  params?: Record<string, unknown>;
}

export class ApiProblem extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "ApiProblem";
    this.statusCode = statusCode;
  }
}

export function normalizeApiError(error: unknown): ApiErrorLike {
  if (error instanceof ApiProblem) {
    return {
      code: error.code,
      details: error.details,
      message: error.message,
      statusCode: error.statusCode
    };
  }

  if (isFastifyValidationError(error)) {
    return {
      code: "validation_error",
      details: error.validation.map((item) => formatValidationIssue(item)),
      message: "The request failed validation.",
      statusCode: 400
    };
  }

  if (isFastifyError(error) && error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
    return {
      code: mapStatusToCode(error.statusCode),
      message: error.message,
      statusCode: error.statusCode
    };
  }

  return {
    code: "internal_error",
    message: "An unexpected server error occurred.",
    statusCode: 500
  };
}

function formatValidationIssue(issue: ValidationIssue): string {
  const location = issue.instancePath && issue.instancePath !== ""
    ? issue.instancePath
    : issue.params?.missingProperty
      ? `/${String(issue.params.missingProperty)}`
      : "request";
  return `${location}: ${issue.message ?? issue.keyword ?? "validation error"}`;
}

function isFastifyError(error: unknown): error is FastifyError {
  return typeof error === "object" && error !== null && "message" in error;
}

function isFastifyValidationError(
  error: unknown
): error is FastifyError & { validation: ValidationIssue[] } {
  return typeof error === "object"
    && error !== null
    && "validation" in error
    && Array.isArray((error as { validation?: unknown }).validation);
}

function mapStatusToCode(statusCode: number): string {
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
    default:
      return "request_error";
  }
}
