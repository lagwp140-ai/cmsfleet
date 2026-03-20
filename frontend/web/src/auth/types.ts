export type UserRole = "super_admin" | "dispatcher" | "operator" | "viewer";
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

export interface SessionUser {
  displayName: string;
  email: string;
  id: string;
  mustChangePassword: boolean;
  permissions: string[];
  role: UserRole;
  status: UserAccountStatus;
}

export interface BootstrapUserSummary {
  displayName: string;
  email: string;
  role: UserRole;
}

export interface AuthSessionResponse {
  authenticated: true;
  user: SessionUser;
}

export interface AuthMetadataResponse {
  bootstrapPasswordHint?: string;
  bootstrapUsers: BootstrapUserSummary[];
  passwordMaxLength?: number;
  passwordMinLength: number;
}

export interface LoginResponse {
  bootstrapPasswordHint?: string;
  user: SessionUser;
}

export interface AdminDashboardResponse {
  auth: {
    passwordMaxLength?: number;
    passwordMinLength: number;
    roleLabel: string;
  };
  bootstrapPasswordHint?: string;
  bootstrapUsersEnabled: boolean;
  featureFlags: Record<string, boolean>;
  tenant: {
    displayName: string;
    id: string;
    locale: string;
    timezone: string;
  };
  user: SessionUser;
}

export interface AuditEvent {
  actorEmail?: string;
  actorUserId?: string;
  email?: string;
  id: string;
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
