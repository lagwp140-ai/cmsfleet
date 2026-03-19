import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import type { AuditEvent, StoredSession, StoredUser } from "./types.js";
import type {
  AuditEventFilters,
  AuditInput,
  AuthStore,
  DeleteSessionsOptions,
  ManagedUserCreateInput,
  ManagedUserFilters,
  ManagedUserUpdateInput,
  SessionInput
} from "./store.js";

const AUTH_SCHEMA_STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS cms_auth_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('super_admin', 'dispatcher', 'operator', 'viewer')),
      password_hash TEXT NOT NULL,
      password_changed_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `ALTER TABLE cms_auth_users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`,
  `ALTER TABLE cms_auth_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE`,
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
      actor_user_id TEXT,
      actor_email TEXT,
      user_id TEXT REFERENCES cms_auth_users(id) ON DELETE SET NULL,
      email TEXT,
      role TEXT,
      type TEXT NOT NULL,
      success BOOLEAN NOT NULL,
      reason TEXT,
      ip_address TEXT,
      user_agent TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `ALTER TABLE cms_auth_audit_events ADD COLUMN IF NOT EXISTS actor_user_id TEXT`,
  `ALTER TABLE cms_auth_audit_events ADD COLUMN IF NOT EXISTS actor_email TEXT`,
  `ALTER TABLE cms_auth_audit_events ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE cms_auth_audit_events DROP CONSTRAINT IF EXISTS cms_auth_audit_events_type_check`,
  `
    CREATE INDEX IF NOT EXISTS cms_auth_audit_events_occurred_at_idx
    ON cms_auth_audit_events (occurred_at DESC)
  `,
  `
    CREATE INDEX IF NOT EXISTS cms_auth_audit_events_user_id_idx
    ON cms_auth_audit_events (user_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS cms_auth_audit_events_actor_user_id_idx
    ON cms_auth_audit_events (actor_user_id)
  `
] as const;

interface UserRow {
  created_at: Date | string;
  display_name: string;
  email: string;
  id: string;
  must_change_password: boolean;
  password_changed_at: Date | string;
  password_hash: string;
  role: StoredUser["role"];
  status: StoredUser["status"];
  updated_at: Date | string;
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
  actor_email: string | null;
  actor_user_id: string | null;
  email: string | null;
  id: string;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
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
            status,
            must_change_password,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          ON CONFLICT (email) DO NOTHING
        `,
        [
          user.id,
          normalizeEmail(user.email),
          user.displayName,
          user.role,
          user.passwordHash,
          user.passwordChangedAt,
          user.status,
          user.mustChangePassword
        ]
      );
    }
  }

  async createUser(input: ManagedUserCreateInput): Promise<StoredUser> {
    const result = await this.pool.query<UserRow>(
      `
        INSERT INTO cms_auth_users (
          id,
          email,
          display_name,
          role,
          password_hash,
          password_changed_at,
          status,
          must_change_password,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, NOW(), NOW())
        RETURNING id, email, display_name, role, password_hash, password_changed_at, status, must_change_password, created_at, updated_at
      `,
      [
        randomUUID(),
        normalizeEmail(input.email),
        input.displayName,
        input.role,
        input.passwordHash,
        input.status,
        input.mustChangePassword
      ]
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error("Failed to create user.");
    }

    return mapUserRow(row);
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

    return result.rows[0] ? mapSessionRow(result.rows[0]) : undefined;
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

    return result.rows[0] ? mapSessionRow(result.rows[0]) : undefined;
  }

  async findUserByEmail(email: string): Promise<StoredUser | undefined> {
    const result = await this.pool.query<UserRow>(
      `
        SELECT id, email, display_name, role, password_hash, password_changed_at, status, must_change_password, created_at, updated_at
        FROM cms_auth_users
        WHERE email = $1
        LIMIT 1
      `,
      [normalizeEmail(email)]
    );

    return result.rows[0] ? mapUserRow(result.rows[0]) : undefined;
  }

  async findUserById(userId: string): Promise<StoredUser | undefined> {
    const result = await this.pool.query<UserRow>(
      `
        SELECT id, email, display_name, role, password_hash, password_changed_at, status, must_change_password, created_at, updated_at
        FROM cms_auth_users
        WHERE id = $1
        LIMIT 1
      `,
      [userId]
    );

    return result.rows[0] ? mapUserRow(result.rows[0]) : undefined;
  }

  async listAuditEvents(limit = 50, filters: AuditEventFilters = {}): Promise<AuditEvent[]> {
    const boundedLimit = Math.max(1, Math.min(limit, this.auditLimit));
    const conditions: string[] = [];
    const values: Array<boolean | number | string> = [];

    if (filters.type) {
      values.push(filters.type);
      conditions.push(`type = $${values.length}`);
    }

    if (filters.success !== undefined) {
      values.push(filters.success);
      conditions.push(`success = $${values.length}`);
    }

    if (filters.userId) {
      values.push(filters.userId);
      conditions.push(`user_id = $${values.length}`);
    }

    if (filters.search) {
      values.push(`%${filters.search}%`);
      const placeholder = `$${values.length}`;
      conditions.push(`(
        COALESCE(actor_email, '') ILIKE ${placeholder}
        OR COALESCE(actor_user_id, '') ILIKE ${placeholder}
        OR COALESCE(email, '') ILIKE ${placeholder}
        OR COALESCE(user_id, '') ILIKE ${placeholder}
        OR COALESCE(reason, '') ILIKE ${placeholder}
        OR COALESCE(role, '') ILIKE ${placeholder}
        OR type ILIKE ${placeholder}
        OR COALESCE(ip_address, '') ILIKE ${placeholder}
        OR COALESCE(user_agent, '') ILIKE ${placeholder}
        OR metadata::text ILIKE ${placeholder}
      )`);
    }

    values.push(boundedLimit);
    const limitPlaceholder = `$${values.length}`;
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await this.pool.query<AuditRow>(
      `
        SELECT actor_user_id, actor_email, id, user_id, email, role, type, success, reason, ip_address, user_agent, metadata, occurred_at
        FROM cms_auth_audit_events
        ${whereClause}
        ORDER BY occurred_at DESC
        LIMIT ${limitPlaceholder}
      `,
      values
    );

    return result.rows.map((row) => mapAuditRow(row));
  }

  async listUsers(filters: ManagedUserFilters = {}): Promise<StoredUser[]> {
    const conditions: string[] = [];
    const values: string[] = [];

    if (filters.role) {
      values.push(filters.role);
      conditions.push(`role = $${values.length}`);
    }

    if (filters.status) {
      values.push(filters.status);
      conditions.push(`status = $${values.length}`);
    }

    if (filters.search) {
      values.push(`%${filters.search}%`);
      const placeholder = `$${values.length}`;
      conditions.push(`(
        display_name ILIKE ${placeholder}
        OR email ILIKE ${placeholder}
        OR role ILIKE ${placeholder}
        OR status ILIKE ${placeholder}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.pool.query<UserRow>(
      `
        SELECT id, email, display_name, role, password_hash, password_changed_at, status, must_change_password, created_at, updated_at
        FROM cms_auth_users
        ${whereClause}
        ORDER BY display_name ASC, email ASC
      `,
      values
    );

    return result.rows.map((row) => mapUserRow(row));
  }

