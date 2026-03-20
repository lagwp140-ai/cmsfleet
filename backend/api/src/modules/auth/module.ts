import { createHmac, randomBytes } from "node:crypto";

import type { CmsConfig, ConfigRuntimeContext } from "@cmsfleet/config-runtime";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { createBootstrapUsers, DEVELOPMENT_BOOTSTRAP_PASSWORD } from "./bootstrap-users.js";
import {
  generateTemporaryPassword,
  hashPassword,
  validatePasswordPolicy,
  verifyPassword
} from "./password-hasher.js";
import { PostgresAuthStore } from "./postgres-store.js";
import { getRolePermissions, hasPermission } from "./rbac.js";
import type { AuditEventFilters, AuthStore, ManagedUserFilters } from "./store.js";
import type { AuditEventType, SessionUser, StoredUser, UserAccountStatus } from "./types.js";

interface ManagedUserMutationBody {
  displayName: string;
  email: string;
  role: StoredUser["role"];
  status: UserAccountStatus;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_INPUT_LENGTH = 256;

export async function registerAuthModule(
  app: FastifyInstance,
  config: CmsConfig,
  _context: ConfigRuntimeContext,
  dependencies: { store?: AuthStore } = {}
): Promise<void> {
  const bootstrapUsers = config.auth.bootstrapUsersEnabled ? createBootstrapUsers() : [];
  const publicBootstrapUsers =
    config.auth.bootstrapUsersEnabled && config.selection.environment === "local"
      ? bootstrapUsers.map((user) => ({
          displayName: user.displayName,
          email: user.email,
          role: user.role
        }))
      : [];
  const store: AuthStore = dependencies.store ?? new PostgresAuthStore(app.db);

  await store.init();
  await store.upsertBootstrapUsers(bootstrapUsers);

  async function authenticateRequest(
    request: FastifyRequest,
    reply: FastifyReply,
    options: { optional?: boolean; skipCsrf?: boolean } = {}
  ): Promise<SessionUser | undefined> {
    const token = readSessionToken(request, config);

    if (!token) {
      if (!options.optional) {
        reply.code(401).send({ message: "Unauthorized" });
      }

      return undefined;
    }

    if (request.authUser) {
      if (!options.skipCsrf) {
        const csrfAccepted = await ensureCsrfProtection(app, store, request, reply, config, request.authUser, token);

        if (!csrfAccepted) {
          return undefined;
        }
      }

      attachCsrfHeader(reply, config, token);
      return request.authUser;
    }

    const tokenHash = hashSessionToken(token, config.auth.session.secret);
    const session = await store.findSessionByTokenHash(tokenHash);

    if (!session) {
      clearSessionCookie(reply, config);

      if (!options.optional) {
        reply.code(401).send({ message: "Unauthorized" });
      }

      return undefined;
    }

    const storedUser = await store.findUserById(session.userId);

    if (!storedUser || storedUser.status !== "active") {
      await store.deleteSession(tokenHash);
      clearSessionCookie(reply, config);

      if (!options.optional) {
        reply.code(401).send({ message: "Unauthorized" });
      }

      return undefined;
    }

    const authUser = buildSessionUser(config, storedUser);
    request.authTokenHash = tokenHash;
    request.authUser = authUser;

    if (!options.skipCsrf) {
      const csrfAccepted = await ensureCsrfProtection(app, store, request, reply, config, authUser, token);

      if (!csrfAccepted) {
        return undefined;
      }
    }

    attachCsrfHeader(reply, config, token);
    return authUser;
  }

  async function requirePermission(
    request: FastifyRequest,
    reply: FastifyReply,
    permission: string
  ): Promise<SessionUser | undefined> {
    const authUser = await authenticateRequest(request, reply);

    if (!authUser) {
      return undefined;
    }

    if (!hasPermission(config, authUser.role, permission)) {
      reply.code(403).send({ message: "Forbidden" });
      return undefined;
    }

    return authUser;
  }

  app.decorate("authenticateRequest", authenticateRequest);
  app.decorate("requirePermission", requirePermission);

  app.get("/api/auth/metadata", async () => ({
    bootstrapPasswordHint:
      publicBootstrapUsers.length > 0 ? DEVELOPMENT_BOOTSTRAP_PASSWORD : undefined,
    bootstrapUsers: publicBootstrapUsers,
    passwordMaxLength: config.auth.passwordPolicy.maxLength,
    passwordMinLength: config.auth.passwordPolicy.minLength
  }));

  app.get("/api/auth/session", async (request, reply) => {
    const authUser = await authenticateRequest(request, reply, { optional: true });

    if (!authUser) {
      return reply.code(401).send({ message: "Unauthorized" });
    }

    return {
      authenticated: true,
      user: authUser
    };
  });

  app.post("/api/auth/login", async (request, reply) => {
    let body: { email: string; password: string };

    try {
      body = readLoginBody(request.body);
    } catch (error) {
      return reply.code(400).send({ message: toErrorMessage(error, "Invalid login payload.") });
    }

    const normalizedEmail = body.email.toLowerCase();
    const user = await store.findUserByEmail(normalizedEmail);
    const client = getClientMetadata(request);

    if (!user) {
      await recordAudit(app, store, {
        email: normalizedEmail,
        ...client,
        reason: "unknown_email",
        success: false,
        type: "sign_in_failed"
      });

      return reply.code(401).send({ message: "Invalid email or password." });
    }

    if (user.status !== "active") {
      await recordAudit(app, store, {
        email: user.email,
        ...client,
        reason: "disabled_account",
        role: user.role,
        success: false,
        type: "sign_in_failed",
        userId: user.id
      });

      return reply.code(403).send({ message: "Account is disabled." });
    }

    const passwordMatches = await verifyPassword(body.password, user.passwordHash);

    if (!passwordMatches) {
      await recordAudit(app, store, {
        email: user.email,
        ...client,
        reason: "invalid_password",
        role: user.role,
        success: false,
        type: "sign_in_failed",
        userId: user.id
      });

      return reply.code(401).send({ message: "Invalid email or password." });
    }

    const sessionToken = randomBytes(32).toString("base64url");
    const sessionTokenHash = hashSessionToken(sessionToken, config.auth.session.secret);
    const expiresAt = new Date(Date.now() + config.auth.session.maxAgeMinutes * 60_000).toISOString();

    await store.createSession({
      expiresAt,
      ipAddress: client.ipAddress,
      tokenHash: sessionTokenHash,
      userAgent: client.userAgent,
      userId: user.id
    });

    setSessionCookie(reply, config, sessionToken);
    attachCsrfHeader(reply, config, sessionToken);

    await recordAudit(app, store, {
      actorEmail: user.email,
      actorUserId: user.id,
      email: user.email,
      ...client,
      role: user.role,
      success: true,
      type: "sign_in_succeeded",
      userId: user.id
    });

    return {
      bootstrapPasswordHint:
        publicBootstrapUsers.length > 0 ? DEVELOPMENT_BOOTSTRAP_PASSWORD : undefined,
      user: buildSessionUser(config, user)
    };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const authUser = await authenticateRequest(request, reply, { optional: true, skipCsrf: true });

    if (reply.sent) {
      return;
    }

    const token = readSessionToken(request, config);

    if (token) {
      await store.deleteSession(hashSessionToken(token, config.auth.session.secret));
    }

    clearSessionCookie(reply, config);

    if (authUser) {
      const client = getClientMetadata(request);

      await recordAudit(app, store, {
        actorEmail: authUser.email,
        actorUserId: authUser.id,
        email: authUser.email,
        ...client,
        role: authUser.role,
        success: true,
        type: "sign_out",
        userId: authUser.id
      });
    }

    return reply.code(204).send();
  });

  app.post("/api/auth/password", async (request, reply) => {
    const authUser = await authenticateRequest(request, reply);

    if (!authUser) {
      return;
    }

    let body: { currentPassword: string; nextPassword: string };

    try {
      body = readPasswordChangeBody(request.body);
    } catch (error) {
      return reply.code(400).send({ message: toErrorMessage(error, "Invalid password payload.") });
    }

    const passwordIssues = validatePasswordPolicy(body.nextPassword, config.auth.passwordPolicy);

    if (body.currentPassword === body.nextPassword) {
      passwordIssues.push("New password must be different from the current password.");
    }

    if (passwordIssues.length > 0) {
      return reply.code(400).send({
        details: passwordIssues,
        message: "Password does not meet the configured policy."
      });
    }

    const storedUser = await store.findUserById(authUser.id);

    if (!storedUser || storedUser.status !== "active") {
      clearSessionCookie(reply, config);
      return reply.code(404).send({ message: "User not found." });
    }

    const currentPasswordMatches = await verifyPassword(body.currentPassword, storedUser.passwordHash);

    if (!currentPasswordMatches) {
      return reply.code(400).send({ message: "Current password is incorrect." });
    }

    const nextPasswordHash = await hashPassword(body.nextPassword, config.auth.passwordPolicy);
    const updatedUser = await store.updateUserPassword(storedUser.id, nextPasswordHash, false);

    if (!updatedUser) {
      return reply.code(404).send({ message: "User not found." });
    }

    await store.deleteSessionsByUserId(updatedUser.id);

    const client = getClientMetadata(request);
    const sessionToken = randomBytes(32).toString("base64url");
    const sessionTokenHash = hashSessionToken(sessionToken, config.auth.session.secret);
    const expiresAt = new Date(Date.now() + config.auth.session.maxAgeMinutes * 60_000).toISOString();

    await store.createSession({
      expiresAt,
      ipAddress: client.ipAddress,
      tokenHash: sessionTokenHash,
      userAgent: client.userAgent,
      userId: updatedUser.id
    });

    request.authTokenHash = sessionTokenHash;
    request.authUser = buildSessionUser(config, updatedUser);
    setSessionCookie(reply, config, sessionToken);
    attachCsrfHeader(reply, config, sessionToken);

    await recordAudit(app, store, {
      actorEmail: updatedUser.email,
      actorUserId: updatedUser.id,
      email: updatedUser.email,
      ...client,
      metadata: {
        mustChangePassword: false
      },
      role: updatedUser.role,
      success: true,
      type: "password_changed",
      userId: updatedUser.id
    });

    return reply.code(204).send();
  });

  app.get("/api/admin/dashboard", async (request, reply) => {
    const authUser = await requirePermission(request, reply, "admin:access");

    if (!authUser) {
      return;
    }

    return {
      auth: {
        passwordMaxLength: config.auth.passwordPolicy.maxLength,
        passwordMinLength: config.auth.passwordPolicy.minLength,
        roleLabel: config.auth.rbac.roles[authUser.role].label
      },
      bootstrapUsersEnabled: publicBootstrapUsers.length > 0,
      bootstrapPasswordHint:
        publicBootstrapUsers.length > 0 ? DEVELOPMENT_BOOTSTRAP_PASSWORD : undefined,
      featureFlags: config.featureFlags,
      tenant: config.tenant,
      user: authUser
    };
  });

  app.get("/api/admin/audit-events", async (request, reply) => {
    const authUser = await requirePermission(request, reply, "audit:read");

    if (!authUser) {
      return;
    }

    const limit = Math.max(1, Math.min(readLimit(request), 100));
    const filters = readAuditFilters(request.query);

    return {
      events: await store.listAuditEvents(limit, filters),
      user: authUser
    };
  });

  app.get("/api/admin/users", async (request, reply) => {
    const authUser = await requirePermission(request, reply, "users:manage");

    if (!authUser) {
      return;
    }

    const filters = readManagedUserFilters(request.query);
    const users = await store.listUsers(filters);

    return {
      user: authUser,
      users: users.map(toManagedUser)
    };
  });

  app.post("/api/admin/users", async (request, reply) => {
    const authUser = await requirePermission(request, reply, "users:manage");

    if (!authUser) {
      return;
    }

    let body: ManagedUserMutationBody;

    try {
      body = readManagedUserMutationBody(request.body);
    } catch (error) {
      return reply.code(400).send({ message: toErrorMessage(error, "Invalid user payload.") });
    }

    const existingUser = await store.findUserByEmail(body.email);

    if (existingUser) {
      return reply.code(409).send({ message: "A user with that email already exists." });
    }

    const temporaryPassword = generateTemporaryPassword(config.auth.passwordPolicy);
    const passwordHash = await hashPassword(temporaryPassword, config.auth.passwordPolicy);
    const createdUser = await store.createUser({
      displayName: body.displayName,
      email: body.email,
      mustChangePassword: true,
      passwordHash,
      role: body.role,
      status: body.status
    });

    const client = getClientMetadata(request);
    await recordAudit(app, store, {
      actorEmail: authUser.email,
      actorUserId: authUser.id,
      email: createdUser.email,
      ...client,
      metadata: {
        createdAt: createdUser.createdAt,
        mustChangePassword: createdUser.mustChangePassword,
        status: createdUser.status
      },
      role: createdUser.role,
      success: true,
      type: "user_created",
      userId: createdUser.id
    });

    return reply.code(201).send({
      temporaryPassword,
      user: toManagedUser(createdUser)
    });
  });

  app.patch("/api/admin/users/:userId", async (request, reply) => {
    const authUser = await requirePermission(request, reply, "users:manage");

    if (!authUser) {
      return;
    }

    const { userId } = readUserParams(request.params);
    const existingUser = await store.findUserById(userId);

    if (!existingUser) {
      return reply.code(404).send({ message: "User not found." });
    }

    let body: ManagedUserMutationBody;

    try {
      body = readManagedUserMutationBody(request.body);
    } catch (error) {
      return reply.code(400).send({ message: toErrorMessage(error, "Invalid user payload.") });
    }

    if (existingUser.id === authUser.id) {
      if (body.role !== existingUser.role) {
        return reply.code(400).send({ message: "You cannot change your own role from the admin user-management flow." });
      }

      if (body.status !== "active") {
        return reply.code(400).send({ message: "You cannot disable your own account." });
      }
    }

    const conflictingUser = await store.findUserByEmail(body.email);

    if (conflictingUser && conflictingUser.id !== existingUser.id) {
      return reply.code(409).send({ message: "A user with that email already exists." });
    }

    try {
      await ensureActiveSuperAdminRetained(store, existingUser, body.role, body.status);
    } catch (error) {
      return reply.code(400).send({ message: toErrorMessage(error, "Unable to update user.") });
    }

    const updatedUser = await store.updateUser(existingUser.id, body);

    if (!updatedUser) {
      return reply.code(404).send({ message: "User not found." });
    }

    if (updatedUser.status !== "active") {
      await store.deleteSessionsByUserId(updatedUser.id);
    }

    const client = getClientMetadata(request);
    const changedFields = getChangedFields(existingUser, updatedUser);

    await recordAudit(app, store, {
      actorEmail: authUser.email,
      actorUserId: authUser.id,
      email: updatedUser.email,
      ...client,
      metadata: {
        changedFields,
        next: {
          displayName: updatedUser.displayName,
          email: updatedUser.email,
          role: updatedUser.role,
          status: updatedUser.status
        },
        previous: {
          displayName: existingUser.displayName,
          email: existingUser.email,
          role: existingUser.role,
          status: existingUser.status
        }
      },
      role: updatedUser.role,
      success: true,
      type: "user_updated",
      userId: updatedUser.id
    });

    if (existingUser.role !== updatedUser.role) {
      await recordAudit(app, store, {
        actorEmail: authUser.email,
        actorUserId: authUser.id,
        email: updatedUser.email,
        ...client,
        metadata: {
          nextRole: updatedUser.role,
          previousRole: existingUser.role
        },
        role: updatedUser.role,
        success: true,
        type: "user_role_changed",
        userId: updatedUser.id
      });
    }

    if (existingUser.status !== updatedUser.status) {
      await recordAudit(app, store, {
        actorEmail: authUser.email,
        actorUserId: authUser.id,
        email: updatedUser.email,
        ...client,
        metadata: {
          nextStatus: updatedUser.status,
          previousStatus: existingUser.status
        },
        role: updatedUser.role,
        success: true,
        type: "user_status_changed",
        userId: updatedUser.id
      });
    }

    return {
      user: toManagedUser(updatedUser)
    };
  });

  app.post("/api/admin/users/:userId/reset-password", async (request, reply) => {
    const authUser = await requirePermission(request, reply, "users:manage");

    if (!authUser) {
      return;
    }

    const { userId } = readUserParams(request.params);
    const existingUser = await store.findUserById(userId);

    if (!existingUser) {
      return reply.code(404).send({ message: "User not found." });
    }

    if (existingUser.id === authUser.id) {
      return reply.code(400).send({ message: "Use the self-service password change flow for your own account." });
    }

    const temporaryPassword = generateTemporaryPassword(config.auth.passwordPolicy);
    const passwordHash = await hashPassword(temporaryPassword, config.auth.passwordPolicy);
    const updatedUser = await store.updateUserPassword(existingUser.id, passwordHash, true);

    if (!updatedUser) {
      return reply.code(404).send({ message: "User not found." });
    }

    await store.deleteSessionsByUserId(updatedUser.id);

    const client = getClientMetadata(request);
    await recordAudit(app, store, {
      actorEmail: authUser.email,
      actorUserId: authUser.id,
      email: updatedUser.email,
      ...client,
      metadata: {
        mustChangePassword: true,
        resetByAdmin: true
      },
      role: updatedUser.role,
      success: true,
      type: "password_reset",
      userId: updatedUser.id
    });

    return {
      temporaryPassword,
      user: toManagedUser(updatedUser)
    };
  });

  app.get("/api/admin/users/:userId/audit-events", async (request, reply) => {
    const authUser = await requirePermission(request, reply, "users:manage");

    if (!authUser) {
      return;
    }

    const { userId } = readUserParams(request.params);
    const existingUser = await store.findUserById(userId);

    if (!existingUser) {
      return reply.code(404).send({ message: "User not found." });
    }

    const limit = Math.max(1, Math.min(readLimit(request), 100));
    const filters = readAuditFilters(request.query);

    return {
      events: await store.listAuditEvents(limit, {
        ...filters,
        userId
      }),
      user: authUser
    };
  });
}

function attachCsrfHeader(reply: FastifyReply, config: CmsConfig, sessionToken: string): void {
  reply.header(config.auth.csrf.headerName, deriveCsrfToken(sessionToken, config.auth.csrf.secret));
}

function buildSessionUser(config: CmsConfig, user: StoredUser): SessionUser {
  return {
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    mustChangePassword: user.mustChangePassword,
    permissions: getRolePermissions(config, user.role),
    role: user.role,
    status: user.status
  };
}

function clearSessionCookie(reply: FastifyReply, config: CmsConfig): void {
  reply.header(
    "Set-Cookie",
    serializeCookie(config.auth.session.cookieName, "", config, 0)
  );
}

function deriveCsrfToken(sessionToken: string, secret: string): string {
  return createHmac("sha256", secret).update(sessionToken).digest("base64url");
}

async function ensureActiveSuperAdminRetained(
  store: AuthStore,
  existingUser: StoredUser,
  nextRole: StoredUser["role"],
  nextStatus: UserAccountStatus
): Promise<void> {
  if (existingUser.role !== "super_admin" || existingUser.status !== "active") {
    return;
  }

  if (nextRole === "super_admin" && nextStatus === "active") {
    return;
  }

  const activeSuperAdmins = await store.listUsers({
    role: "super_admin",
    status: "active"
  });
  const remainingActiveSuperAdmins = activeSuperAdmins.filter((candidate) => candidate.id !== existingUser.id);

  if (remainingActiveSuperAdmins.length === 0) {
    throw new Error("At least one active super_admin account must remain available.");
  }
}

async function ensureCsrfProtection(
  app: FastifyInstance,
  store: AuthStore,
  request: FastifyRequest,
  reply: FastifyReply,
  config: CmsConfig,
  authUser: SessionUser,
  sessionToken: string
): Promise<boolean> {
  if (!shouldValidateCsrf(request.method)) {
    return true;
  }

  const actualToken = readHeaderValue(request.headers, config.auth.csrf.headerName);
  const expectedToken = deriveCsrfToken(sessionToken, config.auth.csrf.secret);

  if (actualToken === expectedToken) {
    return true;
  }

  const client = getClientMetadata(request);
  await recordAudit(app, store, {
    actorEmail: authUser.email,
    actorUserId: authUser.id,
    email: authUser.email,
    ...client,
    metadata: {
      csrfHeaderName: config.auth.csrf.headerName
    },
    reason: "missing_or_invalid_token",
    role: authUser.role,
    success: false,
    type: "csrf_validation_failed",
    userId: authUser.id
  });

  reply.code(403).send({ message: "CSRF validation failed." });
  return false;
}

function formatSameSiteValue(value: CmsConfig["auth"]["session"]["sameSite"]): string {
  switch (value) {
    case "strict":
      return "Strict";
    case "none":
      return "None";
    case "lax":
    default:
      return "Lax";
  }
}

function getChangedFields(existingUser: StoredUser, updatedUser: StoredUser): string[] {
  const changedFields: string[] = [];

  if (existingUser.displayName !== updatedUser.displayName) {
    changedFields.push("displayName");
  }

  if (existingUser.email !== updatedUser.email) {
    changedFields.push("email");
  }

  if (existingUser.role !== updatedUser.role) {
    changedFields.push("role");
  }

  if (existingUser.status !== updatedUser.status) {
    changedFields.push("status");
  }

  return changedFields;
}

function getClientMetadata(request: FastifyRequest): { ipAddress?: string; userAgent?: string } {
  return {
    ipAddress: request.ip,
    userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : undefined
  };
}

function hashSessionToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("base64url");
}

