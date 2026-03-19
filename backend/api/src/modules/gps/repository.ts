import type { Pool, PoolClient } from "pg";

import type {
  GpsIngestStatus,
  GpsMessageFilters,
  GpsMovementState,
  GpsVehicleStatusRecord,
  MatchedVehicleRecord,
  NormalizedGpsMessage,
  OperationalStateUpsertInput,
  RecentGpsMessageRecord,
  RejectedGpsMessageInput,
  StoredOperationalStateRecord
} from "./types.js";

interface PersistedGpsMessageRow {
  id: string;
  receivedAt: string;
}

interface GpsStatusRow {
  externalVehicleId: string | null;
  headingDeg: number | null;
  isEnabled: boolean;
  label: string;
  lastSeenAt: string | null;
  latitude: number | null;
  longitude: number | null;
  movementState: GpsMovementState | null;
  operationalStatus: GpsVehicleStatusRecord["operationalStatus"];
  positionTime: string | null;
  registrationPlate: string | null;
  routeOverrideMode: GpsVehicleStatusRecord["routeOverrideMode"];
  sourceName: string | null;
  speedKph: number | null;
  transportProfileKey: string;
  vehicleCode: string;
  vehicleId: string;
}

export class GpsRepository {
  constructor(private readonly pool: Pool) {}

