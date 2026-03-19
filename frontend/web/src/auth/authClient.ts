import type {
  AdminDashboardResponse,
  AuditEvent,
  AuthMetadataResponse,
  AuthSessionResponse,
  LoginResponse,
  SessionUser
} from "./types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

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

export async function changePassword(currentPassword: string, nextPassword: string): Promise<void> {
  await request<void>("/api/auth/password", {
    body: JSON.stringify({ currentPassword, nextPassword }),
    method: "POST"
  });
}

export async function fetchAdminDashboard(): Promise<AdminDashboardResponse> {
  return request<AdminDashboardResponse>("/api/admin/dashboard");
}

export async function fetchAuditEvents(limit = 25): Promise<AuditEvent[]> {
  const response = await request<{ events: AuditEvent[] }>(`/api/admin/audit-events?limit=${limit}`);
  return response.events;
}

export async function fetchAuthMetadata(): Promise<AuthMetadataResponse> {
  return request<AuthMetadataResponse>("/api/auth/metadata");
}

export async function fetchSession(): Promise<SessionUser | null> {
  const response = await fetch(`${API_BASE_URL}/api/auth/session`, {
    credentials: "include"
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    const payload = await readPayload(response);
    throw new ApiError(payload.message ?? `Session check failed with status ${response.status}.`, response.status);
  }

  const payload = (await response.json()) as AuthSessionResponse;
  return payload.user;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>("/api/auth/login", {
    body: JSON.stringify({ email, password }),
    method: "POST"
  });
}

export async function logout(): Promise<void> {
  await request<void>("/api/auth/logout", {
    method: "POST"
  });
}
