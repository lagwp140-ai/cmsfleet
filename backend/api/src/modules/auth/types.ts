import type { UserRole } from "@cmsfleet/config-runtime";

export type AuditEventType =
  | "sign_in_succeeded"
  | "sign_in_failed"
  | "sign_out"
  | "password_changed";

export interface StoredUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  passwordChangedAt: string;
  passwordHash: string;
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  permissions: string[];
}

export interface StoredSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  ipAddress?: string;
  tokenHash: string;
  userAgent?: string;
  userId: string;
}

export interface AuditEvent {
  id: string;
  email?: string;
  ipAddress?: string;
  occurredAt: string;
  reason?: string;
  role?: UserRole;
  success: boolean;
  type: AuditEventType;
  userAgent?: string;
  userId?: string;
}