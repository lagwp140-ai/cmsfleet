import { ApiError } from "../auth/authClient";

import type {
  DisplayCommandRequest,
  DisplayCommandResponse,
  DisplayDeliveryListResponse,
  DisplayDeliveryRecord,
  DisplayDomainResponse,
  DisplayQueueOverview
} from "./displayTypes";

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

export async function fetchDisplayAdapterStatus(): Promise<DisplayQueueOverview> {
  return request<DisplayQueueOverview>("/api/admin/displays/adapter-status");
}

export async function fetchDisplayDeliveries(
  limit = 20,
  filters: { search?: string; status?: "queued" | "processing" | "retry_waiting" | "delivered" | "failed" } = {}
): Promise<DisplayDeliveryRecord[]> {
  const query = new URLSearchParams({ limit: String(limit) });

  if (filters.search) {
    query.set("search", filters.search);
  }

  if (filters.status) {
    query.set("status", filters.status);
  }

  const response = await request<DisplayDeliveryListResponse>(`/api/admin/displays/deliveries?${query.toString()}`);
  return response.deliveries;
}

export async function fetchDisplayDomain(): Promise<DisplayDomainResponse> {
  return request<DisplayDomainResponse>("/api/admin/displays/domain");
}

export async function generateDisplayCommands(payload: DisplayCommandRequest): Promise<DisplayCommandResponse> {
  return request<DisplayCommandResponse>("/api/admin/displays/commands", {
    body: JSON.stringify(payload),
    method: "POST"
  });
}

