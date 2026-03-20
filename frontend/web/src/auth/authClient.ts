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
    method: "POST",
    timeoutMs: 20_000
  });
}

export async function fetchAdminDashboard(): Promise<AdminDashboardResponse> {
  return requestJson<AdminDashboardResponse>("/api/admin/dashboard", { timeoutMs: 15_000 });
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

  const response = await requestJson<{ events: AuditEvent[] }>(`/api/admin/audit-events?${query.toString()}`, { timeoutMs: 15_000 });
  return response.events;
}

export async function fetchAuthMetadata(): Promise<AuthMetadataResponse> {
  return requestJson<AuthMetadataResponse>("/api/auth/metadata", { timeoutMs: 8_000 });
}

export async function fetchSession(): Promise<SessionUser | null> {
  try {
    const payload = await requestJson<AuthSessionResponse>("/api/auth/session", { timeoutMs: 8_000 });
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
    method: "POST",
    timeoutMs: 20_000
  });
}

export async function logout(): Promise<void> {
  try {
    await requestJson<void>("/api/auth/logout", {
      method: "POST",
      timeoutMs: 10_000
    });
  } finally {
    clearCsrfToken();
  }
}
