import type { Pool, PoolClient } from "pg";

import type { ConfigScopeType, ConfigVersionRecord } from "./types.js";

interface ConfigVersionRow {
  change_summary: string | null;
  config_hash: string;
  created_at: Date | string;
  created_by_user_id: string | null;
  id: string;
  is_active: boolean;
  payload: Record<string, unknown>;
  published_at: Date | string | null;
  scope_key: string;
  scope_type: ConfigScopeType;
  version_number: number;
}

export class ConfigRepository {
  constructor(private readonly pool: Pool) {}

  async connect(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async findActiveVersion(scopeType: ConfigScopeType, scopeKey: string): Promise<ConfigVersionRecord | null> {
    const result = await this.pool.query<ConfigVersionRow>(
      `
        SELECT
          id::text AS id,
          scope_type,
          scope_key,
          version_number,
          change_summary,
          config_hash,
          payload,
          is_active,
          created_by_user_id::text AS created_by_user_id,
          created_at,
          published_at
        FROM config.config_versions
        WHERE scope_type = $1 AND scope_key = $2 AND is_active = TRUE
        LIMIT 1
      `,
      [scopeType, scopeKey]
    );

    return result.rows[0] ? mapVersionRow(result.rows[0]) : null;
  }

  async findVersion(scopeType: ConfigScopeType, scopeKey: string, versionId: string): Promise<ConfigVersionRecord | null> {
    const result = await this.pool.query<ConfigVersionRow>(
      `
        SELECT
          id::text AS id,
          scope_type,
          scope_key,
          version_number,
          change_summary,
          config_hash,
          payload,
          is_active,
          created_by_user_id::text AS created_by_user_id,
          created_at,
          published_at
        FROM config.config_versions
        WHERE scope_type = $1 AND scope_key = $2 AND id = $3
        LIMIT 1
      `,
      [scopeType, scopeKey, versionId]
    );

    return result.rows[0] ? mapVersionRow(result.rows[0]) : null;
  }

  async listVersions(scopeType: ConfigScopeType, scopeKey: string, limit = 20): Promise<ConfigVersionRecord[]> {
    const result = await this.pool.query<ConfigVersionRow>(
      `
        SELECT
          id::text AS id,
          scope_type,
          scope_key,
          version_number,
          change_summary,
          config_hash,
          payload,
          is_active,
          created_by_user_id::text AS created_by_user_id,
          created_at,
          published_at
        FROM config.config_versions
        WHERE scope_type = $1 AND scope_key = $2
        ORDER BY version_number DESC
        LIMIT $3
      `,
      [scopeType, scopeKey, limit]
    );

    return result.rows.map((row) => mapVersionRow(row));
  }

  async activateSnapshot(input: {
    changeSummary: string | null;
    configHash: string;
    createdByUserId: string | null;
    payload: Record<string, unknown>;
    scopeKey: string;
    scopeType: ConfigScopeType;
  }): Promise<ConfigVersionRecord> {
    const client = await this.connect();

    try {
      await client.query("BEGIN");
      const currentActive = await this.findActiveVersionForClient(client, input.scopeType, input.scopeKey);

      if (currentActive && currentActive.configHash === input.configHash && jsonEquals(currentActive.payload, input.payload)) {
        await client.query("COMMIT");
        return currentActive;
      }

      const versionNumberResult = await client.query<{ next_version: number }>(
        `
          SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
          FROM config.config_versions
          WHERE scope_type = $1 AND scope_key = $2
        `,
        [input.scopeType, input.scopeKey]
      );
      const nextVersion = versionNumberResult.rows[0]?.next_version ?? 1;

      await client.query(
        `
          UPDATE config.config_versions
          SET is_active = FALSE
          WHERE scope_type = $1 AND scope_key = $2 AND is_active = TRUE
        `,
        [input.scopeType, input.scopeKey]
      );

      const insertResult = await client.query<ConfigVersionRow>(
        `
          INSERT INTO config.config_versions (
            scope_type,
            scope_key,
            version_number,
            change_summary,
            config_hash,
            payload,
            is_active,
            created_by_user_id,
            published_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, NOW())
          RETURNING
            id::text AS id,
            scope_type,
            scope_key,
            version_number,
            change_summary,
            config_hash,
            payload,
            is_active,
            created_by_user_id::text AS created_by_user_id,
            created_at,
            published_at
        `,
        [
          input.scopeType,
          input.scopeKey,
          nextVersion,
          input.changeSummary,
          input.configHash,
          input.payload,
          input.createdByUserId
        ]
      );

      await client.query("COMMIT");
      return mapVersionRow(insertResult.rows[0]!);
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  private async findActiveVersionForClient(
    client: PoolClient,
    scopeType: ConfigScopeType,
    scopeKey: string
  ): Promise<ConfigVersionRecord | null> {
    const result = await client.query<ConfigVersionRow>(
      `
        SELECT
          id::text AS id,
          scope_type,
          scope_key,
          version_number,
          change_summary,
          config_hash,
          payload,
          is_active,
          created_by_user_id::text AS created_by_user_id,
          created_at,
          published_at
        FROM config.config_versions
        WHERE scope_type = $1 AND scope_key = $2 AND is_active = TRUE
        LIMIT 1
      `,
      [scopeType, scopeKey]
    );

    return result.rows[0] ? mapVersionRow(result.rows[0]) : null;
  }
}

function mapVersionRow(row: ConfigVersionRow): ConfigVersionRecord {
  return {
    changeSummary: row.change_summary,
    configHash: row.config_hash,
    createdAt: toIsoString(row.created_at),
    createdByUserId: row.created_by_user_id,
    id: row.id,
    isActive: row.is_active,
    payload: row.payload,
    publishedAt: row.published_at ? toIsoString(row.published_at) : null,
    scopeKey: row.scope_key,
    scopeType: row.scope_type,
    versionNumber: row.version_number
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJson(entry));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, normalizeJson(value[key])])
    );
  }

  return value;
}

function jsonEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalizeJson(left)) === JSON.stringify(normalizeJson(right));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    return;
  }
}