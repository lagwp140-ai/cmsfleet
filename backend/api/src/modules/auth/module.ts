import { createHmac, randomBytes } from "node:crypto";

import type { CmsConfig, ConfigRuntimeContext } from "@cmsfleet/config-runtime";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { createBootstrapUsers, DEVELOPMENT_BOOTSTRAP_PASSWORD } from "./bootstrap-users.js";
import { hashPassword, verifyPassword } from "./password-hasher.js";
import { PostgresAuthStore } from "./postgres-store.js";
import { getRolePermissions, hasPermission } from "./rbac.js";
import type { AuthStore } from "./store.js";
import type { SessionUser, StoredUser } from "./types.js";

export async function registerAuthModule(
  app: FastifyInstance,
  config: CmsConfig,
  _context: ConfigRuntimeContext
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
  const store: AuthStore = new PostgresAuthStore(config.runtime.database.url);

  await store.init();
  await store.upsertBootstrapUsers(bootstrapUsers);

  app.addHook("onClose", async () => {
    await store.close();
  });

  async function authenticateRequest(
    request: FastifyRequest,
    reply: FastifyReply,
    options: { optional?: boolean } = {}
  ): Promise<SessionUser | undefined> {
    if (request.authUser) {
      return request.authUser;
    }

    const token = readSessionToken(request, config);

    if (!token) {
      if (!options.optional) {
        reply.code(401).send({ message: "Unauthorized" });
      }

      return undefined;
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

    if (!storedUser) {
      clearSessionCookie(reply, config);

      if (!options.optional) {
        reply.code(401).send({ message: "Unauthorized" });
      }

      return undefined;
    }

    const authUser = buildSessionUser(config, storedUser);
    request.authTokenHash = tokenHash;
    request.authUser = authUser;

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

  app.get("/api/auth/metadata", async () => ({
    bootstrapPasswordHint:
      publicBootstrapUsers.length > 0 ? DEVELOPMENT_BOOTSTRAP_PASSWORD : undefined,
    bootstrapUsers: publicBootstrapUsers,
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
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Invalid login payload." });
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

    await recordAudit(app, store, {
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
    const authUser = await authenticateRequest(request, reply, { optional: true });
    const token = readSessionToken(request, config);

    if (token) {
      await store.deleteSession(hashSessionToken(token, config.auth.session.secret));
    }

    clearSessionCookie(reply, config);

    if (authUser) {
      const client = getClientMetadata(request);

      await recordAudit(app, store, {
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
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Invalid password payload." });
    }

    if (body.nextPassword.length < config.auth.passwordPolicy.minLength) {
      return reply.code(400).send({
        message: `Password must be at least ${config.auth.passwordPolicy.minLength} characters long.`
      });
    }

    const storedUser = await store.findUserById(authUser.id);

    if (!storedUser) {
      return reply.code(404).send({ message: "User not found." });
    }

    const currentPasswordMatches = await verifyPassword(body.currentPassword, storedUser.passwordHash);

    if (!currentPasswordMatches) {
      return reply.code(400).send({ message: "Current password is incorrect." });
    }

    const nextPasswordHash = await hashPassword(body.nextPassword, config.auth.passwordPolicy);
    const updatedUser = await store.updateUserPassword(storedUser.id, nextPasswordHash);

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

    await recordAudit(app, store, {
      email: updatedUser.email,
      ...client,
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

    return {
      events: await store.listAuditEvents(limit),
      user: authUser
    };
  });
}

function buildSessionUser(config: CmsConfig, user: StoredUser): SessionUser {
  return {
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    permissions: getRolePermissions(config, user.role),
    role: user.role
  };
}

function clearSessionCookie(reply: FastifyReply, config: CmsConfig): void {
  reply.header(
    "Set-Cookie",
    serializeCookie(config.auth.session.cookieName, "", config.auth.session.secureCookies, 0)
  );
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

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (email === "" || password === "") {
    throw new Error("Email and password are required.");
  }

  return { email, password };
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

  return { currentPassword, nextPassword };
}

function readSessionToken(request: FastifyRequest, config: CmsConfig): string | undefined {
  const rawCookieHeader = typeof request.headers.cookie === "string" ? request.headers.cookie : undefined;
  return readCookieValue(rawCookieHeader, config.auth.session.cookieName);
}

async function recordAudit(
  app: FastifyInstance,
  store: AuthStore,
  event: {
    email?: string;
    ipAddress?: string;
    reason?: string;
    role?: StoredUser["role"];
    success: boolean;
    type: "sign_in_succeeded" | "sign_in_failed" | "sign_out" | "password_changed";
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
  secureCookies: boolean,
  maxAgeSeconds: number
): string {
  const segments = [
    `${cookieName}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`
  ];

  if (secureCookies) {
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
      config.auth.session.secureCookies,
      config.auth.session.maxAgeMinutes * 60
    )
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
