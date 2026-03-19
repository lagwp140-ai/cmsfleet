import type { CmsConfig } from "@cmsfleet/config-runtime";
import type { FastifyBaseLogger } from "fastify";
import type { PoolClient } from "pg";

import { GpsPayloadValidationError, normalizeHttpGpsPayload } from "./normalizer.js";
import { GpsRepository } from "./repository.js";
import { deriveOperationalState } from "./state-deriver.js";
import type {
  GpsConnectionState,
  GpsIngestionAdapter,
  GpsIngestionResult,
  GpsMessageFilters,
  GpsStatusSummary,
  GpsVehicleStatusRecord,
  NormalizedGpsMessage,
  RecentGpsMessageRecord,
  RejectedGpsMessageInput,
  StoredOperationalStateRecord
} from "./types.js";

interface GpsIngestionContext {
  adapter: GpsIngestionAdapter;
  ipAddress?: string;
  userAgent?: string;
}

export class GpsIngestionService {
  constructor(
    private readonly config: CmsConfig,
    private readonly logger: FastifyBaseLogger,
    private readonly repository: GpsRepository
  ) {}

  async ingestHttpPayload(body: unknown, context: GpsIngestionContext): Promise<{ httpStatus: number; payload: GpsIngestionResult }> {
    const receivedAt = new Date().toISOString();
    let normalized: NormalizedGpsMessage;

    try {
      normalized = normalizeHttpGpsPayload(body, {
        adapter: context.adapter,
        receivedAt,
        sourceName: this.config.gps.provider,
        vehicleIdField: this.config.gps.vehicleIdField
      });
    } catch (error) {
      if (error instanceof GpsPayloadValidationError) {
        const rejectedMessage = enrichRejectedPayload(error.payload, context);
        const messageId = await this.storeRejectedMessage(rejectedMessage, null, "rejected");

        this.logger.warn(
          {
            gpsMessageId: messageId,
            reason: rejectedMessage.reason
          },
          "Rejected GPS payload"
        );

        return {
          httpStatus: 422,
          payload: {
            connectionState: null,
            message: error.message,
            messageId,
            movementState: null,
            positionUpdated: false,
            receivedAt,
            status: "rejected"
          }
        };
      }

      throw error;
    }

    const vehicle = await this.repository.findVehicleByIdentifier(normalized.vehicleIdentifier);

    if (!vehicle) {
      const rejectedMessage = enrichRejectedPayload(
        {
          ...normalized,
          reason: "unknown_vehicle"
        },
        context
      );
      const messageId = await this.storeRejectedMessage(rejectedMessage, null, "rejected");

      this.logger.warn(
        {
          gpsMessageId: messageId,
          vehicleIdentifier: normalized.vehicleIdentifier
        },
        "Rejected GPS payload for unknown vehicle"
      );

      return {
        httpStatus: 422,
        payload: {
          connectionState: null,
          message: `Vehicle ${normalized.vehicleIdentifier} is not registered.`,
          messageId,
          movementState: null,
          positionUpdated: false,
          receivedAt,
          status: "rejected"
        }
      };
    }

    if (normalized.providerMessageId) {
      const existingMessageId = await this.repository.findDuplicateMessage(
        normalized.sourceName,
        normalized.providerMessageId
      );

      if (existingMessageId) {
        const duplicateMessage = enrichRejectedPayload(
          {
            ...normalized,
            reason: "duplicate_provider_message_id"
          },
          context
        );
        const messageId = await this.storeRejectedMessage(duplicateMessage, vehicle.id, "duplicate");
        await this.repository.touchOperationalHeartbeat({
          lastReceivedMessageId: messageId,
          lastSeenAt: normalized.receivedAt,
          sourceName: normalized.sourceName,
          vehicleId: vehicle.id
        });

        this.logger.info(
          {
            duplicateOf: existingMessageId,
            gpsMessageId: messageId,
            vehicleCode: vehicle.vehicleCode
          },
          "Duplicate GPS payload received"
        );

        return {
          httpStatus: 202,
          payload: {
            connectionState: "online",
            message: "Duplicate GPS message stored for audit but not applied to live position.",
            messageId,
            movementState: null,
            positionUpdated: false,
            receivedAt,
            status: "duplicate",
            vehicleCode: vehicle.vehicleCode,
            vehicleId: vehicle.id
          }
        };
      }
    }

    const persisted = await this.persistAcceptedMessage(normalized, vehicle.id);

    this.logger.info(
      {
        connectionState: "online",
        gpsMessageId: persisted.messageId,
        movementState: persisted.operationalState.movementState,
        positionApplied: persisted.positionApplied,
        positionUpdated: persisted.positionUpdated,
        vehicleCode: vehicle.vehicleCode,
        vehicleId: vehicle.id
      },
      "Accepted GPS payload"
    );

    return {
      httpStatus: 202,
      payload: {
        connectionState: classifyConnectionState(0, this.config.gps.freshnessThresholdSeconds, this.config.gps.offlineThresholdSeconds),
        message: persisted.positionUpdated
          ? "GPS message accepted and vehicle operational state updated."
          : "GPS message accepted and last-seen state updated without replacing a newer position.",
        messageId: persisted.messageId,
        movementState: persisted.operationalState.movementState,
        positionUpdated: persisted.positionUpdated,
        receivedAt,
        status: "accepted",
        vehicleCode: vehicle.vehicleCode,
        vehicleId: vehicle.id
      }
    };
  }