  async connect(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async findDuplicateMessage(sourceName: string, providerMessageId: string): Promise<string | null> {
    const result = await this.pool.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM telemetry.gps_messages
        WHERE source_name = $1
          AND provider_message_id = $2
        ORDER BY received_at DESC
        LIMIT 1
      `,
      [sourceName, providerMessageId]
    );

    return result.rows[0]?.id ?? null;
  }

  async findVehicleByIdentifier(identifier: string): Promise<MatchedVehicleRecord | null> {
    const result = await this.pool.query<MatchedVehicleRecord>(
      `
        SELECT
          id,
          external_vehicle_id AS "externalVehicleId",
          is_enabled AS "isEnabled",
          label,
          status AS "operationalStatus",
          vehicle_code AS "vehicleCode"
        FROM fleet.vehicles
        WHERE id::text = $1
           OR vehicle_code = $1
           OR external_vehicle_id = $1
        ORDER BY
          CASE
            WHEN external_vehicle_id = $1 THEN 0
            WHEN vehicle_code = $1 THEN 1
            ELSE 2
          END,
          created_at ASC
        LIMIT 1
      `,
      [identifier]
    );

    return result.rows[0] ?? null;
  }

  async getOperationalState(client: PoolClient, vehicleId: string): Promise<StoredOperationalStateRecord | null> {
    const result = await client.query<StoredOperationalStateRecord>(
      `
        SELECT
          vehicle_id AS "vehicleId",
          last_received_message_id::text AS "lastReceivedMessageId",
          last_position_message_id::text AS "lastPositionMessageId",
          last_seen_at::text AS "lastSeenAt",
          position_time::text AS "positionTime",
          latitude::double precision AS latitude,
          longitude::double precision AS longitude,
          speed_kph::double precision AS "speedKph",
          heading_deg::double precision AS "headingDeg",
          movement_state AS "movementState",
          source_name AS "sourceName",
          processing_metadata AS "processingMetadata",
          extensions,
          updated_at::text AS "updatedAt"
        FROM telemetry.vehicle_operational_states
        WHERE vehicle_id = $1
      `,
      [vehicleId]
    );

    return result.rows[0] ?? null;
  }

  async insertAcceptedMessage(client: PoolClient, input: NormalizedGpsMessage, vehicleId: string): Promise<PersistedGpsMessageRow> {
    const result = await client.query<PersistedGpsMessageRow>(
      `
        INSERT INTO telemetry.gps_messages (
          source_name,
          provider_message_id,
          vehicle_id,
          received_at,
          position_time,
          latitude,
          longitude,
          speed_kph,
          heading_deg,
          accuracy_m,
          ingest_status,
          raw_payload,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'accepted', $11, $12)
        RETURNING id::text AS id, received_at::text AS "receivedAt"
      `,
      [
        input.sourceName,
        input.providerMessageId,
        vehicleId,
        input.receivedAt,
        input.positionTime,
        input.latitude,
        input.longitude,
        input.speedKph,
        input.headingDeg,
        input.accuracyM,
        input.rawPayload,
        input.metadata
      ]
    );

    return result.rows[0]!;
  }

  async touchOperationalHeartbeat(input: {
    lastReceivedMessageId: string;
    lastSeenAt: string;
    sourceName: string;
    vehicleId: string;
  }): Promise<void> {
    await this.pool.query(
      `
        UPDATE telemetry.vehicle_operational_states
        SET last_received_message_id = $2,
            last_seen_at = GREATEST(last_seen_at, $3::timestamptz),
            source_name = $4,
            updated_at = NOW()
        WHERE vehicle_id = $1
      `,
      [input.vehicleId, input.lastReceivedMessageId, input.lastSeenAt, input.sourceName]
    );
  }

  async insertRejectedMessage(input: RejectedGpsMessageInput, vehicleId: string | null, ingestStatus: GpsIngestStatus): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `
        INSERT INTO telemetry.gps_messages (
          source_name,
          provider_message_id,
          vehicle_id,
          received_at,
          position_time,
          latitude,
          longitude,
          speed_kph,
          heading_deg,
          accuracy_m,
          ingest_status,
          raw_payload,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id::text AS id
      `,
      [
        input.sourceName,
        input.providerMessageId,
        vehicleId,
        input.receivedAt,
        input.positionTime,
        input.latitude,
        input.longitude,
        input.speedKph,
        input.headingDeg,
        input.accuracyM,
        ingestStatus,
        input.rawPayload,
        {
          ...input.metadata,
          rejectionReason: input.reason
        }
      ]
    );

    return result.rows[0]!.id;
  }

  async listRecentMessages(limit: number, filters: GpsMessageFilters = {}): Promise<RecentGpsMessageRecord[]> {
    const conditions: string[] = [];
    const values: Array<number | string> = [];

    if (filters.ingestStatus) {
      values.push(filters.ingestStatus);
      conditions.push(`m.ingest_status = $${values.length}`);
    }

    if (filters.search) {
      values.push(`%${filters.search}%`);
      const placeholder = `$${values.length}`;
      conditions.push(`(
        m.source_name ILIKE ${placeholder}
        OR COALESCE(m.provider_message_id, '') ILIKE ${placeholder}
        OR COALESCE(v.vehicle_code, '') ILIKE ${placeholder}
        OR COALESCE(v.label, '') ILIKE ${placeholder}
        OR m.metadata::text ILIKE ${placeholder}
      )`);
    }

    values.push(limit);
    const limitPlaceholder = `$${values.length}`;
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await this.pool.query<RecentGpsMessageRecord>(
      `
        SELECT
          m.id::text AS id,
          m.source_name AS "sourceName",
          m.provider_message_id AS "providerMessageId",
          m.received_at::text AS "receivedAt",
          m.position_time::text AS "positionTime",
          m.ingest_status AS "ingestStatus",
          m.latitude::double precision AS latitude,
          m.longitude::double precision AS longitude,
          m.speed_kph::double precision AS "speedKph",
          m.heading_deg::double precision AS "headingDeg",
          m.accuracy_m::double precision AS "accuracyM",
          m.metadata,
          m.raw_payload AS "rawPayload",
          v.id AS "vehicleId",
          v.vehicle_code AS "vehicleCode",
          v.label AS "vehicleLabel"
        FROM telemetry.gps_messages m
        LEFT JOIN fleet.vehicles v ON v.id = m.vehicle_id
        ${whereClause}
        ORDER BY m.received_at DESC
        LIMIT ${limitPlaceholder}
      `,
      values
    );

    return result.rows;
  }

  async listVehicleStatuses(): Promise<GpsStatusRow[]> {
    const result = await this.pool.query<GpsStatusRow>(
      `
        SELECT
          v.id AS "vehicleId",
          v.vehicle_code AS "vehicleCode",
          v.label,
          v.external_vehicle_id AS "externalVehicleId",
          v.registration_plate AS "registrationPlate",
          v.status AS "operationalStatus",
          v.is_enabled AS "isEnabled",
          v.transport_profile_key AS "transportProfileKey",
          v.route_override_mode AS "routeOverrideMode",
          s.source_name AS "sourceName",
          s.last_seen_at::text AS "lastSeenAt",
          s.position_time::text AS "positionTime",
          s.latitude::double precision AS latitude,
          s.longitude::double precision AS longitude,
          s.speed_kph::double precision AS "speedKph",
          s.heading_deg::double precision AS "headingDeg",
          s.movement_state AS "movementState"
        FROM fleet.vehicles v
        LEFT JOIN telemetry.vehicle_operational_states s ON s.vehicle_id = v.id
        ORDER BY v.vehicle_code ASC, v.label ASC
      `
    );

    return result.rows;
  }

  async recordSystemEvent(input: {
    component: string;
    eventPayload: Record<string, unknown>;
    eventType: string;
    message: string;
    relatedEntityId?: string | null;
    relatedEntityType?: string | null;
    severity: "debug" | "info" | "warn" | "error" | "critical";
  }): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO system.system_events (
          event_type,
          severity,
          source,
          component,
          message,
          event_payload,
          related_entity_type,
          related_entity_id
        )
        VALUES ($1, $2, 'backend/api', $3, $4, $5, $6, $7)
      `,
      [
        input.eventType,
        input.severity,
        input.component,
        input.message,
        input.eventPayload,
        input.relatedEntityType ?? null,
        input.relatedEntityId ?? null
      ]
    );
  }

  async upsertOperationalState(client: PoolClient, input: OperationalStateUpsertInput): Promise<void> {
    await client.query(
      `
        INSERT INTO telemetry.vehicle_operational_states (
          vehicle_id,
          last_received_message_id,
          last_position_message_id,
          last_seen_at,
          position_time,
          latitude,
          longitude,
          speed_kph,
          heading_deg,
          movement_state,
          source_name,
          processing_metadata,
          extensions,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        ON CONFLICT (vehicle_id) DO UPDATE
        SET last_received_message_id = EXCLUDED.last_received_message_id,
            last_position_message_id = EXCLUDED.last_position_message_id,
            last_seen_at = EXCLUDED.last_seen_at,
            position_time = EXCLUDED.position_time,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            speed_kph = EXCLUDED.speed_kph,
            heading_deg = EXCLUDED.heading_deg,
            movement_state = EXCLUDED.movement_state,
            source_name = EXCLUDED.source_name,
            processing_metadata = EXCLUDED.processing_metadata,
            extensions = EXCLUDED.extensions,
            updated_at = NOW()
      `,
      [
        input.vehicleId,
        input.lastReceivedMessageId,
        input.lastPositionMessageId,
        input.lastSeenAt,
        input.positionTime,
        input.latitude,
        input.longitude,
        input.speedKph,
        input.headingDeg,
        input.movementState,
        input.sourceName,
        input.processingMetadata,
        input.extensions
      ]
    );
  }

  async upsertVehiclePosition(
    client: PoolClient,
    input: {
      headingDeg: number | null;
      lastGpsMessageId: string;
      latitude: number;
      longitude: number;
      positionTime: string;
      receivedAt: string;
      sourceName: string;
      speedKph: number | null;
      vehicleId: string;
    }
  ): Promise<boolean> {
    const result = await client.query<{ vehicleId: string }>(
      `
        INSERT INTO telemetry.vehicle_positions (
          vehicle_id,
          last_gps_message_id,
          last_gps_message_received_at,
          latitude,
          longitude,
          speed_kph,
          heading_deg,
          source_name,
          recorded_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (vehicle_id) DO UPDATE
        SET last_gps_message_id = EXCLUDED.last_gps_message_id,
            last_gps_message_received_at = EXCLUDED.last_gps_message_received_at,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            speed_kph = EXCLUDED.speed_kph,
            heading_deg = EXCLUDED.heading_deg,
            source_name = EXCLUDED.source_name,
            recorded_at = EXCLUDED.recorded_at,
            updated_at = NOW()
        WHERE EXCLUDED.recorded_at >= telemetry.vehicle_positions.recorded_at
        RETURNING vehicle_id AS "vehicleId"
      `,
      [
        input.vehicleId,
        input.lastGpsMessageId,
        input.receivedAt,
        input.latitude,
        input.longitude,
        input.speedKph,
        input.headingDeg,
        input.sourceName,
        input.positionTime
      ]
    );

    return (result.rowCount ?? 0) > 0;
  }
}



