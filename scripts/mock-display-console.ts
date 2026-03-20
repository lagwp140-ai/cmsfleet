import { setTimeout as delay } from "node:timers/promises";

import { loadLocalEnv, readApiBaseUrl } from "./lib/dev-env.js";

interface ParsedArguments {
  apiBaseUrl?: string;
  command: "publish" | "status" | "watch";
  email: string;
  intervalMs: number;
  limit: number;
  message?: string;
  password: string;
  systemStatus: "normal" | "service_message" | "stop_announcement" | "emergency" | "test_pattern" | "preview";
  vehicleId?: string;
}

loadLocalEnv();

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const argumentsMap = parseArguments(process.argv.slice(2));
  const apiBaseUrl = argumentsMap.apiBaseUrl ?? readApiBaseUrl();
  const cookie = await login(apiBaseUrl, argumentsMap.email, argumentsMap.password);

  switch (argumentsMap.command) {
    case "status":
      await printStatus(apiBaseUrl, cookie);
      break;
    case "watch":
      for (let index = 0; index < argumentsMap.limit; index += 1) {
        await printStatus(apiBaseUrl, cookie);
        if (index < argumentsMap.limit - 1) {
          await delay(argumentsMap.intervalMs);
        }
      }
      break;
    case "publish":
    default:
      await publishDisplayCommand(apiBaseUrl, cookie, argumentsMap);
      break;
  }
}

async function login(apiBaseUrl: string, email: string, password: string): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    body: JSON.stringify({ email, password }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to authenticate for display admin tooling: ${response.status} ${body}`);
  }

  const cookie = response.headers.get("set-cookie");

  if (!cookie) {
    throw new Error("Display admin login did not return a session cookie.");
  }

  return cookie.split(",")[0] ?? cookie;
}

async function printStatus(apiBaseUrl: string, cookie: string): Promise<void> {
  const [queueOverview, deliveries] = await Promise.all([
    fetchJson(`${apiBaseUrl}/api/admin/displays/adapter-status`, cookie),
    fetchJson(`${apiBaseUrl}/api/admin/displays/deliveries?limit=5`, cookie)
  ]);

  const queue = queueOverview.data ?? queueOverview;
  const deliveryData = deliveries.data ?? deliveries;
  console.info(`[display] adapter=${queue.adapter.state} mode=${queue.adapter.adapterMode} queueDepth=${queue.queueDepth} retryDepth=${queue.retryDepth}`);

  for (const delivery of deliveryData.deliveries ?? []) {
    console.info(
      `[display] ${delivery.deliveryId} status=${delivery.status} attempts=${delivery.attemptCount} vehicle=${delivery.payload?.vehicle?.vehicleCode ?? "n/a"}`
    );
  }
}

async function publishDisplayCommand(apiBaseUrl: string, cookie: string, input: ParsedArguments): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/admin/displays/publish`, {
    body: JSON.stringify({
      destination: input.vehicleId === "BUS-A1" ? "Airport Terminal" : "Central Station",
      emergencyMessage: input.message ?? "Service disruption",
      headsign: input.vehicleId === "BUS-A1" ? "Airport Terminal" : "Central Station",
      nextStop: input.vehicleId === "BUS-A1" ? "Airport Terminal" : "Market Square",
      routeLongName: input.vehicleId === "BUS-A1" ? "Central Station - Airport Terminal" : "Central Station - Riverside",
      routeShortName: input.vehicleId === "BUS-A1" ? "A1" : "24",
      serviceMessage: input.message ?? "Operator test message",
      systemStatus: input.systemStatus,
      testPatternLabel: input.systemStatus === "test_pattern" ? "PANEL" : undefined,
      vehicleId: input.vehicleId,
      via: input.vehicleId === "BUS-A1" ? "Airport Terminal" : "Downtown"
    }),
    headers: {
      cookie,
      "content-type": "application/json"
    },
    method: "POST"
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Display publish failed: ${response.status} ${JSON.stringify(body)}`);
  }

  const data = body.data ?? body;
  console.info(`[display] queued ${data.delivery.deliveryId} for ${data.command.payload.vehicle?.vehicleCode ?? "preview"}`);
  console.info(`[display] ${data.command.payload.panels.map((panel: { panel: string; previewText: string }) => `${panel.panel}: ${panel.previewText}`).join(" | ")}`);
}

async function fetchJson(url: string, cookie: string): Promise<Record<string, any>> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        cookie
      }
    });
    const body = await response.json().catch(() => ({}));

    if (response.ok) {
      return body as Record<string, any>;
    }

    if (response.status === 429 && attempt < 3) {
      const retryAfterMs = readRetryAfterMs(response, body as Record<string, any>);
      console.warn(`[display] rate limited for ${url}; retrying in ${Math.ceil(retryAfterMs / 1000)}s`);
      await delay(retryAfterMs);
      continue;
    }

    throw new Error(`Request failed for ${url}: ${response.status} ${JSON.stringify(body)}`);
  }

  throw new Error(`Request failed for ${url}: retries exhausted`);
}

function readRetryAfterMs(response: Response, body: Record<string, any>): number {
  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  const details = Array.isArray(body?.error?.details) ? body.error.details : [];
  const retryAfterDetail = typeof details[0] === "string" ? details[0].match(/(\d+)/) : null;

  if (retryAfterDetail) {
    return Number(retryAfterDetail[1]) * 1000;
  }

  return 5000;
}

function parseArguments(argumentsList: string[]): ParsedArguments {
  const commandValue = argumentsList[0] === "status" || argumentsList[0] === "watch" || argumentsList[0] === "publish"
    ? argumentsList[0]
    : "publish";
  const options: ParsedArguments = {
    command: commandValue,
    email: "admin@demo-city.local",
    intervalMs: 5000,
    limit: 10,
    password: process.env.CMSFLEET_DEV_PASSWORD ?? "Transit!Demo2026",
    systemStatus: "service_message"
  };

  for (let index = 1; index < argumentsList.length; index += 1) {
    const current = argumentsList[index];

    switch (current) {
      case "--api-base-url":
        options.apiBaseUrl = argumentsList[index + 1];
        index += 1;
        break;
      case "--email":
        options.email = argumentsList[index + 1] ?? options.email;
        index += 1;
        break;
      case "--password":
        options.password = argumentsList[index + 1] ?? options.password;
        index += 1;
        break;
      case "--interval-ms":
        options.intervalMs = Number(argumentsList[index + 1] ?? options.intervalMs);
        index += 1;
        break;
      case "--limit":
        options.limit = Number(argumentsList[index + 1] ?? options.limit);
        index += 1;
        break;
      case "--message":
        options.message = argumentsList[index + 1];
        index += 1;
        break;
      case "--system-status": {
        const value = argumentsList[index + 1];
        if (
          value === "normal" ||
          value === "service_message" ||
          value === "stop_announcement" ||
          value === "emergency" ||
          value === "test_pattern" ||
          value === "preview"
        ) {
          options.systemStatus = value;
        }
        index += 1;
        break;
      }
      case "--vehicle-id":
        options.vehicleId = argumentsList[index + 1];
        index += 1;
        break;
      default:
        break;
    }
  }

  return options;
}