  async listRecentMessages(limit: number, filters: GpsMessageFilters = {}): Promise<RecentGpsMessageRecord[]> {
    return this.repository.listRecentMessages(limit, filters);
  }

  async listVehicleStatuses(): Promise<{
    summary: GpsStatusSummary;
    vehicles: GpsVehicleStatusRecord[];
  }> {
    const now = new Date();
    const rows = await this.repository.listVehicleStatuses();
    const vehicles = rows.map((row) => {
      const freshnessSeconds = row.lastSeenAt ? computeFreshnessSeconds(row.lastSeenAt, now) : null;
      const connectionState = classifyConnectionState(
        freshnessSeconds,
        this.config.gps.freshnessThresholdSeconds,
        this.config.gps.offlineThresholdSeconds
      );

      return {
        connectionState,
        externalVehicleId: row.externalVehicleId,
        freshnessSeconds,
        headingDeg: row.headingDeg,
        isEnabled: row.isEnabled,
        isOffline: connectionState === "offline",
        isStale: connectionState === "stale" || connectionState === "offline",
        label: row.label,
        lastSeenAt: row.lastSeenAt,
        latitude: row.latitude,
        longitude: row.longitude,
        movementState: row.movementState ?? "unknown",
        operationalStatus: row.operationalStatus,
        positionTime: row.positionTime,
        registrationPlate: row.registrationPlate,
        routeOverrideMode: row.routeOverrideMode,
        sourceName: row.sourceName,
        speedKph: row.speedKph,
        transportProfileKey: row.transportProfileKey,
        vehicleCode: row.vehicleCode,
        vehicleId: row.vehicleId
      } satisfies GpsVehicleStatusRecord;
    });

    return {
      summary: buildStatusSummary(vehicles),
      vehicles
    };
  }

  private async persistAcceptedMessage(
    normalized: NormalizedGpsMessage,
    vehicleId: string
  ): Promise<{
    messageId: string;
    operationalState: StoredOperationalStateRecord;
    positionApplied: boolean;
    positionUpdated: boolean;
  }> {
    const client = await this.repository.connect();

    try {
      await client.query("BEGIN");
      const previousState = await this.repository.getOperationalState(client, vehicleId);
      const inserted = await this.repository.insertAcceptedMessage(client, normalized, vehicleId);
      const positionUpdated = await this.repository.upsertVehiclePosition(client, {
        headingDeg: normalized.headingDeg,
        lastGpsMessageId: inserted.id,
        latitude: normalized.latitude,
        longitude: normalized.longitude,
        positionTime: normalized.positionTime,
        receivedAt: normalized.receivedAt,
        sourceName: normalized.sourceName,
        speedKph: normalized.speedKph,
        vehicleId
      });
      const derived = deriveOperationalState({
        lastReceivedMessageId: inserted.id,
        movementThresholdKph: this.config.gps.movementThresholdKph,
        normalized,
        previousState,
        vehicleId
      });
      await this.repository.upsertOperationalState(client, derived.state);
      await client.query("COMMIT");

      return {
        messageId: inserted.id,
        operationalState: {
          ...derived.state,
          updatedAt: normalized.receivedAt
        },
        positionApplied: derived.positionApplied,
        positionUpdated
      };
    } catch (error) {
      await rollbackQuietly(client, this.logger);
      await this.recordSystemEventQuietly({
        component: "gps-processing",
        eventPayload: {
          error: error instanceof Error ? error.message : String(error),
          vehicleId
        },
        eventType: "gps_processing_failure",
        message: "Failed to persist accepted GPS message and derived operational state.",
        relatedEntityId: vehicleId,
        relatedEntityType: "vehicle",
        severity: "error"
      });
      throw error;
    } finally {
      client.release();
    }
  }

