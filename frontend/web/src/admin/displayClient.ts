import type {
  DisplayCommandRequest,
  DisplayCommandResponse,
  DisplayDeliveryListResponse,
  DisplayDeliveryRecord,
  DisplayDomainResponse,
  DisplayQueueOverview
} from "./displayTypes";
import { requestJson } from "../lib/apiClient";

export async function fetchDisplayAdapterStatus(): Promise<DisplayQueueOverview> {
  return requestJson<DisplayQueueOverview>("/api/admin/displays/adapter-status");
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

  const response = await requestJson<DisplayDeliveryListResponse>(`/api/admin/displays/deliveries?${query.toString()}`);
  return response.deliveries;
}

export async function fetchDisplayDomain(): Promise<DisplayDomainResponse> {
  return requestJson<DisplayDomainResponse>("/api/admin/displays/domain");
}

export async function generateDisplayCommands(payload: DisplayCommandRequest): Promise<DisplayCommandResponse> {
  return requestJson<DisplayCommandResponse>("/api/admin/displays/commands", {
    body: JSON.stringify(payload),
    method: "POST"
  });
}
