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

export interface GtfsOverview {
  activeDataset: GtfsDatasetRecord | null;
  datasets: GtfsDatasetRecord[];
  jobs: GtfsImportJobRecord[];
}

export interface GtfsImportUploadInput {
  activateOnSuccess: boolean;
  datasetLabel?: string;
  fileName: string;
  zipBuffer: Buffer;
}

export interface GtfsImportPathInput {
  activateOnSuccess: boolean;
  datasetLabel?: string;
  filePath: string;
}

export interface NormalizedGtfsRoute {
  agencyId: string;
  externalRouteId: string;
  rawRow: Record<string, string>;
  routeColor: string | null;
  routeLongName: string | null;
  routeShortName: string;
  routeTextColor: string | null;
  routeType: number;
  rowNumber: number;
  sortOrder: number | null;
}

export interface NormalizedGtfsStop {
  agencyId: string;
  externalStopId: string;
  latitude: number;
  longitude: number;
  parentExternalStopId: string | null;
  platformCode: string | null;
  rawRow: Record<string, string>;
  rowNumber: number;
  stopCode: string | null;
  stopDesc: string | null;
  stopName: string;
  timezone: string | null;
  wheelchairBoarding: number | null;
}

export interface NormalizedGtfsTrip {
  agencyId: string;
  bikesAllowed: number | null;
  blockId: string | null;
  directionId: number | null;
  externalTripId: string;
  rawRow: Record<string, string>;
  routeExternalId: string;
  rowNumber: number;
  serviceId: string;
  shapeId: string | null;
  tripHeadsign: string | null;
  tripShortName: string | null;
  variantCode: string;
  wheelchairAccessible: number | null;
}

export interface NormalizedGtfsStopTime {
  arrivalOffsetSeconds: number;
  departureOffsetSeconds: number;
  dropOffType: number | null;
  externalStopId: string;
  pickupType: number | null;
  rawRow: Record<string, string>;
  rowNumber: number;
  shapeDistTraveled: number | null;
  stopHeadsign: string | null;
  stopSequence: number;
  timepoint: boolean;
  tripExternalId: string;
}

export interface NormalizedGtfsServiceCalendar {
  endDate: string;
  friday: boolean;
  monday: boolean;
  rawRow: Record<string, string>;
  rowNumber: number;
  saturday: boolean;
  serviceId: string;
  startDate: string;
  sunday: boolean;
  thursday: boolean;
  tuesday: boolean;
  wednesday: boolean;
}

export interface NormalizedGtfsServiceCalendarDate {
  exceptionType: 1 | 2;
  rawRow: Record<string, string>;
  rowNumber: number;
  serviceDate: string;
  serviceId: string;
}

export interface ParsedGtfsFeed {
  routes: NormalizedGtfsRoute[];
  serviceCalendarDates: NormalizedGtfsServiceCalendarDate[];
  serviceCalendars: NormalizedGtfsServiceCalendar[];
  stopTimes: NormalizedGtfsStopTime[];
  stops: NormalizedGtfsStop[];
  trips: NormalizedGtfsTrip[];
}

export interface GtfsRouteCatalogRecord {
  agencyId: string;
  destinationCount: number;
  destinationHeadsigns: string[];
  directionNames: string[];
  externalRouteId: string;
  id: string;
  routeColor: string | null;
  routeLongName: string | null;
  routeShortName: string;
  routeTextColor: string | null;
  routeType: number;
  tripCount: number;
}

export interface GtfsTripCatalogRecord {
  bikesAllowed: number | null;
  blockId: string | null;
  directionId: number | null;
  directionName: string | null;
  endOffsetSeconds: number | null;
  externalTripId: string;
  headsign: string | null;
  id: string;
  routeId: string;
  routeLongName: string | null;
  routeShortName: string;
  serviceId: string;
  shapeId: string | null;
  shortName: string | null;
  startOffsetSeconds: number | null;
  stopCount: number;
  variantHeadsign: string | null;
  wheelchairAccessible: number | null;
}

export interface GtfsTripStopRecord {
  arrivalOffsetSeconds: number;
  departureOffsetSeconds: number;
  dropOffType: number | null;
  latitude: number;
  longitude: number;
  pickupType: number | null;
  stopCode: string | null;
  stopHeadsign: string | null;
  stopId: string;
  stopName: string;
  stopSequence: number;
}

export interface GtfsDatasetCatalog {
  dataset: GtfsDatasetRecord;
  routes: GtfsRouteCatalogRecord[];
  selectedRouteId: string | null;
  trips: GtfsTripCatalogRecord[];
}
export interface GtfsValidationIssue {
  entityKey: string | null;
  fieldName: string | null;
  fileName: string;
  message: string;
  rawRow: Record<string, unknown>;
  rowNumber: number | null;
  severity: "error" | "warn";
}

