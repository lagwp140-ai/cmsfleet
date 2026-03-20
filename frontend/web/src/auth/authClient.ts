import type {
  AdminDashboardResponse,
  AuditEvent,
  AuthMetadataResponse,
  AuthSessionResponse,
  LoginResponse,
  SessionUser
} from "./types";
import { ApiError, clearCsrfToken, requestJson } from "../lib/apiClient";

export { ApiError } from "../lib/apiClient";

export async function changePassword(currentPassword: string, nextPassword: string): Promise<void> {
  await requestJson<void>("/api/auth/password", {
    body: JSON.stringify({ currentPassword, nextPassword }),
    method: "POST"
  });
}

export async function fetchAdminDashboard(): Promise<AdminDashboardResponse> {
  return requestJson<AdminDashboardResponse>("/api/admin/dashboard");
}

export async function fetchAuditEvents(
  limit = 25,
  filters: { search?: string; success?: boolean; type?: AuditEvent["type"]; userId?: string } = {}
): Promise<AuditEvent[]> {
  const query = new URLSearchParams({ limit: String(limit) });

  if (filters.search) {
    query.set("search", filters.search);
  }

  if (filters.success !== undefined) {
    query.set("success", String(filters.success));
  }

  if (filters.type) {
    query.set("type", filters.type);
  }

  if (filters.userId) {
    query.set("userId", filters.userId);
  }

  const response = await requestJson<{ events: AuditEvent[] }>(`/api/admin/audit-events?${query.toString()}`);
  return response.events;
}

export async function fetchAuthMetadata(): Promise<AuthMetadataResponse> {
  return requestJson<AuthMetadataResponse>("/api/auth/metadata");
}

export async function fetchSession(): Promise<SessionUser | null> {
  try {
    const payload = await requestJson<AuthSessionResponse>("/api/auth/session");
    return payload.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  clearCsrfToken();

  return requestJson<LoginResponse>("/api/auth/login", {
    body: JSON.stringify({ email, password }),
    method: "POST"
  });
}

export async function logout(): Promise<void> {
  try {
    await requestJson<void>("/api/auth/logout", {
      method: "POST"
    });
  } finally {
    clearCsrfToken();
  }
}

