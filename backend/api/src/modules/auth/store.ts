import { randomUUID } from "node:crypto";

import type { AuditEvent, AuditEventType, StoredSession, StoredUser } from "./types.js";

export interface AuditInput {
  actorEmail?: string;
  actorUserId?: string;
  email?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
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

export interface AuditEventFilters {
  search?: string;
  success?: boolean;
  type?: AuditEventType;
  userId?: string;
}

export interface SessionInput {
  expiresAt: string;
  ipAddress?: string;
  tokenHash: string;
  userAgent?: string;
  userId: string;
}

export interface ManagedUserCreateInput {
  displayName: string;
  email: string;
  mustChangePassword: boolean;
  passwordHash: string;
  role: StoredUser["role"];
  status: StoredUser["status"];
}

export interface ManagedUserUpdateInput {
  displayName: string;
  email: string;
  role: StoredUser["role"];
  status: StoredUser["status"];
}

export interface ManagedUserFilters {
  role?: StoredUser["role"];
  search?: string;
  status?: StoredUser["status"];
}

export interface AuthStore {
  init(): Promise<void>;
  close(): Promise<void>;
  upsertBootstrapUsers(users: StoredUser[]): Promise<void>;
  createUser(input: ManagedUserCreateInput): Promise<StoredUser>;
  createSession(input: SessionInput): Promise<StoredSession>;
  deleteSession(tokenHash: string): Promise<StoredSession | undefined>;
  deleteSessionsByUserId(userId: string, options?: DeleteSessionsOptions): Promise<number>;
  findSessionByTokenHash(tokenHash: string): Promise<StoredSession | undefined>;
  findUserByEmail(email: string): Promise<StoredUser | undefined>;
  findUserById(userId: string): Promise<StoredUser | undefined>;
  listAuditEvents(limit?: number, filters?: AuditEventFilters): Promise<AuditEvent[]>;
  listUsers(filters?: ManagedUserFilters): Promise<StoredUser[]>;
  recordAudit(input: AuditInput): Promise<AuditEvent>;
  updateUser(userId: string, input: ManagedUserUpdateInput): Promise<StoredUser | undefined>;
  updateUserPassword(userId: string, passwordHash: string, mustChangePassword?: boolean): Promise<StoredUser | undefined>;
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

  async createUser(input: ManagedUserCreateInput): Promise<StoredUser> {
    const normalizedEmail = normalizeEmail(input.email);

    if (this.userIdsByEmail.has(normalizedEmail)) {
      throw new Error("A user with that email already exists.");
    }

    const now = new Date().toISOString();
    const user: StoredUser = {
      createdAt: now,
      displayName: input.displayName,
      email: normalizedEmail,
      id: randomUUID(),
      mustChangePassword: input.mustChangePassword,
      passwordChangedAt: now,
      passwordHash: input.passwordHash,
      role: input.role,
      status: input.status,
      updatedAt: now
    };

    this.userIdsByEmail.set(normalizedEmail, user.id);
    this.usersById.set(user.id, user);
    return { ...user };
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

  async listAuditEvents(limit = 50, filters: AuditEventFilters = {}): Promise<AuditEvent[]> {
    const boundedLimit = Math.max(1, Math.min(limit, this.auditLimit));
    const search = filters.search?.toLowerCase();
    const filtered = this.auditTrail.filter((event) => {
      if (filters.type && event.type !== filters.type) {
        return false;
      }

      if (filters.success !== undefined && event.success !== filters.success) {
        return false;
      }

      if (filters.userId && event.userId !== filters.userId) {
        return false;
      }

      if (search) {
        const haystack = [
          event.actorEmail,
          event.actorUserId,
          event.email,
          event.userId,
          event.reason,
          event.type,
          event.role,
          event.ipAddress,
          event.userAgent,
          event.metadata ? JSON.stringify(event.metadata) : undefined
        ]
          .filter((value): value is string => typeof value === "string")
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(search)) {
          return false;
        }
      }

      return true;
    });

    return filtered.slice(0, boundedLimit).map((event) => ({ ...event }));
  }

  async listUsers(filters: ManagedUserFilters = {}): Promise<StoredUser[]> {
    const search = filters.search?.toLowerCase();

    return Array.from(this.usersById.values())
      .filter((user) => {
        if (filters.role && user.role !== filters.role) {
          return false;
        }

        if (filters.status && user.status !== filters.status) {
          return false;
        }

        if (search) {
          const haystack = `${user.displayName} ${user.email} ${user.role} ${user.status}`.toLowerCase();
          if (!haystack.includes(search)) {
            return false;
          }
        }

        return true;
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.email.localeCompare(right.email))
      .map((user) => ({ ...user }));
  }

  async recordAudit(input: AuditInput): Promise<AuditEvent> {
    const event: AuditEvent = {
      actorEmail: input.actorEmail,
      actorUserId: input.actorUserId,
      email: input.email,
      id: randomUUID(),
      ipAddress: input.ipAddress,
      metadata: input.metadata,
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

  async updateUser(userId: string, input: ManagedUserUpdateInput): Promise<StoredUser | undefined> {
    const existing = this.usersById.get(userId);

    if (!existing) {
      return undefined;
    }

    const normalizedEmail = normalizeEmail(input.email);
    const conflictingUserId = this.userIdsByEmail.get(normalizedEmail);

    if (conflictingUserId && conflictingUserId !== userId) {
      throw new Error("A user with that email already exists.");
    }

    if (existing.email !== normalizedEmail) {
      this.userIdsByEmail.delete(existing.email);
      this.userIdsByEmail.set(normalizedEmail, userId);
    }

    const updatedUser: StoredUser = {
      ...existing,
      displayName: input.displayName,
      email: normalizedEmail,
      role: input.role,
      status: input.status,
      updatedAt: new Date().toISOString()
    };

    this.usersById.set(userId, updatedUser);
    return { ...updatedUser };
  }

  async updateUserPassword(userId: string, passwordHash: string, mustChangePassword = false): Promise<StoredUser | undefined> {
    const existing = this.usersById.get(userId);

    if (!existing) {
      return undefined;
    }

    const now = new Date().toISOString();
    const updatedUser: StoredUser = {
      ...existing,
      mustChangePassword,
      passwordChangedAt: now,
      passwordHash,
      updatedAt: now
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