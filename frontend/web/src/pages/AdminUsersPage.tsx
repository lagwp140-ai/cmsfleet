import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { roleBlueprints } from "../admin/console";
import {
  createManagedUser,
  fetchManagedUserAudit,
  fetchManagedUsers,
  resetManagedUserPassword,
  updateManagedUser
} from "../admin/userClient";
import type {
  ManagedUserMutationInput,
  ManagedUserRecord,
  UserListFilters
} from "../admin/userTypes";
import { useAdminConsole } from "../admin/useAdminConsole";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../auth/authClient";
import type { AuditEvent, UserAccountStatus, UserRole } from "../auth/types";
import { MetricCard, Notice, Panel, SectionHeader } from "../components/admin/AdminPrimitives";
import { formatConsoleDateTime } from "../lib/time";

type EditorMode = "create" | "edit";

const ROLE_OPTIONS: UserRole[] = ["super_admin", "dispatcher", "operator", "viewer"];
const STATUS_OPTIONS: UserAccountStatus[] = ["active", "disabled"];

export function AdminUsersPage() {
  const navigate = useNavigate();
  const { dashboard, refreshConsole } = useAdminConsole();
  const { logout, user } = useAuth();
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [editorMode, setEditorMode] = useState<EditorMode>("create");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ body: string; tone: "critical" | "good" | "warn"; title: string } | null>(null);
  const [filters, setFilters] = useState<UserListFilters>({});
  const [formState, setFormState] = useState<ManagedUserMutationInput>({
    displayName: "",
    email: "",
    role: "viewer",
    status: "active"
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<{ password: string; userEmail: string } | null>(null);
  const [users, setUsers] = useState<ManagedUserRecord[]>([]);

  const canManageUsers = user?.permissions.includes("users:manage") ?? false;
  const locale = dashboard?.tenant.locale;

  const activeUserCount = users.filter((account) => account.status === "active").length;
  const pendingPasswordChangeCount = users.filter((account) => account.mustChangePassword).length;
  const disabledUserCount = users.filter((account) => account.status === "disabled").length;
  const superAdminCount = users.filter((account) => account.role === "super_admin" && account.status === "active").length;
  const selectedUser = selectedUserId ? users.find((account) => account.id === selectedUserId) ?? null : null;

  const handleUnauthorized = useEffectEvent(async () => {
    await logout();
    navigate("/login", { replace: true });
  });

  const loadUserAudit = useEffectEvent(async (userId: string) => {
    try {
      const nextAuditEvents = await fetchManagedUserAudit(userId, 30);

      startTransition(() => {
        setAuditEvents(nextAuditEvents);
      });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      if (requestError instanceof ApiError && requestError.status === 403) {
        setAuditEvents([]);
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to load account audit history.");
    }
  });

  const loadUsers = useEffectEvent(async (preferredUserId?: string | null, nextFilters?: UserListFilters) => {
    if (!canManageUsers) {
      startTransition(() => {
        setUsers([]);
        setAuditEvents([]);
        setSelectedUserId(null);
        setEditorMode("create");
        setFormState(createEmptyUserForm());
      });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const activeFilters = nextFilters ?? filters;
      const nextUsers = sortUsers(await fetchManagedUsers(activeFilters));
      const nextSelectedUser = resolveSelectedUser(nextUsers, preferredUserId ?? selectedUserId);

      startTransition(() => {
        setUsers(nextUsers);

        if (!nextSelectedUser) {
          setSelectedUserId(null);
          setEditorMode("create");
          setFormState(createEmptyUserForm());
          setAuditEvents([]);
          return;
        }

        setSelectedUserId(nextSelectedUser.id);
        setEditorMode("edit");
        setFormState(toUserMutationInput(nextSelectedUser));
      });

      if (nextSelectedUser) {
        await loadUserAudit(nextSelectedUser.id);
      }
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to load user management.");
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void loadUsers();
  }, [canManageUsers, filters.role, filters.search, filters.status, user?.id]);

  function handleSelectUser(account: ManagedUserRecord) {
    setSelectedUserId(account.id);
    setEditorMode("edit");
    setFormState(toUserMutationInput(account));
    setTemporaryPassword(null);
    setFeedback(null);
    setError(null);
    void loadUserAudit(account.id);
  }

  function handleStartCreate() {
    if (!canManageUsers) {
      return;
    }

    setSelectedUserId(null);
    setEditorMode("create");
    setFormState(createEmptyUserForm());
    setAuditEvents([]);
    setTemporaryPassword(null);
    setFeedback(null);
    setError(null);
  }

  function updateForm<K extends keyof ManagedUserMutationInput>(field: K, value: ManagedUserMutationInput[K]) {
    setFormState((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function handleSubmit() {
    if (!canManageUsers) {
      return;
    }

    const validationError = validateUserForm(formState);

    if (validationError) {
      setFeedback({ body: validationError, title: "User form needs attention", tone: "critical" });
      return;
    }

    setIsSaving(true);
    setError(null);
    setFeedback(null);
    setTemporaryPassword(null);

    try {
      if (editorMode === "create") {
        const result = await createManagedUser(formState);

        await loadUsers(result.user.id, {});
        startTransition(() => {
          setFilters({});
          setSelectedUserId(result.user.id);
          setEditorMode("edit");
          setFormState(toUserMutationInput(result.user));
          setTemporaryPassword({ password: result.temporaryPassword ?? "", userEmail: result.user.email });
          setFeedback({
            body: `${result.user.displayName} was created and must change the temporary password at first sign-in.`,
            title: "User account created",
            tone: "good"
          });
        });
      } else if (selectedUserId) {
        const result = await updateManagedUser(selectedUserId, formState);

        await loadUsers(result.user.id, filters);
        startTransition(() => {
          setSelectedUserId(result.user.id);
          setFormState(toUserMutationInput(result.user));
          setFeedback({
            body: `${result.user.displayName} was updated successfully.`,
            title: "User account updated",
            tone: "good"
          });
        });
      }

      void refreshConsole();
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to save the user account.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!canManageUsers || !selectedUser) {
      return;
    }

    if (!window.confirm(`Reset the password for ${selectedUser.displayName}? This will invalidate active sessions.`)) {
      return;
    }

    setIsResettingPassword(true);
    setError(null);
    setFeedback(null);

    try {
      const result = await resetManagedUserPassword(selectedUser.id);
      await loadUsers(result.user.id, filters);

      startTransition(() => {
        setSelectedUserId(result.user.id);
        setFormState(toUserMutationInput(result.user));
        setTemporaryPassword({ password: result.temporaryPassword ?? "", userEmail: result.user.email });
        setFeedback({
          body: `${result.user.displayName} received a new temporary password and must change it after signing in.`,
          title: "Password reset complete",
          tone: "warn"
        });
      });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Unable to reset the user password.");
    } finally {
      setIsResettingPassword(false);
    }
  }

  return (
    <div className="page-stack">
      <SectionHeader
        actions={
          canManageUsers ? (
            <>
              <button className="action-button action-button--secondary" onClick={() => void loadUsers()} type="button">
                {isLoading ? "Refreshing..." : "Refresh users"}
              </button>
              <button className="action-button action-button--primary" onClick={handleStartCreate} type="button">
                Create user
              </button>
            </>
          ) : undefined
        }
        description="Provision operator accounts, control roles and account status, rotate passwords safely, and inspect security-sensitive account history from one operational console."
        eyebrow="Identity Control"
        title="Users"
      />

      {!canManageUsers ? (
        <Notice
          body={`Your ${user?.role ?? "viewer"} role can use the console, but account management is reserved for roles with the users:manage permission.`}
          title="User administration restricted"
          tone="warn"
        />
      ) : null}

      {user?.mustChangePassword ? (
        <Notice
          body="Your account is marked to change its password at the next opportunity. Use the password change flow to replace the current temporary or rotated secret."
          title="Password rotation required"
          tone="warn"
        />
      ) : null}

      {feedback ? <Notice body={feedback.body} title={feedback.title} tone={feedback.tone} /> : null}
      {error ? <Notice body={error} title="User operations unavailable" tone="critical" /> : null}

      {temporaryPassword ? (
        <Panel description="This temporary password is only shown once after creation or reset. Share it through a secure operational channel and ask the user to rotate it immediately after first sign-in." title="Temporary password">
          <div className="stack-card">
            <div className="detail-row">
              <div>
                <div className="detail-row__label">Issued for</div>
                <div className="detail-row__meta">{temporaryPassword.userEmail}</div>
              </div>
              <span className="tone-pill tone-pill--warn">One-time view</span>
            </div>
            <pre className="secret-box">{temporaryPassword.password}</pre>
            <div className="inline-form-actions">
              <button className="action-button action-button--ghost" onClick={() => setTemporaryPassword(null)} type="button">
                Dismiss secret
              </button>
            </div>
          </div>
        </Panel>
      ) : null}

      <section className="metric-grid">
        <MetricCard detail="Accounts currently available in the CMS admin boundary." label="Managed users" tone="accent" value={String(users.length).padStart(2, "0")} />
        <MetricCard detail="Accounts that can sign in right now." label="Active accounts" tone="good" value={String(activeUserCount).padStart(2, "0")} />
        <MetricCard detail="Accounts waiting for a password change after creation or reset." label="Pending rotation" tone={pendingPasswordChangeCount > 0 ? "warn" : "good"} value={String(pendingPasswordChangeCount).padStart(2, "0")} />
        <MetricCard detail="Active super_admin coverage retained for break-glass platform access." label="Active super admins" tone={superAdminCount > 1 ? "good" : "warn"} value={String(superAdminCount).padStart(2, "0")} />
      </section>

      <div className="split-layout">
        <div className="stack-card">
          <Panel description="Create a new account or update the selected operator. Role and status changes are applied immediately to subsequent requests." title={editorMode === "create" ? "Create user" : `Editing ${selectedUser?.displayName ?? "user"}`}>
            {canManageUsers ? (
              <form className="form-grid" onSubmit={(event) => {
                event.preventDefault();
                void handleSubmit();
              }}>
                <label className="field">
                  <span className="field__label">Display name</span>
                  <input className="input-control" disabled={isSaving || isResettingPassword} onChange={(event) => updateForm("displayName", event.currentTarget.value)} type="text" value={formState.displayName} />
                </label>
                <label className="field">
                  <span className="field__label">Email</span>
                  <input className="input-control" disabled={isSaving || isResettingPassword} onChange={(event) => updateForm("email", event.currentTarget.value)} type="email" value={formState.email} />
                </label>
                <label className="field">
                  <span className="field__label">Role</span>
                  <select className="select-control" disabled={isSaving || isResettingPassword} onChange={(event) => updateForm("role", event.currentTarget.value as UserRole)} value={formState.role}>
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>{formatLabel(role)}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">Status</span>
                  <select className="select-control" disabled={isSaving || isResettingPassword} onChange={(event) => updateForm("status", event.currentTarget.value as UserAccountStatus)} value={formState.status}>
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{formatLabel(status)}</option>
                    ))}
                  </select>
                </label>
                <div className="helper-text field--wide">
                  Newly created accounts receive a generated temporary password and must rotate it at first sign-in.
                </div>
                <div className="inline-form-actions field--wide">
                  <button className="action-button action-button--primary" disabled={isSaving || isResettingPassword} type="submit">
                    {isSaving ? "Saving..." : editorMode === "create" ? "Create user" : "Save changes"}
                  </button>
                  <button className="action-button action-button--secondary" disabled={isSaving || isResettingPassword} onClick={handleStartCreate} type="button">
                    Clear form
                  </button>
                  {editorMode === "edit" && selectedUser ? (
                    <button className="action-button action-button--ghost" disabled={isSaving || isResettingPassword || selectedUser.id === user?.id} onClick={() => void handleResetPassword()} type="button">
                      {isResettingPassword ? "Resetting..." : "Reset password"}
                    </button>
                  ) : null}
                </div>
              </form>
            ) : (
              <div className="empty-state">Account editing requires the users:manage permission.</div>
            )}
          </Panel>

          <Panel description="The selected account posture and the role contract expected by the CMS security boundary." title="Access posture">
            <div className="detail-list">
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Selected account</div>
                  <div className="detail-row__meta">Who the current form is targeting for edits or password reset.</div>
                </div>
                <span className={`tone-pill tone-pill--${selectedUser?.status === "disabled" ? "critical" : "accent"}`}>{selectedUser?.displayName ?? "New account"}</span>
              </div>
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Sign-in status</div>
                  <div className="detail-row__meta">Disabled accounts cannot authenticate and active sessions are revoked on disable.</div>
                </div>
                <span className={`tone-pill tone-pill--${selectedUser?.status === "disabled" ? "critical" : "good"}`}>{selectedUser ? formatLabel(selectedUser.status) : formatLabel(formState.status)}</span>
              </div>
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Password posture</div>
                  <div className="detail-row__meta">Whether the next successful sign-in should force a password change.</div>
                </div>
                <span className={`tone-pill tone-pill--${selectedUser?.mustChangePassword ? "warn" : "good"}`}>{selectedUser?.mustChangePassword ? "Rotation required" : "Current"}</span>
              </div>
              <div className="detail-row">
                <div>
                  <div className="detail-row__label">Last password change</div>
                  <div className="detail-row__meta">Most recent password set or reset event for the selected account.</div>
                </div>
                <span className="tone-pill tone-pill--neutral">{selectedUser ? formatConsoleTime(selectedUser.passwordChangedAt, locale) : "Pending"}</span>
              </div>
            </div>
          </Panel>

          <Panel description="Initial role definitions and the permissions each profile brings into the admin surface." title="Role blueprint">
            <div className="role-list">
              {roleBlueprints.map((role) => (
                <article className="role-card" key={role.role}>
                  <div className="role-card__header">
                    <strong>{role.label}</strong>
                    <span className={`tone-pill tone-pill--${formState.role === role.role ? "accent" : "neutral"}`}>{role.role}</span>
                  </div>
                  <p className="role-card__description">{role.description}</p>
                  <div className="role-card__access">{role.access}</div>
                  <div className="role-card__permissions">
                    {role.permissions.map((permission) => (
                      <span className="tone-pill tone-pill--neutral" key={`${role.role}-${permission}`}>
                        {permission}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </Panel>
        </div>

        <div className="stack-card">
          <Panel description="Find accounts by email, role, or status and select one to inspect its audit trail." title="User registry">
            {canManageUsers ? (
              <>
                <div className="filter-grid">
                  <label className="field">
                    <span className="field__label">Search</span>
                    <input className="input-control" onChange={(event) => setFilters((current) => ({ ...current, search: emptyToUndefined(event.currentTarget.value) }))} placeholder="Display name or email" type="search" value={filters.search ?? ""} />
                  </label>
                  <label className="field">
                    <span className="field__label">Role</span>
                    <select className="select-control" onChange={(event) => setFilters((current) => ({ ...current, role: emptyToUndefined(event.currentTarget.value) as UserRole | undefined }))} value={filters.role ?? ""}>
                      <option value="">All roles</option>
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>{formatLabel(role)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field__label">Status</span>
                    <select className="select-control" onChange={(event) => setFilters((current) => ({ ...current, status: emptyToUndefined(event.currentTarget.value) as UserAccountStatus | undefined }))} value={filters.status ?? ""}>
                      <option value="">All statuses</option>
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{formatLabel(status)}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {isLoading ? (
                  <div className="empty-state">Loading user registry...</div>
                ) : users.length === 0 ? (
                  <div className="empty-state">No users match the current filters. Adjust the search or create the first account.</div>
                ) : (
                  <div className="registry-grid">
                    {users.map((account) => {
                      const selected = account.id === selectedUserId;

                      return (
                        <article className={`registry-card${selected ? " registry-card--selected" : ""}`} key={account.id}>
                          <div className="registry-card__header">
                            <div>
                              <div className="registry-card__eyebrow">{formatLabel(account.role)}</div>
                              <h3 className="registry-card__title">{account.displayName}</h3>
                              <div className="registry-card__subtext">{account.email}</div>
                            </div>
                            <div className="badge-row">
                              <span className={`tone-pill tone-pill--${account.status === "active" ? "good" : "critical"}`}>{formatLabel(account.status)}</span>
                              <span className={`tone-pill tone-pill--${account.mustChangePassword ? "warn" : "neutral"}`}>{account.mustChangePassword ? "Password reset pending" : "Password current"}</span>
                            </div>
                          </div>
                          <div className="registry-card__specs">
                            <div className="registry-card__spec"><span>Created</span><strong>{formatConsoleTime(account.createdAt, locale)}</strong></div>
                            <div className="registry-card__spec"><span>Updated</span><strong>{formatConsoleTime(account.updatedAt, locale)}</strong></div>
                            <div className="registry-card__spec"><span>Password changed</span><strong>{formatConsoleTime(account.passwordChangedAt, locale)}</strong></div>
                          </div>
                          <div className="registry-card__actions">
                            <button className="action-button action-button--secondary" onClick={() => handleSelectUser(account)} type="button">
                              {selected ? "Editing" : "Manage user"}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">Account inventory is only available to authorized administrators.</div>
            )}
          </Panel>

          <Panel description="Security-sensitive history for the selected account, including sign-in outcomes, role and status changes, password rotation, and admin actions." title="Account audit history">
            {!canManageUsers ? (
              <div className="empty-state">Account audit history is restricted to authorized administrators.</div>
            ) : !selectedUser ? (
              <div className="empty-state">Select a user to inspect account audit history.</div>
            ) : auditEvents.length === 0 ? (
              <div className="empty-state">No audit events are available for this account yet.</div>
            ) : (
              <div className="event-list">
                {auditEvents.map((event) => (
                  <article className="event-item" key={event.id}>
                    <div className="event-item__header">
                      <span>{formatConsoleTime(event.occurredAt, locale)}</span>
                      <span className={`tone-pill tone-pill--${event.success ? event.type === "password_reset" || event.type === "user_status_changed" ? "warn" : "good" : "critical"}`}>{formatLabel(event.type)}</span>
                    </div>
                    <div className="event-item__body">{buildAuditDescription(event, selectedUser)}</div>
                    <div className="event-item__meta">
                      <span>{event.actorEmail ? `Actor ${event.actorEmail}` : "System event"}</span>
                      {event.reason ? <span>Reason {event.reason}</span> : null}
                      {event.ipAddress ? <span>IP {event.ipAddress}</span> : null}
                      {event.metadata ? <span>{formatAuditMetadata(event.metadata)}</span> : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function buildAuditDescription(event: AuditEvent, selectedUser: ManagedUserRecord): string {
  switch (event.type) {
    case "password_reset":
      return `${selectedUser.displayName} received an admin-issued password reset.`;
    case "password_changed":
      return `${selectedUser.displayName} changed the account password.`;
    case "sign_in_failed":
      return `${selectedUser.displayName} had a failed sign-in attempt.`;
    case "sign_in_succeeded":
      return `${selectedUser.displayName} signed in successfully.`;
    case "sign_out":
      return `${selectedUser.displayName} signed out.`;
    case "user_created":
      return `${selectedUser.displayName} was created in the CMS.`;
    case "user_role_changed":
      return `${selectedUser.displayName} had the account role changed.`;
    case "user_status_changed":
      return `${selectedUser.displayName} had the account status changed.`;
    case "user_updated":
      return `${selectedUser.displayName} had account details updated.`;
    default:
      return `${selectedUser.displayName} recorded ${event.type}.`;
  }
}

function createEmptyUserForm(): ManagedUserMutationInput {
  return {
    displayName: "",
    email: "",
    role: "viewer",
    status: "active"
  };
}

function emptyToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function formatAuditMetadata(metadata: Record<string, unknown>): string {
  const entries = Object.entries(metadata).slice(0, 3);

  if (entries.length === 0) {
    return "Metadata recorded";
  }

  return entries
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" | ");
}

function formatConsoleTime(timestamp: string | null, locale?: string): string {
  if (!timestamp) {
    return "Unavailable";
  }

  return formatConsoleDateTime(timestamp, locale);
}

function formatLabel(value: string): string {
  return value
    .split(/[-_]/)
    .filter((segment) => segment !== "")
    .map((segment) => segment.slice(0, 1).toUpperCase() + segment.slice(1))
    .join(" ");
}

function resolveSelectedUser(users: ManagedUserRecord[], selectedUserId: string | null | undefined): ManagedUserRecord | null {
  if (users.length === 0) {
    return null;
  }

  if (!selectedUserId) {
    return users[0] ?? null;
  }

  return users.find((account) => account.id === selectedUserId) ?? users[0] ?? null;
}

function sortUsers(users: ManagedUserRecord[]): ManagedUserRecord[] {
  return [...users].sort((left, right) => left.displayName.localeCompare(right.displayName) || left.email.localeCompare(right.email));
}

function toUserMutationInput(account: ManagedUserRecord): ManagedUserMutationInput {
  return {
    displayName: account.displayName,
    email: account.email,
    role: account.role,
    status: account.status
  };
}

function validateUserForm(input: ManagedUserMutationInput): string | null {
  if (input.displayName.trim() === "") {
    return "Display name is required.";
  }

  if (input.email.trim() === "" || !input.email.includes("@")) {
    return "A valid email address is required.";
  }

  return null;
}





