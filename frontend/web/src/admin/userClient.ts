import type {
  ManagedUserAuditResponse,
  ManagedUserListResponse,
  ManagedUserMutationInput,
  ManagedUserMutationResponse,
  ManagedUserRecord,
  UserListFilters
} from "./userTypes";
import type { AuditEvent } from "../auth/types";
import { requestJson } from "../lib/apiClient";

export async function createManagedUser(input: ManagedUserMutationInput): Promise<ManagedUserMutationResponse> {
  return requestJson<ManagedUserMutationResponse>("/api/admin/users", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function fetchManagedUserAudit(userId: string, limit = 25): Promise<AuditEvent[]> {
  const response = await requestJson<ManagedUserAuditResponse>(`/api/admin/users/${userId}/audit-events?limit=${limit}`);
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
  const response = await requestJson<ManagedUserListResponse>(`/api/admin/users${querySuffix}`);
  return response.users;
}

export async function resetManagedUserPassword(userId: string): Promise<ManagedUserMutationResponse> {
  return requestJson<ManagedUserMutationResponse>(`/api/admin/users/${userId}/reset-password`, {
    method: "POST"
  });
}

export async function updateManagedUser(
  userId: string,
  input: ManagedUserMutationInput
): Promise<ManagedUserMutationResponse> {
  return requestJson<ManagedUserMutationResponse>(`/api/admin/users/${userId}`, {
    body: JSON.stringify(input),
    method: "PATCH"
  });
}
