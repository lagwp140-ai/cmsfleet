import { ApiError } from "../auth/authClient";

import type { GtfsImportErrorRecord, GtfsImportResult, GtfsOverviewResponse } from "./gtfsTypes";

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

export async function activateGtfsDataset(datasetId: string): Promise<void> {
  await request<void>(`/api/admin/gtfs/datasets/${datasetId}/activate`, { method: "POST" });
}

export async function fetchGtfsErrors(jobId: string, limit = 200): Promise<GtfsImportErrorRecord[]> {
  const response = await request<{ errors: GtfsImportErrorRecord[] }>(`/api/admin/gtfs/imports/${jobId}/errors?limit=${limit}`);
  return response.errors;
}

export async function fetchGtfsOverview(): Promise<GtfsOverviewResponse> {
  return request<GtfsOverviewResponse>("/api/admin/gtfs/overview?limit=25");
}

export async function importGtfsFromPath(input: { activateOnSuccess: boolean; datasetLabel?: string; filePath: string }): Promise<GtfsImportResult> {
  return request<GtfsImportResult>("/api/admin/gtfs/imports/from-path", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function importGtfsUpload(input: { activateOnSuccess: boolean; datasetLabel?: string; fileName: string; zipBase64: string }): Promise<GtfsImportResult> {
  return request<GtfsImportResult>("/api/admin/gtfs/imports/upload", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function rollbackGtfsDataset(datasetId: string): Promise<void> {
  await request<void>(`/api/admin/gtfs/datasets/${datasetId}/rollback`, { method: "POST" });
}
