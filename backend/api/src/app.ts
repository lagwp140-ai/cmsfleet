import { hostname as getHostname } from "node:os";

import cors from "@fastify/cors";
import Fastify from "fastify";
import { Pool } from "pg";

import type { CmsConfig, ConfigRuntimeContext } from "@cmsfleet/config-runtime";

import { registerApiInfrastructure } from "./lib/api/runtime.js";
import { getRoutePattern, measureNow, ObservabilityRegistry } from "./lib/observability/service.js";
import { registerSecurityHardening } from "./lib/security/runtime.js";
import { registerAuthModule } from "./modules/auth/module.js";
import { registerConfigModule } from "./modules/config/module.js";
import { registerDiagnosticsModule } from "./modules/diagnostics/module.js";
import { registerDisplaysModule } from "./modules/displays/module.js";
import { registerGpsModule } from "./modules/gps/module.js";
import { registerGtfsModule } from "./modules/gtfs/module.js";
import { registerPlatformModule } from "./modules/platform/module.js";
import { registerRoutesModule } from "./modules/routes/module.js";
import { registerVehiclesModule } from "./modules/vehicles/module.js";

interface PoolRuntimeStats {
  idleCount?: number;
  totalCount?: number;
  waitingCount?: number;
}

export async function buildApp(config: CmsConfig, context: ConfigRuntimeContext) {
  const app = Fastify({
    logger: {
      level: config.runtime.observability.logLevel
    },
    trustProxy: config.runtime.api.trustProxy
  });
  const db = new Pool({
    connectionString: config.runtime.database.url
  });
  const observability = new ObservabilityRegistry(app.log, context, config);

  db.on("error", (error: Error) => {
    app.log.error({ err: error }, "PostgreSQL pool error");
    observability.incrementCounter("database_pool_errors_total");
  });

  app.decorate("db", db);
  app.decorate("observability", observability);

  app.addHook("onRequest", async (request) => {
    request.observabilityStartMs = measureNow();
  });

  app.addHook("onResponse", async (request, reply) => {
    const startedAt = request.observabilityStartMs ?? measureNow();
    const durationMs = Math.max(0, measureNow() - startedAt);
    const routePattern = getRoutePattern((request.routeOptions as { url?: string } | undefined)?.url ?? request.url);

    observability.observeRequest({
      durationMs,
      method: request.method,
      route: routePattern,
      statusCode: reply.statusCode
    });

    const logPayload = {
      durationMs: Number(durationMs.toFixed(2)),
      method: request.method,
      path: routePattern,
      remoteAddress: request.ip,
      requestId: request.id,
      statusCode: reply.statusCode
    };

    if (reply.statusCode >= 500) {
      request.log.error(logPayload, "HTTP request completed with server error");
      return;
    }

    if (reply.statusCode >= 400) {
      request.log.warn(logPayload, "HTTP request completed with client error");
      return;
    }

    request.log.info(logPayload, "HTTP request completed");
  });

  app.addHook("onClose", async () => {
    await db.end();
  });

  registerApiInfrastructure(app, config, context);
  registerSecurityHardening(app, config);

  observability.registerComponentProvider("api", async () => ({
    details: {
      environment: config.selection.environment,
      service: context.serviceName,
      tenant: config.tenant.id
    },
    kind: "api",
    message: "API process is running.",
    metrics: {
      api_uptime_seconds: Number(process.uptime().toFixed(3))
    },
    readiness: true,
    status: "pass"
  }));

  observability.registerComponentProvider("database", async () => {
    const startedAt = measureNow();
    await db.query("SELECT 1");
    const latencyMs = Math.max(0, measureNow() - startedAt);
    const stats = readPoolStats(db);

    return {
      details: {
        idleClients: stats.idleClients,
        totalClients: stats.totalClients,
        waitingClients: stats.waitingClients
      },
      kind: "dependency",
      message: "Database connection pool is healthy.",
      metrics: {
        database_idle_clients: stats.idleClients,
        database_latency_ms: Number(latencyMs.toFixed(2)),
        database_total_clients: stats.totalClients,
        database_waiting_clients: stats.waitingClients
      },
      readiness: true,
      status: stats.waitingClients > 20 ? "warn" : "pass"
    };
  });

  await app.register(cors, {
    allowedHeaders: buildCorsHeaderList(config.auth.csrf.headerName, ["Accept", "Content-Type", "X-Requested-With"]),
    credentials: true,
    exposedHeaders: buildCorsHeaderList(config.auth.csrf.headerName, ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"]),
    methods: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"],
    origin: buildCorsOriginResolver(config.runtime.api.corsOrigins)
  });

  await registerAuthModule(app, config, context);
  await registerVehiclesModule(app, config, context);
  await registerConfigModule(app, config, context);
  await registerDiagnosticsModule(app);
  await registerGpsModule(app, config);
  await registerGtfsModule(app, config);
  await registerPlatformModule(app, config);
  await registerRoutesModule(app, config);
  await registerDisplaysModule(app, config);

  app.get("/health/live", { config: { rawResponse: true } }, async () => ({
    ...observability.getLivenessSummary(),
    check: "liveness"
  }));

  app.get("/health/ready", { config: { rawResponse: true } }, async (_request, reply) => {
    const summary = await observability.getReadinessSummary();

    if (!summary.ready) {
      reply.code(503);
    }

    return {
      check: "readiness",
      ...summary
    };
  });

  app.get("/health", { config: { rawResponse: true } }, async (_request, reply) => {
    const overview = await observability.getOverview();

    if (!overview.readiness.ready) {
      reply.code(503);
    }

    return overview;
  });

  app.get("/metrics", { config: { rawResponse: true } }, async (_request, reply) => {
    reply.type("text/plain; version=0.0.4; charset=utf-8");
    return observability.renderMetrics();
  });

  return app;
}

function readPoolStats(pool: Pool): { idleClients: number; totalClients: number; waitingClients: number } {
  const stats = pool as Pool & PoolRuntimeStats;

  return {
    idleClients: stats.idleCount ?? 0,
    totalClients: stats.totalCount ?? 0,
    waitingClients: stats.waitingCount ?? 0
  };
}

function buildCorsHeaderList(csrfHeaderName: string, baseHeaders: string[]): string[] {
  return [...new Set([...baseHeaders, csrfHeaderName, csrfHeaderName.toLowerCase()])];
}

function buildCorsOriginResolver(allowedOrigins: string[]): (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => void {
  const expandedOrigins = new Set(
    allowedOrigins
      .flatMap((origin) => expandCorsOriginAliases(origin))
      .map(normalizeOrigin)
      .filter((origin): origin is string => origin !== null)
  );

  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = normalizeOrigin(origin);

    if (normalizedOrigin && expandedOrigins.has(normalizedOrigin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS.`), false);
  };
}

function expandCorsOriginAliases(origin: string): string[] {
  const normalizedOrigin = normalizeOrigin(origin);

  if (!normalizedOrigin) {
    return [];
  }

  const parsedOrigin = tryParseUrl(normalizedOrigin);

  if (!parsedOrigin || !isAliasFriendlyHostname(parsedOrigin.hostname)) {
    return [normalizedOrigin];
  }

  const candidateHosts = new Set([parsedOrigin.hostname, "localhost", "127.0.0.1", "[::1]", getHostname().toLowerCase()]);
  const candidateOrigins: string[] = [];

  for (const host of candidateHosts) {
    const nextOrigin = `${parsedOrigin.protocol}//${host}${parsedOrigin.port ? `:${parsedOrigin.port}` : ""}`;
    candidateOrigins.push(nextOrigin);
  }

  return candidateOrigins;
}

function isAliasFriendlyHostname(hostname: string): boolean {
  const normalizedHost = hostname.toLowerCase();
  return normalizedHost === "localhost"
    || normalizedHost === "127.0.0.1"
    || normalizedHost === "[::1]"
    || normalizedHost === getHostname().toLowerCase();
}

function normalizeOrigin(origin: string): string | null {
  const parsedOrigin = tryParseUrl(origin);

  if (!parsedOrigin) {
    return null;
  }

  return `${parsedOrigin.protocol}//${parsedOrigin.hostname}${parsedOrigin.port ? `:${parsedOrigin.port}` : ""}`;
}

function tryParseUrl(origin: string): URL | null {
  try {
    return new URL(origin);
  } catch {
    return null;
  }
}

