import type { UserRole } from "@cmsfleet/config-runtime";

export type UserAccountStatus = "active" | "disabled";

export type AuditEventType =
  | "sign_in_succeeded"
  | "sign_in_failed"
  | "sign_out"
  | "password_changed"
  | "password_reset"
  | "user_created"
  | "user_updated"
  | "user_role_changed"
  | "user_status_changed"
  | "csrf_validation_failed";

export interface StoredUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserAccountStatus;
  mustChangePassword: boolean;
  passwordChangedAt: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserAccountStatus;
  mustChangePassword: boolean;
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
  actorEmail?: string;
  actorUserId?: string;
  email?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
  occurredAt: string;
  reason?: string;
  role?: UserRole;
  success: boolean;
  type: AuditEventType;
  userAgent?: string;
  userId?: string;
}
