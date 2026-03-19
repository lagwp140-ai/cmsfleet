import type { AuditEvent, UserAccountStatus, UserRole } from "../auth/types";

export interface ManagedUserRecord {
  createdAt: string;
  displayName: string;
  email: string;
  id: string;
  mustChangePassword: boolean;
  passwordChangedAt: string;
  role: UserRole;
  status: UserAccountStatus;
  updatedAt: string;
}

export interface ManagedUserMutationInput {
  displayName: string;
  email: string;
  role: UserRole;
  status: UserAccountStatus;
}

export interface UserListFilters {
  role?: UserRole;
  search?: string;
  status?: UserAccountStatus;
}

export interface ManagedUserListResponse {
  users: ManagedUserRecord[];
}

export interface ManagedUserMutationResponse {
  temporaryPassword?: string;
  user: ManagedUserRecord;
}

export interface ManagedUserAuditResponse {
  events: AuditEvent[];
}