  private async recordSystemEventQuietly(input: {
    component: string;
    eventPayload: Record<string, unknown>;
    eventType: string;
    message: string;
    relatedEntityId?: string | null;
    relatedEntityType?: string | null;
    severity: "debug" | "info" | "warn" | "error" | "critical";
  }): Promise<void> {
    try {
      await this.repository.recordSystemEvent(input);
    } catch (error) {
      this.logger.error({ err: error }, "Failed to record GPS system event");
    }
  }

  private async storeRejectedMessage(
    input: RejectedGpsMessageInput,
    vehicleId: string | null,
    ingestStatus: "duplicate" | "rejected"
  ): Promise<string> {
    const messageId = await this.repository.insertRejectedMessage(input, vehicleId, ingestStatus);

    await this.recordSystemEventQuietly({
      component: "gps-ingestion",
      eventPayload: {
        adapter: input.adapter,
        reason: input.reason,
        sourceName: input.sourceName,
        vehicleIdentifier: input.vehicleIdentifier
      },
      eventType: ingestStatus === "duplicate" ? "gps_ingest_duplicate" : "gps_ingest_rejected",
      message:
        ingestStatus === "duplicate"
          ? "Duplicate GPS payload received."
          : `Rejected GPS payload: ${input.reason}.`,
      relatedEntityId: vehicleId,
      relatedEntityType: vehicleId ? "vehicle" : "gps_message",
      severity: ingestStatus === "duplicate" ? "info" : "warn"
    });

    return messageId;
  }
}

function buildStatusSummary(vehicles: GpsVehicleStatusRecord[]): GpsStatusSummary {
  return vehicles.reduce<GpsStatusSummary>(
    (summary, vehicle) => {
      summary.trackedVehicles += 1;

      switch (vehicle.connectionState) {
        case "online":
          summary.onlineVehicles += 1;
          break;
        case "stale":
          summary.staleVehicles += 1;
          break;
        case "offline":
          summary.offlineVehicles += 1;
          break;
        case "unknown":
          summary.unknownVehicles += 1;
          break;
      }

      switch (vehicle.movementState) {
        case "moving":
          summary.movingVehicles += 1;
          break;
        case "stopped":
          summary.stoppedVehicles += 1;
          break;
      }

      return summary;
    },
    {
      movingVehicles: 0,
      offlineVehicles: 0,
      onlineVehicles: 0,
      staleVehicles: 0,
      stoppedVehicles: 0,
      trackedVehicles: 0,
      unknownVehicles: 0
    }
  );
}

export function classifyConnectionState(
  freshnessSeconds: number | null,
  freshnessThresholdSeconds: number,
  offlineThresholdSeconds: number
): GpsConnectionState {
  if (freshnessSeconds === null) {
    return "unknown";
  }

  if (freshnessSeconds <= freshnessThresholdSeconds) {
    return "online";
  }

  if (freshnessSeconds <= offlineThresholdSeconds) {
    return "stale";
  }

  return "offline";
}

export function computeFreshnessSeconds(timestamp: string, referenceTime = new Date()): number {
  const recordedAt = Date.parse(timestamp);
  const reference = referenceTime.getTime();

  if (Number.isNaN(recordedAt)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Math.max(0, Math.floor((reference - recordedAt) / 1000));
}

function enrichRejectedPayload(
  input: Omit<RejectedGpsMessageInput, "metadata"> & { metadata?: Record<string, unknown> },
  context: GpsIngestionContext
): RejectedGpsMessageInput {
  return {
    ...input,
    metadata: {
      ...(input.metadata ?? {}),
      ipAddress: context.ipAddress,
      transport: context.adapter,
      userAgent: context.userAgent
    }
  };
}

async function rollbackQuietly(client: PoolClient, logger: FastifyBaseLogger): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch (error) {
    logger.error({ err: error }, "Failed to roll back GPS transaction");
  }
}


