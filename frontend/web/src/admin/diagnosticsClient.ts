import type { SystemEventRecord, SystemEventSeverity } from "./diagnosticsTypes";
import { requestJson } from "../lib/apiClient";

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
  const response = await requestJson<{ events: SystemEventRecord[] }>(`/api/admin/system-events${suffix}`);
  return response.events;
}
