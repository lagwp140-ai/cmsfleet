import { afterEach, describe, expect, it } from "vitest";

import { createAuthApiTestApp } from "../helpers/api-app.js";
import { DEVELOPMENT_BOOTSTRAP_PASSWORD } from "../../src/modules/auth/bootstrap-users.js";

const openApps: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  while (openApps.length > 0) {
    const app = openApps.pop();
    if (app) {
      await app.close();
    }
  }
});

describe("auth module API", () => {
  it("wraps successful login and session responses in the standard API envelope", async () => {
    const { app } = await createAuthApiTestApp();
    openApps.push(app);

    const loginResponse = await app.inject({
      method: "POST",
      payload: {
        email: "admin@demo-city.local",
        password: DEVELOPMENT_BOOTSTRAP_PASSWORD
      },
      url: "/api/auth/login"
    });

    expect(loginResponse.statusCode).toBe(200);
    const loginBody = loginResponse.json();
    expect(loginBody.success).toBe(true);
    expect(loginBody.data.user.role).toBe("super_admin");
    expect(loginBody.meta.path).toBe("/api/auth/login");

    const sessionCookie = loginResponse.headers["set-cookie"];
    const csrfToken = loginResponse.headers["x-csrf-token"];
    expect(sessionCookie).toBeDefined();
    expect(csrfToken).toBeTruthy();

    const sessionResponse = await app.inject({
      headers: {
        cookie: Array.isArray(sessionCookie) ? sessionCookie[0] ?? "" : String(sessionCookie)
      },
      method: "GET",
      url: "/api/auth/session"
    });

    expect(sessionResponse.statusCode).toBe(200);
    expect(sessionResponse.headers["x-csrf-token"]).toBeTruthy();
    const sessionBody = sessionResponse.json();
    expect(sessionBody.success).toBe(true);
    expect(sessionBody.data.user.email).toBe("admin@demo-city.local");
  });

  it("returns a structured error envelope for invalid credentials", async () => {
    const { app } = await createAuthApiTestApp();
    openApps.push(app);

    const response = await app.inject({
      method: "POST",
      payload: {
        email: "admin@demo-city.local",
        password: "bad-password"
      },
      url: "/api/auth/login"
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.message).toContain("Invalid email or password");
    expect(body.meta.statusCode).toBe(401);
  });

  it("rejects state-changing admin requests that do not include a CSRF token", async () => {
    const { app } = await createAuthApiTestApp();
    openApps.push(app);

    const loginResponse = await app.inject({
      method: "POST",
      payload: {
        email: "admin@demo-city.local",
        password: DEVELOPMENT_BOOTSTRAP_PASSWORD
      },
      url: "/api/auth/login"
    });
    const sessionCookie = loginResponse.headers["set-cookie"];
    const cookieHeader = Array.isArray(sessionCookie) ? sessionCookie[0] ?? "" : String(sessionCookie);

    const createResponse = await app.inject({
      headers: { cookie: cookieHeader },
      method: "POST",
      payload: {
        displayName: "Dispatcher Two",
        email: "dispatcher.two@example.test",
        role: "dispatcher",
        status: "active"
      },
      url: "/api/admin/users"
    });

    expect(createResponse.statusCode).toBe(403);
    const body = createResponse.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("CSRF validation failed");
  });

  it("allows a super admin to create a user, reset the password, and inspect account audit history", async () => {
    const { app } = await createAuthApiTestApp();
    openApps.push(app);

    const loginResponse = await app.inject({
      method: "POST",
      payload: {
        email: "admin@demo-city.local",
        password: DEVELOPMENT_BOOTSTRAP_PASSWORD
      },
      url: "/api/auth/login"
    });
    const sessionCookie = loginResponse.headers["set-cookie"];
    const csrfToken = String(loginResponse.headers["x-csrf-token"] ?? "");
    const cookieHeader = Array.isArray(sessionCookie) ? sessionCookie[0] ?? "" : String(sessionCookie);

    const createResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": csrfToken
      },
      method: "POST",
      payload: {
        displayName: "Dispatcher Two",
        email: "dispatcher.two@example.test",
        role: "dispatcher",
        status: "active"
      },
      url: "/api/admin/users"
    });

    expect(createResponse.statusCode).toBe(201);
    const createdBody = createResponse.json();
    expect(createdBody.success).toBe(true);
    expect(createdBody.data.user.mustChangePassword).toBe(true);
    expect(createdBody.data.temporaryPassword).toBeTruthy();

    const userId = createdBody.data.user.id as string;

    const resetResponse = await app.inject({
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": csrfToken
      },
      method: "POST",
      url: `/api/admin/users/${userId}/reset-password`
    });

    expect(resetResponse.statusCode).toBe(200);
    const resetBody = resetResponse.json();
    expect(resetBody.success).toBe(true);
    expect(resetBody.data.user.mustChangePassword).toBe(true);
    expect(resetBody.data.temporaryPassword).toBeTruthy();

    const auditResponse = await app.inject({
      headers: { cookie: cookieHeader },
      method: "GET",
      url: `/api/admin/users/${userId}/audit-events`
    });

    expect(auditResponse.statusCode).toBe(200);
    const auditBody = auditResponse.json();
    expect(auditBody.success).toBe(true);
    expect(auditBody.data.events.some((event: { type: string }) => event.type === "user_created")).toBe(true);
    expect(auditBody.data.events.some((event: { type: string }) => event.type === "password_reset")).toBe(true);
  });
});
