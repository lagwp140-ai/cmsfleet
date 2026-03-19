import { ApiError } from "../auth/authClient";

import type { SystemEventRecord, SystemEventSeverity } from "./diagnosticsTypes";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const payload = await readPayload(response);
    throw new ApiError(payload.message ?? `Request failed with status ${response.status}.`, response.status);
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

export async function fetchSystemEvents(filters: {
  component?: string;
  limit?: number;
  relatedEntityType?: string;
  search?: string;
  severity?: SystemEventSeverity;
  source?: string;
} = {}): Promise<SystemEventRecord[]> {
  const query = new URLSearchParams();

  if (filters.component) {
    query.set("component", filters.component);
  }

  if (typeof filters.limit === "number") {
    query.set("limit", String(filters.limit));
  }

  if (filters.relatedEntityType) {
    query.set("relatedEntityType", filters.relatedEntityType);
  }

  if (filters.search) {
    query.set("search", filters.search);
  }

  if (filters.severity) {
    query.set("severity", filters.severity);
  }

  if (filters.source) {
    query.set("source", filters.source);
  }

  const queryString = query.toString();
  const suffix = queryString === "" ? "" : `?${queryString}`;
  const response = await request<{ events: SystemEventRecord[] }>(`/api/admin/system-events${suffix}`);
  return response.events;
}
