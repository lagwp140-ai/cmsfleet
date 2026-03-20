import type { CmsConfig } from "@cmsfleet/config-runtime";

import { GPS_INGESTION_ADAPTERS, GPS_OPERATIONAL_EXTENSION_SLOTS } from "../gps/types.js";
import type { PlatformExtensionsResponse } from "./types.js";

export class PlatformArchitectureService {
  constructor(private readonly config: CmsConfig) {}

  getExtensionCatalog(): PlatformExtensionsResponse {
    return {
      activeModules: ["auth", "vehicles", "config", "diagnostics", "gps", "gtfs", "platform", "routes", "displays"],
      capabilities: [
        {
          category: "telemetry",
          contractSurfaces: [
            "POST /api/ingest/gps/http",
            "telemetry.gps_messages",
            "telemetry.vehicle_positions",
            "telemetry.vehicle_operational_states"
          ],
          dependsOn: ["gps", "fleet.vehicles"],
          id: "gps-ingestion-core",
          ownedBy: "backend/api",
          status: "active",
          summary: "The MVP already stores raw telemetry plus a stable per-vehicle operational snapshot."
        },
        {
          category: "telemetry",
          contractSurfaces: [...GPS_INGESTION_ADAPTERS],
          dependsOn: ["gps-ingestion-core"],
          id: "gps-ingestion-adapters",
          ownedBy: "backend/api",
          status: "ready",
          summary: "New MQTT or TCP ingestion adapters can reuse the existing normalization and persistence pipeline."
        },
        {
          category: "telemetry",
          contractSurfaces: [...GPS_OPERATIONAL_EXTENSION_SLOTS],
          dependsOn: ["gps-ingestion-core", "gtfs"],
          id: "gps-operational-enrichers",
          ownedBy: "backend/api",
          status: "ready",
          summary: "GPS state now exposes explicit enrichment slots for stop proximity, trip progress, and ETA without changing the MVP ingest contract."
        },
        {
          category: "dispatch",
          contractSurfaces: [...this.config.transport.routeStrategy.resolutionOrder, "gps_assisted"],
          dependsOn: ["routes", "gtfs", "gps-operational-enrichers"],
          id: "route-resolution-strategies",
          ownedBy: "backend/api",
          status: "active",
          summary: "Manual and schedule-assisted resolution stay stable while GPS-assisted auto matching plugs in as an additional strategy."
        },
        {
          category: "dispatch",
          contractSurfaces: ["RouteAutoMatcher", "operations.vehicle_route_resolutions"],
          dependsOn: ["route-resolution-strategies", "gps-operational-enrichers"],
          id: "automatic-trip-matching",
          ownedBy: "services/integration-worker",
          status: "ready",
          summary: "Automatic trip matching has a dedicated extension seam and does not need a rewrite of route persistence or admin APIs."
        },
        {
          category: "passenger-information",
          contractSurfaces: ["abstract-led-envelope", "display preview", "future audio adapter"],
          dependsOn: ["displays", "route-resolution-strategies"],
          id: "passenger-information-integration",
          ownedBy: "backend/api",
          status: "ready",
          summary: "Passenger-facing integrations can consume abstract route and stop intent instead of coupling themselves to one hardware protocol."
        },
        {
          category: "operations",
          contractSurfaces: ["system.system_events", "GET /api/admin/observability/overview", "GET /api/admin/system-events"],
          dependsOn: ["diagnostics"],
          id: "operator-observability-foundation",
          ownedBy: "backend/api",
          status: "active",
          summary: "Remote diagnostics, operator notifications, and incident workflows can build on the existing event and observability model."
        },
        {
          category: "tenanting",
          contractSurfaces: ["config selection", "tenant metadata", "shared config-runtime"],
          dependsOn: ["config", "auth"],
          id: "multi-tenant-foundation",
          ownedBy: "backend/config-runtime",
          status: "planned",
          summary: "The stack is still single-tenant, but tenant identity is already explicit in configuration and health metadata."
        }
      ],
      generatedAt: new Date().toISOString(),
      intent: "Roadmap-ready extension points around the current bus CMS MVP.",
      mvpGuardrails: [
        "Keep existing admin and ingest endpoints stable while adding new transports behind adapters.",
        "Add GPS-derived features as enrichers that decorate operational state instead of mutating the ingest contract.",
        "Add auto trip matching as a route strategy plugin rather than rewriting manual and schedule-assisted resolution.",
        "Move long-running or high-churn roadmap features into workers, map views, and operator tooling instead of bloating synchronous API paths."
      ],
      roadmap: [
        {
          deliveryRuntime: "backend/api",
          dependsOn: ["gps-ingestion-adapters"],
          id: "mqtt-tcp-gps-ingestion",
          phase: "next",
          status: "ready",
          summary: "Add MQTT and TCP adapters that terminate transport concerns before handing messages to the shared GPS ingestion service."
        },
        {
          deliveryRuntime: "services/integration-worker",
          dependsOn: ["gps-operational-enrichers", "route-resolution-strategies"],
          id: "gps-assisted-trip-matching",
          phase: "next",
          status: "ready",
          summary: "Match live positions to routes and trips using the new auto-matcher seam, then persist results in the existing route resolution table."
        },
        {
          deliveryRuntime: "services/integration-worker",
          dependsOn: ["gps-operational-enrichers", "gtfs"],
          id: "stop-proximity-and-eta",
          phase: "next",
          status: "ready",
          summary: "Populate stop proximity, trip progress, and ETA enrichments from GTFS geometry and live GPS snapshots."
        },
        {
          deliveryRuntime: "frontend/web",
          dependsOn: ["gps-ingestion-core", "gps-assisted-trip-matching"],
          id: "map-view-and-schedule-tools",
          phase: "later",
          status: "planned",
          summary: "Build map views, schedule preview, and route simulation tools on top of the existing live vehicle and route-resolution read models."
        },
        {
          deliveryRuntime: "backend/api + frontend/web",
          dependsOn: ["operator-observability-foundation"],
          id: "operator-notifications-and-incidents",
          phase: "later",
          status: "planned",
          summary: "Use the system event stream as the backbone for operator notifications, incident management, and escalation workflows."
        },
        {
          deliveryRuntime: "backend/api + services/integration-worker",
          dependsOn: ["passenger-information-integration", "stop-proximity-and-eta"],
          id: "passenger-audio-and-device-management",
          phase: "later",
          status: "planned",
          summary: "Add passenger information audio, firmware management, and remote diagnostics by consuming shared operational and event contracts."
        },
        {
          deliveryRuntime: "backend/config-runtime + backend/api",
          dependsOn: ["multi-tenant-foundation"],
          id: "multi-tenant-rollout",
          phase: "later",
          status: "planned",
          summary: "Introduce tenant isolation deliberately after operational modules stabilize, rather than complicating the MVP storage model now."
        }
      ]
    };
  }
}

