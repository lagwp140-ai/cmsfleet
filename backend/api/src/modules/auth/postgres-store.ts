import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import type { AuditEvent, StoredSession, StoredUser } from "./types.js";
import type { AuditInput, AuthStore, DeleteSessionsOptions, SessionInput } from "./store.js";

const AUTH_SCHEMA_STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS cms_auth_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('super_admin', 'dispatcher', 'operator', 'viewer')),
      password_hash TEXT NOT NULL,
      password_changed_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS cms_auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES cms_auth_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      ip_address TEXT,
      user_agent TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS cms_auth_sessions_user_id_idx
    ON cms_auth_sessions (user_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS cms_auth_sessions_expires_at_idx
    ON cms_auth_sessions (expires_at)
  `,
  `
    CREATE TABLE IF NOT EXISTS cms_auth_audit_events (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES cms_auth_users(id) ON DELETE SET NULL,
      email TEXT,
      role TEXT,
      type TEXT NOT NULL CHECK (type IN ('sign_in_succeeded', 'sign_in_failed', 'sign_out', 'password_changed')),
      success BOOLEAN NOT NULL,
      reason TEXT,
      ip_address TEXT,
      user_agent TEXT,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS cms_auth_audit_events_occurred_at_idx
    ON cms_auth_audit_events (occurred_at DESC)
  `
] as const;

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: StoredUser["role"];
  password_hash: string;
  password_changed_at: Date | string;
}

interface SessionRow {
  id: string;
  created_at: Date | string;
  expires_at: Date | string;
  ip_address: string | null;
  token_hash: string;
  user_agent: string | null;
  user_id: string;
}

interface AuditRow {
  id: string;
  email: string | null;
  ip_address: string | null;
  occurred_at: Date | string;
  reason: string | null;
  role: StoredUser["role"] | null;
  success: boolean;
  type: AuditEvent["type"];
  user_agent: string | null;
  user_id: string | null;
}

export class PostgresAuthStore implements AuthStore {
  private readonly auditLimit: number;
  private readonly pool: Pool;

  constructor(pool: Pool, auditLimit = 250) {
    this.auditLimit = auditLimit;
    this.pool = pool;
  }

  async init(): Promise<void> {
    for (const statement of AUTH_SCHEMA_STATEMENTS) {
      await this.pool.query(statement);
    }

    await this.cleanupExpiredSessions();
  }

  async close(): Promise<void> {
    return;
  }

  async upsertBootstrapUsers(users: StoredUser[]): Promise<void> {
    for (const user of users) {
      await this.pool.query(
        `
          INSERT INTO cms_auth_users (
            id,
            email,
            display_name,
            role,
            password_hash,
            password_changed_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (email) DO NOTHING
        `,
        [
          user.id,
          normalizeEmail(user.email),
          user.displayName,
          user.role,
          user.passwordHash,
          user.passwordChangedAt
        ]
      );
    }
  }

  async createSession(input: SessionInput): Promise<StoredSession> {
    const result = await this.pool.query<SessionRow>(
      `
        INSERT INTO cms_auth_sessions (id, user_id, token_hash, ip_address, user_agent, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, user_id, token_hash, ip_address, user_agent, expires_at, created_at
      `,
      [randomUUID(), input.userId, input.tokenHash, input.ipAddress ?? null, input.userAgent ?? null, input.expiresAt]
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error("Failed to create auth session.");
    }

    return mapSessionRow(row);
  }

  async deleteSession(tokenHash: string): Promise<StoredSession | undefined> {
    const result = await this.pool.query<SessionRow>(
      `
        DELETE FROM cms_auth_sessions
        WHERE token_hash = $1
        RETURNING id, user_id, token_hash, ip_address, user_agent, expires_at, created_at
      `,
      [tokenHash]
    );

    const row = result.rows[0];
    return row ? mapSessionRow(row) : undefined;
  }

  async deleteSessionsByUserId(userId: string, options: DeleteSessionsOptions = {}): Promise<number> {
    if (options.exceptTokenHash !== undefined) {
      const result = await this.pool.query(
        `
          DELETE FROM cms_auth_sessions
          WHERE user_id = $1 AND token_hash <> $2
        `,
        [userId, options.exceptTokenHash]
      );

      return result.rowCount ?? 0;
    }

    const result = await this.pool.query(
      `
        DELETE FROM cms_auth_sessions
        WHERE user_id = $1
      `,
      [userId]
    );

    return result.rowCount ?? 0;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<StoredSession | undefined> {
    await this.cleanupExpiredSessions();

    const result = await this.pool.query<SessionRow>(
      `
        SELECT id, user_id, token_hash, ip_address, user_agent, expires_at, created_at
        FROM cms_auth_sessions
        WHERE token_hash = $1
        LIMIT 1
      `,
      [tokenHash]
    );

    const row = result.rows[0];
    return row ? mapSessionRow(row) : undefined;
  }

  async findUserByEmail(email: string): Promise<StoredUser | undefined> {
    const result = await this.pool.query<UserRow>(
      `
        SELECT id, email, display_name, role, password_hash, password_changed_at
        FROM cms_auth_users
        WHERE email = $1
        LIMIT 1
      `,
      [normalizeEmail(email)]
    );

    const row = result.rows[0];
    return row ? mapUserRow(row) : undefined;
  }

  async findUserById(userId: string): Promise<StoredUser | undefined> {
    const result = await this.pool.query<UserRow>(
      `
        SELECT id, email, display_name, role, password_hash, password_changed_at
        FROM cms_auth_users
        WHERE id = $1
        LIMIT 1
      `,
      [userId]
    );

    const row = result.rows[0];
    return row ? mapUserRow(row) : undefined;
  }

  async listAuditEvents(limit = 50): Promise<AuditEvent[]> {
    const boundedLimit = Math.max(1, Math.min(limit, this.auditLimit));
    const result = await this.pool.query<AuditRow>(
      `
        SELECT id, user_id, email, role, type, success, reason, ip_address, user_agent, occurred_at
        FROM cms_auth_audit_events
        ORDER BY occurred_at DESC
        LIMIT $1
      `,
      [boundedLimit]
    );

    return result.rows.map((row) => mapAuditRow(row));
  }

  async recordAudit(input: AuditInput): Promise<AuditEvent> {
    const result = await this.pool.query<AuditRow>(
      `
        INSERT INTO cms_auth_audit_events (
          id,
          user_id,
          email,
          role,
          type,
          success,
          reason,
          ip_address,
          user_agent
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, user_id, email, role, type, success, reason, ip_address, user_agent, occurred_at
      `,
      [
        randomUUID(),
        input.userId ?? null,
        input.email ? normalizeEmail(input.email) : null,
        input.role ?? null,
        input.type,
        input.success,
        input.reason ?? null,
        input.ipAddress ?? null,
        input.userAgent ?? null
      ]
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error("Failed to record auth audit event.");
    }

    return mapAuditRow(row);
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<StoredUser | undefined> {
    const result = await this.pool.query<UserRow>(
      `
        UPDATE cms_auth_users
        SET password_hash = $2,
            password_changed_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, email, display_name, role, password_hash, password_changed_at
      `,
      [userId, passwordHash]
    );

    const row = result.rows[0];
    return row ? mapUserRow(row) : undefined;
  }

  private async cleanupExpiredSessions(): Promise<void> {
    await this.pool.query(
      `
        DELETE FROM cms_auth_sessions
        WHERE expires_at <= NOW()
      `
    );
  }
}

function mapAuditRow(row: AuditRow): AuditEvent {
  return {
    email: row.email ?? undefined,
    id: row.id,
    ipAddress: row.ip_address ?? undefined,
    occurredAt: toIsoString(row.occurred_at),
    reason: row.reason ?? undefined,
    role: row.role ?? undefined,
    success: row.success,
    type: row.type,
    userAgent: row.user_agent ?? undefined,
    userId: row.user_id ?? undefined
  };
}

function mapSessionRow(row: SessionRow): StoredSession {
  return {
    createdAt: toIsoString(row.created_at),
    expiresAt: toIsoString(row.expires_at),
    id: row.id,
    ipAddress: row.ip_address ?? undefined,
    tokenHash: row.token_hash,
    userAgent: row.user_agent ?? undefined,
    userId: row.user_id
  };
}

function mapUserRow(row: UserRow): StoredUser {
  return {
    displayName: row.display_name,
    email: row.email,
    id: row.id,
    passwordChangedAt: toIsoString(row.password_changed_at),
    passwordHash: row.password_hash,
    role: row.role
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
