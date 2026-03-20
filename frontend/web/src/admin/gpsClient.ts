import type { GpsStatusResponse, RecentGpsMessageRecord } from "./gpsTypes";
import { requestJson } from "../lib/apiClient";

export async function fetchGpsMessages(
  limit = 20,
  filters: { ingestStatus?: "accepted" | "duplicate" | "rejected"; search?: string } = {}
): Promise<RecentGpsMessageRecord[]> {
  const query = new URLSearchParams({ limit: String(limit) });

  if (filters.ingestStatus) {
    query.set("ingestStatus", filters.ingestStatus);
  }

  if (filters.search) {
    query.set("search", filters.search);
  }

  const response = await requestJson<{ messages: RecentGpsMessageRecord[] }>(`/api/admin/gps/messages?${query.toString()}`);
  return response.messages;
}

export async function fetchGpsStatus(): Promise<GpsStatusResponse> {
  return requestJson<GpsStatusResponse>("/api/admin/gps/status");
}
