import { ApiError } from "../auth/authClient";

import type { GpsStatusResponse, RecentGpsMessageRecord } from "./gpsTypes";

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

export async function fetchGpsMessages(limit = 20): Promise<RecentGpsMessageRecord[]> {
  const response = await request<{ messages: RecentGpsMessageRecord[] }>(`/api/admin/gps/messages?limit=${limit}`);
  return response.messages;
}

export async function fetchGpsStatus(): Promise<GpsStatusResponse> {
  return request<GpsStatusResponse>("/api/admin/gps/status");
}
