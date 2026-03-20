import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { CmsConfig } from "@cmsfleet/config-runtime";

interface RateLimitDecision {
  remaining: number;
  retryAfterSeconds: number;
  exceeded: boolean;
}

interface RateLimitProfile {
  key: string;
  maxRequests: number;
  windowSeconds: number;
}

interface RateLimitBucket {
  count: number;
  resetAtMs: number;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function registerSecurityHardening(app: FastifyInstance, config: CmsConfig): void {
  const limiter = new InMemoryRateLimiter();

  app.addHook("onRequest", async (request, reply) => {
    applySecurityHeaders(request, reply, config);

    const profile = resolveRateLimitProfile(request, config);

    if (!profile) {
      return;
    }

    const decision = limiter.consume(`${profile.key}:${request.ip}`, profile.maxRequests, profile.windowSeconds);
    reply.header("X-RateLimit-Limit", String(profile.maxRequests));
    reply.header("X-RateLimit-Remaining", String(decision.remaining));
    reply.header("X-RateLimit-Reset", String(decision.retryAfterSeconds));

    if (!decision.exceeded) {
      return;
    }

    reply.header("Retry-After", String(decision.retryAfterSeconds));
    request.log.warn(
      {
        ip: request.ip,
        method: request.method,
        path: getRequestPath(request),
        rateLimitKey: profile.key,
        retryAfterSeconds: decision.retryAfterSeconds
      },
      "Rate limit exceeded"
    );

    reply.code(429).send({
      code: "rate_limited",
      details: [`Retry after ${decision.retryAfterSeconds} seconds.`],
      message: "Too many requests. Please retry later."
    });
  });
}

function applySecurityHeaders(request: FastifyRequest, reply: FastifyReply, config: CmsConfig): void {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  reply.header("Cross-Origin-Opener-Policy", "same-origin");
  reply.header("Cross-Origin-Resource-Policy", "same-site");
  reply.header("Content-Security-Policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");

  if (isApiPath(request)) {
    reply.header("Cache-Control", "no-store, max-age=0");
    reply.header("Pragma", "no-cache");
  }

  if (config.auth.session.secureCookies && isHttpsRequest(request)) {
    reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function getRequestPath(request: FastifyRequest): string {
  return request.url.split("?")[0] ?? request.url;
}

function isApiPath(request: FastifyRequest): boolean {
  return getRequestPath(request).startsWith("/api/");
}

function isHttpsRequest(request: FastifyRequest): boolean {
  if (request.protocol === "https") {
    return true;
  }

  const forwardedProto = request.headers["x-forwarded-proto"];
  const firstProto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return typeof firstProto === "string" && firstProto.split(",")[0]?.trim().toLowerCase() === "https";
}

function isMutationMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

function resolveRateLimitProfile(request: FastifyRequest, config: CmsConfig): RateLimitProfile | undefined {
  if (!config.runtime.api.rateLimit.enabled) {
    return undefined;
  }

  if (request.method.toUpperCase() === "OPTIONS") {
    return undefined;
  }

  const path = getRequestPath(request);

  if (!path.startsWith("/api/")) {
    return undefined;
  }

  if (path === "/api/auth/login") {
    return {
      key: "login",
      maxRequests: config.runtime.api.rateLimit.loginMaxAttempts,
      windowSeconds: config.runtime.api.rateLimit.loginWindowSeconds
    };
  }

  if (isMutationMethod(request.method)) {
    return {
      key: "mutation",
      maxRequests: config.runtime.api.rateLimit.mutationMaxRequests,
      windowSeconds: config.runtime.api.rateLimit.mutationWindowSeconds
    };
  }

  return {
    key: "general",
    maxRequests: config.runtime.api.rateLimit.generalMaxRequests,
    windowSeconds: config.runtime.api.rateLimit.generalWindowSeconds
  };
}

class InMemoryRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();

  consume(key: string, maxRequests: number, windowSeconds: number): RateLimitDecision {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const existing = this.buckets.get(key);
    const bucket = !existing || existing.resetAtMs <= now
      ? { count: 0, resetAtMs: now + windowMs }
      : existing;

    this.pruneExpired(now);

    if (bucket.count >= maxRequests) {
      this.buckets.set(key, bucket);
      return {
        exceeded: true,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAtMs - now) / 1000))
      };
    }

    bucket.count += 1;
    this.buckets.set(key, bucket);

    return {
      exceeded: false,
      remaining: Math.max(0, maxRequests - bucket.count),
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAtMs - now) / 1000))
    };
  }

  private pruneExpired(now: number): void {
    if (this.buckets.size < 500) {
      return;
    }

    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAtMs <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
