import { randomUUID } from "node:crypto";

import type { AuditEvent, AuditEventType, StoredSession, StoredUser } from "./types.js";

export interface AuditInput {
  email?: string;
  ipAddress?: string;
  reason?: string;
  role?: StoredUser["role"];
  success: boolean;
  type: AuditEventType;
  userAgent?: string;
  userId?: string;
}

export interface DeleteSessionsOptions {
  exceptTokenHash?: string;
}

export interface SessionInput {
  expiresAt: string;
  ipAddress?: string;
  tokenHash: string;
  userAgent?: string;
  userId: string;
}

export interface AuthStore {
  init(): Promise<void>;
  close(): Promise<void>;
  upsertBootstrapUsers(users: StoredUser[]): Promise<void>;
  createSession(input: SessionInput): Promise<StoredSession>;
  deleteSession(tokenHash: string): Promise<StoredSession | undefined>;
  deleteSessionsByUserId(userId: string, options?: DeleteSessionsOptions): Promise<number>;
  findSessionByTokenHash(tokenHash: string): Promise<StoredSession | undefined>;
  findUserByEmail(email: string): Promise<StoredUser | undefined>;
  findUserById(userId: string): Promise<StoredUser | undefined>;
  listAuditEvents(limit?: number): Promise<AuditEvent[]>;
  recordAudit(input: AuditInput): Promise<AuditEvent>;
  updateUserPassword(userId: string, passwordHash: string): Promise<StoredUser | undefined>;
}

export class InMemoryAuthStore implements AuthStore {
  private readonly auditLimit: number;
  private readonly auditTrail: AuditEvent[] = [];
  private readonly sessionsByTokenHash = new Map<string, StoredSession>();
  private readonly userIdsByEmail = new Map<string, string>();
  private readonly usersById = new Map<string, StoredUser>();

  constructor(users: StoredUser[], auditLimit = 250) {
    this.auditLimit = auditLimit;

    for (const user of users) {
      const normalizedEmail = normalizeEmail(user.email);
      this.userIdsByEmail.set(normalizedEmail, user.id);
      this.usersById.set(user.id, { ...user, email: normalizedEmail });
    }
  }

  async init(): Promise<void> {
    this.cleanupExpiredSessions();
  }

  async close(): Promise<void> {
    return;
  }

  async upsertBootstrapUsers(users: StoredUser[]): Promise<void> {
    for (const user of users) {
      if (this.userIdsByEmail.has(normalizeEmail(user.email))) {
        continue;
      }

      const normalizedEmail = normalizeEmail(user.email);
      this.userIdsByEmail.set(normalizedEmail, user.id);
      this.usersById.set(user.id, { ...user, email: normalizedEmail });
    }
  }

  async createSession(input: SessionInput): Promise<StoredSession> {
    const session: StoredSession = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      expiresAt: input.expiresAt,
      ipAddress: input.ipAddress,
      tokenHash: input.tokenHash,
      userAgent: input.userAgent,
      userId: input.userId
    };

    this.sessionsByTokenHash.set(input.tokenHash, session);
    return { ...session };
  }

  async deleteSession(tokenHash: string): Promise<StoredSession | undefined> {
    const existing = this.sessionsByTokenHash.get(tokenHash);

    if (!existing) {
      return undefined;
    }

    this.sessionsByTokenHash.delete(tokenHash);
    return { ...existing };
  }

  async deleteSessionsByUserId(userId: string, options: DeleteSessionsOptions = {}): Promise<number> {
    let deletedCount = 0;

    for (const [tokenHash, session] of this.sessionsByTokenHash.entries()) {
      if (session.userId !== userId) {
        continue;
      }

      if (options.exceptTokenHash !== undefined && tokenHash === options.exceptTokenHash) {
        continue;
      }

      this.sessionsByTokenHash.delete(tokenHash);
      deletedCount += 1;
    }

    return deletedCount;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<StoredSession | undefined> {
    this.cleanupExpiredSessions();

    const session = this.sessionsByTokenHash.get(tokenHash);
    return session ? { ...session } : undefined;
  }

  async findUserByEmail(email: string): Promise<StoredUser | undefined> {
    const userId = this.userIdsByEmail.get(normalizeEmail(email));

    if (!userId) {
      return undefined;
    }

    const user = this.usersById.get(userId);
    return user ? { ...user } : undefined;
  }

  async findUserById(userId: string): Promise<StoredUser | undefined> {
    const user = this.usersById.get(userId);
    return user ? { ...user } : undefined;
  }

  async listAuditEvents(limit = 50): Promise<AuditEvent[]> {
    return this.auditTrail.slice(0, Math.max(1, Math.min(limit, this.auditLimit))).map((event) => ({ ...event }));
  }

  async recordAudit(input: AuditInput): Promise<AuditEvent> {
    const event: AuditEvent = {
      email: input.email,
      id: randomUUID(),
      ipAddress: input.ipAddress,
      occurredAt: new Date().toISOString(),
      reason: input.reason,
      role: input.role,
      success: input.success,
      type: input.type,
      userAgent: input.userAgent,
      userId: input.userId
    };

    this.auditTrail.unshift(event);

    if (this.auditTrail.length > this.auditLimit) {
      this.auditTrail.length = this.auditLimit;
    }

    return { ...event };
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<StoredUser | undefined> {
    const existing = this.usersById.get(userId);

    if (!existing) {
      return undefined;
    }

    const updatedUser: StoredUser = {
      ...existing,
      passwordChangedAt: new Date().toISOString(),
      passwordHash
    };

    this.usersById.set(userId, updatedUser);
    return { ...updatedUser };
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();

    for (const [tokenHash, session] of this.sessionsByTokenHash.entries()) {
      if (new Date(session.expiresAt).getTime() <= now) {
        this.sessionsByTokenHash.delete(tokenHash);
      }
    }
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