function isAuditEventType(value: unknown): value is AuditEventType {
  return value === "sign_in_succeeded"
    || value === "sign_in_failed"
    || value === "sign_out"
    || value === "password_changed"
    || value === "password_reset"
    || value === "user_created"
    || value === "user_updated"
    || value === "user_role_changed"
    || value === "user_status_changed"
    || value === "csrf_validation_failed";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUserAccountStatus(value: unknown): value is UserAccountStatus {
  return value === "active" || value === "disabled";
}

function isUserRole(value: unknown): value is StoredUser["role"] {
  return value === "super_admin"
    || value === "dispatcher"
    || value === "operator"
    || value === "viewer";
}

function readAuditFilters(query: unknown): AuditEventFilters {
  if (!isPlainObject(query)) {
    return {};
  }

  const search = typeof query.search === "string" && query.search.trim() !== "" ? query.search.trim() : undefined;
  const type = isAuditEventType(query.type) ? query.type : undefined;
  const success = readOptionalBoolean(query.success);
  const userId = typeof query.userId === "string" && query.userId.trim() !== "" ? query.userId.trim() : undefined;

  return { search, success, type, userId };
}

function readHeaderValue(headers: FastifyRequest["headers"], headerName: string): string | undefined {
  const headerValue = headers[headerName.toLowerCase()];
  const normalized = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return typeof normalized === "string" && normalized.trim() !== "" ? normalized.trim() : undefined;
}

function readLimit(request: FastifyRequest): number {
  const query = request.query as { limit?: number | string };
  const rawLimit = query?.limit;

  if (rawLimit === undefined) {
    return 50;
  }

  const parsed = typeof rawLimit === "number" ? rawLimit : Number(rawLimit);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 50;
}

function readLoginBody(body: unknown): { email: string; password: string } {
  if (!isPlainObject(body)) {
    throw new Error("Invalid login payload.");
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!isValidEmail(email)) {
    throw new Error("A valid email address is required.");
  }

  if (password === "") {
    throw new Error("Password is required.");
  }

  if (password.length > MAX_PASSWORD_INPUT_LENGTH) {
    throw new Error(`Password must be at most ${MAX_PASSWORD_INPUT_LENGTH} characters long.`);
  }

  return { email, password };
}

function readManagedUserFilters(query: unknown): ManagedUserFilters {
  if (!isPlainObject(query)) {
    return {};
  }

  const search = typeof query.search === "string" && query.search.trim() !== "" ? query.search.trim() : undefined;
  const role = isUserRole(query.role) ? query.role : undefined;
  const status = isUserAccountStatus(query.status) ? query.status : undefined;

  return { role, search, status };
}

function readManagedUserMutationBody(body: unknown): ManagedUserMutationBody {
  if (!isPlainObject(body)) {
    throw new Error("User payload must be a JSON object.");
  }

  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body.role;
  const status = body.status;

  if (displayName === "") {
    throw new Error("Display name is required.");
  }

  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error(`Display name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters long.`);
  }

  if (!isValidEmail(email)) {
    throw new Error("A valid email address is required.");
  }

  if (!isUserRole(role)) {
    throw new Error("A valid role is required.");
  }

  if (!isUserAccountStatus(status)) {
    throw new Error("A valid account status is required.");
  }

  return {
    displayName,
    email,
    role,
    status
  };
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

function readPasswordChangeBody(body: unknown): { currentPassword: string; nextPassword: string } {
  if (!isPlainObject(body)) {
    throw new Error("Invalid password payload.");
  }

  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const nextPassword = typeof body.nextPassword === "string" ? body.nextPassword : "";

  if (currentPassword === "" || nextPassword === "") {
    throw new Error("Current and next password are required.");
  }

  if (currentPassword.length > MAX_PASSWORD_INPUT_LENGTH || nextPassword.length > MAX_PASSWORD_INPUT_LENGTH) {
    throw new Error(`Passwords must be at most ${MAX_PASSWORD_INPUT_LENGTH} characters long.`);
  }

  return { currentPassword, nextPassword };
}

function readSessionToken(request: FastifyRequest, config: CmsConfig): string | undefined {
  const rawCookieHeader = typeof request.headers.cookie === "string" ? request.headers.cookie : undefined;
  return readCookieValue(rawCookieHeader, config.auth.session.cookieName);
}

function readCookieValue(rawCookieHeader: string | undefined, cookieName: string): string | undefined {
  if (!rawCookieHeader) {
    return undefined;
  }

  const entries = rawCookieHeader.split(";");

  for (const entry of entries) {
    const [rawKey, ...rawValueParts] = entry.trim().split("=");

    if (rawKey === cookieName) {
      return decodeURIComponent(rawValueParts.join("="));
    }
  }

  return undefined;
}

function readUserParams(params: unknown): { userId: string } {
  if (!isPlainObject(params) || typeof params.userId !== "string" || params.userId.trim() === "") {
    throw new Error("User id is required.");
  }

  const userId = params.userId.trim();

  if (userId.length > 64) {
    throw new Error("User id is invalid.");
  }

  return { userId };
}

async function recordAudit(
  app: FastifyInstance,
  store: AuthStore,
  event: {
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
): Promise<void> {
  const createdEvent = await store.recordAudit(event);

  app.log.info(
    {
      auditEvent: createdEvent
    },
    "Authentication audit event"
  );
}

function serializeCookie(
  cookieName: string,
  value: string,
  config: CmsConfig,
  maxAgeSeconds: number
): string {
  const segments = [
    `${cookieName}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "Path=/",
    `SameSite=${formatSameSiteValue(config.auth.session.sameSite)}`,
    `Max-Age=${maxAgeSeconds}`
  ];

  if (config.auth.session.secureCookies) {
    segments.push("Secure");
  }

  return segments.join("; ");
}

function setSessionCookie(reply: FastifyReply, config: CmsConfig, sessionToken: string): void {
  reply.header(
    "Set-Cookie",
    serializeCookie(
      config.auth.session.cookieName,
      sessionToken,
      config,
      config.auth.session.maxAgeMinutes * 60
    )
  );
}

function shouldValidateCsrf(method: string): boolean {
  const normalizedMethod = method.toUpperCase();
  return normalizedMethod === "POST" || normalizedMethod === "PUT" || normalizedMethod === "PATCH" || normalizedMethod === "DELETE";
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function toManagedUser(user: StoredUser): Omit<StoredUser, "passwordHash"> {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

function isValidEmail(value: string): boolean {
  return value.length > 0 && value.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(value);
}
