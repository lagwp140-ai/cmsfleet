export type UserRole = "super_admin" | "dispatcher" | "operator" | "viewer";

export interface SessionUser {
  displayName: string;
  email: string;
  id: string;
  permissions: string[];
  role: UserRole;
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
  passwordMinLength: number;
}

export interface LoginResponse {
  bootstrapPasswordHint?: string;
  user: SessionUser;
}

export interface AdminDashboardResponse {
  auth: {
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
  email?: string;
  id: string;
  ipAddress?: string;
  occurredAt: string;
  reason?: string;
  role?: UserRole;
  success: boolean;
  type: "sign_in_succeeded" | "sign_in_failed" | "sign_out" | "password_changed";
  userAgent?: string;
  userId?: string;
}
