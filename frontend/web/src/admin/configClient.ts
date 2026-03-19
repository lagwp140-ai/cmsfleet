import { ApiError } from "../auth/authClient";

import type {
  ConfigApplyResponse,
  ConfigOverviewResponse,
  ConfigScopeResponse,
  ConfigScopeType,
  ConfigValidationResponse,
  ConfigVersionDiffResponse
} from "./configTypes";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    },
    ...options
  });

  if (!response.ok) {
    const payload = await readPayload(response);
    const detailSuffix = payload.details && payload.details.length > 0 ? ` ${payload.details.join(" ")}` : "";
    throw new ApiError(`${payload.message ?? `Request failed with status ${response.status}.`}${detailSuffix}`.trim(), response.status);
  }

  return (await response.json()) as T;
}

async function readPayload(response: Response): Promise<{ details?: string[]; message?: string }> {
  try {
    return (await response.json()) as { details?: string[]; message?: string };
  } catch {
    return {};
  }
}

export async function applyConfigScope(input: {
  changeSummary?: string;
  payload: Record<string, unknown>;
  scopeKey: string;
  scopeType: ConfigScopeType;
}): Promise<ConfigApplyResponse> {
  return request<ConfigApplyResponse>(`/api/admin/config/scopes/${input.scopeType}/${input.scopeKey}/apply`, {
    body: JSON.stringify({ changeSummary: input.changeSummary, payload: input.payload }),
    method: "POST"
  });
}

export async function fetchConfigDiff(input: {
  fromVersionId: string;
  scopeKey: string;
  scopeType: ConfigScopeType;
  toVersionId?: string;
}): Promise<ConfigVersionDiffResponse> {
  const query = new URLSearchParams({ fromVersionId: input.fromVersionId });

  if (input.toVersionId) {
    query.set("toVersionId", input.toVersionId);
  }

  return request<ConfigVersionDiffResponse>(`/api/admin/config/scopes/${input.scopeType}/${input.scopeKey}/diff?${query.toString()}`);
}

export async function fetchConfigOverview(): Promise<ConfigOverviewResponse> {
  return request<ConfigOverviewResponse>("/api/admin/config/overview");
}

export async function fetchConfigScope(scopeType: ConfigScopeType, scopeKey: string): Promise<ConfigScopeResponse> {
  return request<ConfigScopeResponse>(`/api/admin/config/scopes/${scopeType}/${scopeKey}`);
}

export async function rollbackConfigScope(input: {
  changeSummary?: string;
  scopeKey: string;
  scopeType: ConfigScopeType;
  versionId: string;
}): Promise<ConfigApplyResponse> {
  return request<ConfigApplyResponse>(`/api/admin/config/scopes/${input.scopeType}/${input.scopeKey}/rollback`, {
    body: JSON.stringify({ changeSummary: input.changeSummary, versionId: input.versionId }),
    method: "POST"
  });
}

export async function validateConfigScope(input: {
  payload: Record<string, unknown>;
  scopeKey: string;
  scopeType: ConfigScopeType;
}): Promise<ConfigValidationResponse> {
  return request<ConfigValidationResponse>(`/api/admin/config/scopes/${input.scopeType}/${input.scopeKey}/validate`, {
    body: JSON.stringify({ payload: input.payload }),
    method: "POST"
  });
}