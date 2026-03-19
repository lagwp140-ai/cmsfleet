import type { CmsConfig, UserRole } from "@cmsfleet/config-runtime";

export function getRolePermissions(config: CmsConfig, role: UserRole): string[] {
  return config.auth.rbac.roles[role]?.permissions ?? [];
}

export function hasPermission(config: CmsConfig, role: UserRole, permission: string): boolean {
  return getRolePermissions(config, role).includes(permission);
}