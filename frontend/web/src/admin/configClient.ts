import type {
  ConfigApplyResponse,
  ConfigOverviewResponse,
  ConfigScopeResponse,
  ConfigScopeType,
  ConfigValidationResponse,
  ConfigVersionDiffResponse
} from "./configTypes";
import { requestJson } from "../lib/apiClient";

export async function applyConfigScope(input: {
  changeSummary?: string;
  payload: Record<string, unknown>;
  scopeKey: string;
  scopeType: ConfigScopeType;
}): Promise<ConfigApplyResponse> {
  return requestJson<ConfigApplyResponse>(`/api/admin/config/scopes/${input.scopeType}/${input.scopeKey}/apply`, {
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

  return requestJson<ConfigVersionDiffResponse>(`/api/admin/config/scopes/${input.scopeType}/${input.scopeKey}/diff?${query.toString()}`);
}

export async function fetchConfigOverview(): Promise<ConfigOverviewResponse> {
  return requestJson<ConfigOverviewResponse>("/api/admin/config/overview");
}

export async function fetchConfigScope(scopeType: ConfigScopeType, scopeKey: string): Promise<ConfigScopeResponse> {
  return requestJson<ConfigScopeResponse>(`/api/admin/config/scopes/${scopeType}/${scopeKey}`);
}

export async function rollbackConfigScope(input: {
  changeSummary?: string;
  scopeKey: string;
  scopeType: ConfigScopeType;
  versionId: string;
}): Promise<ConfigApplyResponse> {
  return requestJson<ConfigApplyResponse>(`/api/admin/config/scopes/${input.scopeType}/${input.scopeKey}/rollback`, {
    body: JSON.stringify({ changeSummary: input.changeSummary, versionId: input.versionId }),
    method: "POST"
  });
}

export async function validateConfigScope(input: {
  payload: Record<string, unknown>;
  scopeKey: string;
  scopeType: ConfigScopeType;
}): Promise<ConfigValidationResponse> {
  return requestJson<ConfigValidationResponse>(`/api/admin/config/scopes/${input.scopeType}/${input.scopeKey}/validate`, {
    body: JSON.stringify({ payload: input.payload }),
    method: "POST"
  });
}
