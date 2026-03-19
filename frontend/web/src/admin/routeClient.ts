import { ApiError } from "../auth/authClient";

import type { RouteResolutionStatusResponse } from "./routeTypes";

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

export async function fetchRouteResolutionStatus(referenceTime?: string): Promise<RouteResolutionStatusResponse> {
  const query = referenceTime ? `?at=${encodeURIComponent(referenceTime)}` : "";
  return request<RouteResolutionStatusResponse>(`/api/admin/routes/status${query}`);
}
