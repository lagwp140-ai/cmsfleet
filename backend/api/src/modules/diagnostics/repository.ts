import type { Pool } from "pg";

import type { SystemEventFilters, SystemEventRecord } from "./types.js";

export class DiagnosticsRepository {
  constructor(private readonly pool: Pool) {}

  async listSystemEvents(filters: SystemEventFilters): Promise<SystemEventRecord[]> {
    const conditions: string[] = [];
    const values: Array<number | string> = [];

    if (filters.severity) {
      values.push(filters.severity);
      conditions.push(`severity = $${values.length}`);
    }

    if (filters.source) {
      values.push(filters.source);
      conditions.push(`source = $${values.length}`);
    }

    if (filters.component) {
      values.push(filters.component);
      conditions.push(`component = $${values.length}`);
    }

    if (filters.relatedEntityType) {
      values.push(filters.relatedEntityType);
      conditions.push(`related_entity_type = $${values.length}`);
    }

    if (filters.search) {
      values.push(`%${filters.search}%`);
      const placeholder = `$${values.length}`;
      conditions.push(`(
        event_type ILIKE ${placeholder}
        OR severity ILIKE ${placeholder}
        OR source ILIKE ${placeholder}
        OR COALESCE(component, '') ILIKE ${placeholder}
        OR message ILIKE ${placeholder}
        OR COALESCE(related_entity_type, '') ILIKE ${placeholder}
        OR COALESCE(related_entity_id, '') ILIKE ${placeholder}
        OR event_payload::text ILIKE ${placeholder}
      )`);
    }

    values.push(filters.limit);
    const limitPlaceholder = `$${values.length}`;
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await this.pool.query<SystemEventRecord>(
      `
        SELECT
          id::text AS id,
          event_type AS "eventType",
          severity,
          source,
          component,
          message,
          event_payload AS "eventPayload",
          related_entity_type AS "relatedEntityType",
          related_entity_id AS "relatedEntityId",
          happened_at::text AS "happenedAt",
          created_at::text AS "createdAt"
        FROM system.system_events
        ${whereClause}
        ORDER BY happened_at DESC, id DESC
        LIMIT ${limitPlaceholder}
      `,
      values
    );

    return result.rows;
  }
}
