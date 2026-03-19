import { ApiError } from "../auth/authClient";
import type { AuditEvent } from "../auth/types";

import type {
  ManagedUserAuditResponse,
  ManagedUserListResponse,
  ManagedUserMutationInput,
  ManagedUserMutationResponse,
  ManagedUserRecord,
  UserListFilters
} from "./userTypes";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const payload = await readPayload(response);
    throw new ApiError(payload.message ?? `Request failed with status ${response.status}.`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function readPayload(response: Response): Promise<{ message?: string }> {
  try {
    return (await response.json()) as { message?: string };
  } catch {
    return {};
  }
}

export async function createManagedUser(input: ManagedUserMutationInput): Promise<ManagedUserMutationResponse> {
  return request<ManagedUserMutationResponse>("/api/admin/users", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function fetchManagedUserAudit(userId: string, limit = 25): Promise<AuditEvent[]> {
  const response = await request<ManagedUserAuditResponse>(`/api/admin/users/${userId}/audit-events?limit=${limit}`);
  return response.events;
}

export async function fetchManagedUsers(filters: UserListFilters = {}): Promise<ManagedUserRecord[]> {
  const query = new URLSearchParams();

  if (filters.search) {
    query.set("search", filters.search);
  }

  if (filters.role) {
    query.set("role", filters.role);
  }

  if (filters.status) {
    query.set("status", filters.status);
  }

  const queryString = query.toString();
  const querySuffix = queryString !== "" ? `?${queryString}` : "";
  const response = await request<ManagedUserListResponse>(`/api/admin/users${querySuffix}`);
  return response.users;
}

export async function resetManagedUserPassword(userId: string): Promise<ManagedUserMutationResponse> {
  return request<ManagedUserMutationResponse>(`/api/admin/users/${userId}/reset-password`, {
    method: "POST"
  });
}

export async function updateManagedUser(
  userId: string,
  input: ManagedUserMutationInput
): Promise<ManagedUserMutationResponse> {
  return request<ManagedUserMutationResponse>(`/api/admin/users/${userId}`, {
    body: JSON.stringify(input),
    method: "PATCH"
  });
}
