export type GtfsImportSourceType = "upload" | "local_path" | "remote_url" | "scheduled_sync";
export type GtfsImportActivationMode = "manual" | "activate_on_success" | "rollback";
export type GtfsImportJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type GtfsDatasetStatus = "staged" | "validated" | "active" | "archived" | "failed";

export interface GtfsImportJobRecord {
  activationMode: GtfsImportActivationMode;
  createdAt: string;
  datasetId: string | null;
  errorMessage: string | null;
  feedVersion: string | null;
  finishedAt: string | null;
  id: string;
  requestedByUserId: string | null;
  rowsProcessed: number;
  routeCount: number;
  sourceType: GtfsImportSourceType;
  sourceUri: string;
  startedAt: string | null;
  status: GtfsImportJobStatus;
  stopCount: number;
  stopTimeCount: number;
  summary: Record<string, unknown>;
  tripCount: number;
  validationErrorCount: number;
  warningCount: number;
}

export interface GtfsDatasetRecord {
  activatedAt: string | null;
  activatedByUserId: string | null;
  createdAt: string;
  datasetLabel: string;
  feedHash: string | null;
  fileName: string | null;
  id: string;
  importJobId: string;
  isActive: boolean;
  previousDatasetId: string | null;
  routeCount: number;
  sourceType: GtfsImportSourceType;
  sourceUri: string | null;
  status: GtfsDatasetStatus;
  stopCount: number;
  stopTimeCount: number;
  summary: Record<string, unknown>;
  tripCount: number;
  validationSummary: Record<string, unknown>;
}

export interface GtfsImportErrorRecord {
  createdAt: string;
  entityKey: string | null;
  fieldName: string | null;
  fileName: string;
  id: string;
  importJobId: string;
  message: string;
  rawRow: Record<string, unknown>;
  rowNumber: number | null;
  severity: "error" | "warn";
}

export interface GtfsOverviewResponse {
  activeDataset: GtfsDatasetRecord | null;
  datasets: GtfsDatasetRecord[];
  jobs: GtfsImportJobRecord[];
}

export interface GtfsImportResult {
  datasetId: string | null;
  jobId: string;
  status: string;
}