  async recordAudit(input: AuditInput): Promise<AuditEvent> {
    const result = await this.pool.query<AuditRow>(
      `
        INSERT INTO cms_auth_audit_events (
          id,
          actor_user_id,
          actor_email,
          user_id,
          email,
          role,
          type,
          success,
          reason,
          ip_address,
          user_agent,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING actor_user_id, actor_email, id, user_id, email, role, type, success, reason, ip_address, user_agent, metadata, occurred_at
      `,
      [
        randomUUID(),
        input.actorUserId ?? null,
        input.actorEmail ? normalizeEmail(input.actorEmail) : null,
        input.userId ?? null,
        input.email ? normalizeEmail(input.email) : null,
        input.role ?? null,
        input.type,
        input.success,
        input.reason ?? null,
        input.ipAddress ?? null,
        input.userAgent ?? null,
        input.metadata ?? {}
      ]
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error("Failed to record auth audit event.");
    }

    return mapAuditRow(row);
  }

  async updateUser(userId: string, input: ManagedUserUpdateInput): Promise<StoredUser | undefined> {
    const result = await this.pool.query<UserRow>(
      `
        UPDATE cms_auth_users
        SET email = $2,
            display_name = $3,
            role = $4,
            status = $5,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, email, display_name, role, password_hash, password_changed_at, status, must_change_password, created_at, updated_at
      `,
      [userId, normalizeEmail(input.email), input.displayName, input.role, input.status]
    );

    return result.rows[0] ? mapUserRow(result.rows[0]) : undefined;
  }

  async updateUserPassword(userId: string, passwordHash: string, mustChangePassword = false): Promise<StoredUser | undefined> {
    const result = await this.pool.query<UserRow>(
      `
        UPDATE cms_auth_users
        SET password_hash = $2,
            password_changed_at = NOW(),
            must_change_password = $3,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, email, display_name, role, password_hash, password_changed_at, status, must_change_password, created_at, updated_at
      `,
      [userId, passwordHash, mustChangePassword]
    );

    return result.rows[0] ? mapUserRow(result.rows[0]) : undefined;
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
    actorEmail: row.actor_email ?? undefined,
    actorUserId: row.actor_user_id ?? undefined,
    email: row.email ?? undefined,
    id: row.id,
    ipAddress: row.ip_address ?? undefined,
    metadata: row.metadata ?? undefined,
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
    createdAt: toIsoString(row.created_at),
    displayName: row.display_name,
    email: row.email,
    id: row.id,
    mustChangePassword: row.must_change_password,
    passwordChangedAt: toIsoString(row.password_changed_at),
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    updatedAt: toIsoString(row.updated_at)
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}