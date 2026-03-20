import type { GtfsDatasetCatalogResponse, GtfsImportErrorRecord, GtfsImportResult, GtfsOverviewResponse, GtfsTripStopRecord } from "./gtfsTypes";
import { requestJson } from "../lib/apiClient";

export async function activateGtfsDataset(datasetId: string): Promise<void> {
  await requestJson<void>(`/api/admin/gtfs/datasets/${datasetId}/activate`, { method: "POST", timeoutMs: 30_000 });
}

export async function fetchGtfsDatasetCatalog(datasetId: string, routeId?: string): Promise<GtfsDatasetCatalogResponse> {
  const query = new URLSearchParams();

  if (routeId) {
    query.set("routeId", routeId);
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson<GtfsDatasetCatalogResponse>(`/api/admin/gtfs/datasets/${datasetId}/catalog${suffix}`, { timeoutMs: 20_000 });
}

export async function fetchGtfsTripStops(datasetId: string, tripId: string): Promise<GtfsTripStopRecord[]> {
  const response = await requestJson<{ stops: GtfsTripStopRecord[] }>(`/api/admin/gtfs/datasets/${datasetId}/trips/${tripId}/stops`, { timeoutMs: 20_000 });
  return response.stops;
}
export async function fetchGtfsErrors(jobId: string, limit = 200): Promise<GtfsImportErrorRecord[]> {
  const response = await requestJson<{ errors: GtfsImportErrorRecord[] }>(`/api/admin/gtfs/imports/${jobId}/errors?limit=${limit}`, { timeoutMs: 20_000 });
  return response.errors;
}

export async function fetchGtfsLogs(
  limit = 25,
  filters: { search?: string; status?: "queued" | "running" | "succeeded" | "failed" | "cancelled" } = {}
): Promise<GtfsOverviewResponse["jobs"]> {
  const query = new URLSearchParams({ limit: String(limit) });

  if (filters.search) {
    query.set("search", filters.search);
  }

  if (filters.status) {
    query.set("status", filters.status);
  }

  const response = await requestJson<{ jobs: GtfsOverviewResponse["jobs"] }>(`/api/admin/gtfs/logs?${query.toString()}`, { timeoutMs: 20_000 });
  return response.jobs;
}

export async function fetchGtfsOverview(): Promise<GtfsOverviewResponse> {
  return requestJson<GtfsOverviewResponse>("/api/admin/gtfs/overview?limit=25", { timeoutMs: 20_000 });
}

export async function importGtfsFromPath(input: { activateOnSuccess: boolean; datasetLabel?: string; filePath: string }): Promise<GtfsImportResult> {
  return requestJson<GtfsImportResult>("/api/admin/gtfs/imports/from-path", {
    body: JSON.stringify(input),
    method: "POST",
    timeoutMs: 300_000
  });
}

export async function importGtfsUpload(input: { activateOnSuccess: boolean; datasetLabel?: string; file: File }): Promise<GtfsImportResult> {
  const query = new URLSearchParams({
    activateOnSuccess: String(input.activateOnSuccess),
    fileName: input.file.name
  });

  if (input.datasetLabel) {
    query.set("datasetLabel", input.datasetLabel);
  }

  return requestJson<GtfsImportResult>(`/api/admin/gtfs/imports/upload?${query.toString()}`, {
    body: input.file,
    headers: {
      "Content-Type": input.file.type || "application/zip"
    },
    method: "POST",
    timeoutMs: 300_000
  });
}

export async function rollbackGtfsDataset(datasetId: string): Promise<void> {
  await requestJson<void>(`/api/admin/gtfs/datasets/${datasetId}/rollback`, { method: "POST", timeoutMs: 30_000 });
}
