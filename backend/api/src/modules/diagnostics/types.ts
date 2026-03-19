export type SystemEventSeverity = "debug" | "info" | "warn" | "error" | "critical";

export interface SystemEventRecord {
  component: string | null;
  createdAt: string;
  eventPayload: Record<string, unknown>;
  eventType: string;
  happenedAt: string;
  id: string;
  message: string;
  relatedEntityId: string | null;
  relatedEntityType: string | null;
  severity: SystemEventSeverity;
  source: string;
}

export interface SystemEventFilters {
  component?: string;
  limit: number;
  relatedEntityType?: string;
  search?: string;
  severity?: SystemEventSeverity;
  source?: string;
}
