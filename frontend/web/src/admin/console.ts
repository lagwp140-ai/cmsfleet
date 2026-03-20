import { formatConsoleDateTime } from "../lib/time";
import type { AdminDashboardResponse, AuditEvent } from "../auth/types";

export type AdminSectionKey =
  | "dashboard"
  | "vehicles"
  | "gps"
  | "routes"
  | "gtfs"
  | "displays"
  | "devices"
  | "logs"
  | "config"
  | "users"
  | "system";

export interface AdminSection {
  description: string;
  group: "Operations" | "Platform";
  key: AdminSectionKey;
  label: string;
  path: string;
  permission?: string;
}

export interface AdminConsoleContextValue {
  activeSection: AdminSection;
  auditEvents: AuditEvent[];
  dashboard: AdminDashboardResponse | null;
  error: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  lastUpdatedAt: string | null;
  refreshConsole: () => Promise<void>;
}

export interface ModuleMetric {
  detail: string;
  label: string;
  tone?: "accent" | "critical" | "good" | "neutral" | "warn";
  value: string;
}

export interface ModuleRow {
  label: string;
  meta?: string;
  tone?: "accent" | "critical" | "good" | "neutral" | "warn";
  value: string;
}

export interface ModulePanel {
  description: string;
  rows: ModuleRow[];
  title: string;
}

export interface ModuleDefinition {
  eyebrow: string;
  notes: string[];
  panels: ModulePanel[];
  summary: string;
  title: string;
  metrics: ModuleMetric[];
}

export interface RoleBlueprint {
  access: string;
  description: string;
  label: string;
  permissions: string[];
  role: "dispatcher" | "operator" | "super_admin" | "viewer";
}

export const adminSections: AdminSection[] = [
  {
    description: "Live control posture, service summary, and quick system health.",
    group: "Operations",
    key: "dashboard",
    label: "Dashboard",
    path: ""
  },
  {
    description: "Vehicle classes, assignment posture, and onboard readiness.",
    group: "Operations",
    key: "vehicles",
    label: "Vehicles",
    path: "vehicles",
    permission: "fleet:read"
  },
  {
    description: "GPS source quality, freshness, and vehicle matching signals.",
    group: "Operations",
    key: "gps",
    label: "GPS",
    path: "gps",
    permission: "fleet:read"
  },
  {
    description: "Route publishing, trip strategy, and operational release lanes.",
    group: "Operations",
    key: "routes",
    label: "Routes",
    path: "routes",
    permission: "dispatch:manage"
  },
  {
    description: "Static and realtime feed posture for imports and schedule sync.",
    group: "Operations",
    key: "gtfs",
    label: "GTFS",
    path: "gtfs",
    permission: "dispatch:manage"
  },
  {
    description: "LED templates, mappings, and destination rendering controls.",
    group: "Operations",
    key: "displays",
    label: "Displays",
    path: "displays",
    permission: "content:manage"
  },
  {
    description: "Edge hardware, connectivity posture, and field device inventory.",
    group: "Platform",
    key: "devices",
    label: "Devices",
    path: "devices",
    permission: "fleet:read"
  },
  {
    description: "Operational audit trails, sign-in history, and service events.",
    group: "Platform",
    key: "logs",
    label: "Logs",
    path: "logs",
    permission: "admin:access"
  },
  {
    description: "Deployment profiles, feature flags, and runtime override posture.",
    group: "Platform",
    key: "config",
    label: "Config",
    path: "config",
    permission: "users:manage"
  },
  {
    description: "Role matrix, operator access model, and account governance.",
    group: "Platform",
    key: "users",
    label: "Users",
    path: "users",
    permission: "users:manage"
  },
  {
    description: "System hardening, environment posture, and service baseline.",
    group: "Platform",
    key: "system",
    label: "System",
    path: "system",
    permission: "fleet:read"
  }
];

const defaultAdminSection = adminSections[0]!;

export const roleBlueprints: RoleBlueprint[] = [
  {
    access: "Full platform control",
    description: "Owns tenant setup, user administration, auditing, and privileged platform changes.",
    label: "Super Admin",
    permissions: ["admin:access", "audit:read", "content:manage", "dispatch:manage", "fleet:read", "fleet:manage", "auth:self", "users:manage"],
    role: "super_admin"
  },
  {
    access: "Dispatch and schedule operations",
    description: "Manages route releases, dispatch workflows, and operational audit visibility.",
    label: "Dispatcher",
    permissions: ["admin:access", "audit:read", "dispatch:manage", "fleet:read", "fleet:manage", "auth:self"],
    role: "dispatcher"
  },
  {
    access: "Display and content operations",
    description: "Controls sign content, operator workflows, and fleet-aware publishing tasks.",
    label: "Operator",
    permissions: ["admin:access", "content:manage", "fleet:read", "fleet:manage", "auth:self"],
    role: "operator"
  },
  {
    access: "Read-only operational view",
    description: "Can inspect fleet status and system state without changing managed resources.",
    label: "Viewer",
    permissions: ["admin:access", "fleet:read", "auth:self"],
    role: "viewer"
  }
];

export function canAccessSection(permissions: string[], section: AdminSection): boolean {
  return section.permission === undefined || permissions.includes(section.permission);
}

export function countEnabledFlags(featureFlags: Record<string, boolean> | undefined): number {
  if (!featureFlags) {
    return 0;
  }

  return Object.values(featureFlags).filter(Boolean).length;
}

export function findAdminSection(pathname: string): AdminSection {
  const normalized = pathname.replace(/\/+$/, "");

  if (normalized === "/admin" || normalized === "") {
    return defaultAdminSection;
  }

  const segment = normalized.replace(/^\/admin\/?/, "").split("/")[0] ?? "";
  return adminSections.find((section) => section.path === segment) ?? defaultAdminSection;
}

export function formatConsoleTime(timestamp: string | null, locale?: string): string {
  if (!timestamp) {
    return "Awaiting sync";
  }

  return formatConsoleDateTime(timestamp, locale);
}

export function getAdminHref(section: AdminSection): string {
  return section.key === "dashboard" ? "/admin" : `/admin/${section.path}`;
}

export function getSectionGroups(): Array<{ label: AdminSection["group"]; sections: AdminSection[] }> {
  return ["Operations", "Platform"].map((label) => ({
    label,
    sections: adminSections.filter((section) => section.group === label)
  }));
}

export function buildModuleDefinition(
  moduleKey: Exclude<AdminSectionKey, "dashboard" | "logs" | "users">,
  dashboard: AdminDashboardResponse | null
): ModuleDefinition {
  const tenantName = dashboard?.tenant.displayName ?? "Transport tenant";
  const locale = dashboard?.tenant.locale ?? "en-US";
  const roleLabel = dashboard?.auth.roleLabel ?? "Operator role";
  const featureFlagCount = countEnabledFlags(dashboard?.featureFlags);

  switch (moduleKey) {
    case "vehicles":
      return {
        eyebrow: "Fleet Registry",
        title: "Vehicles",
        summary: `${tenantName} uses the CMS core to manage display-ready vehicles, assignment posture, and hardware-capability expectations from one operational shell.`,
        metrics: [
          { detail: "Vehicle groups onboarded into the shared CMS baseline.", label: "Managed classes", tone: "accent", value: "03" },
          { detail: "Units expected to publish route and destination state.", label: "Sign-ready units", tone: "good", value: "24" },
          { detail: "Vehicles flagged for accessibility-dependent content logic.", label: "Accessible coverage", tone: "good", value: "91%" },
          { detail: `Current viewer perspective: ${roleLabel}.`, label: "Console lens", tone: "neutral", value: roleLabel }
        ],
        notes: [
          "Keep vehicle-specific behavior in profile data, not component forks.",
          "Expose depot or route-group assignment as data tables before adding workflow automation.",
          "Treat accessibility and capacity data as publishing inputs for displays and dispatch tools."
        ],
        panels: [
          {
            description: "Operational posture for common fleet slices.",
            rows: [
              { label: "Urban 12m", meta: "Primary city coverage", tone: "good", value: "12 active" },
              { label: "Articulated", meta: "Peak-capacity overlay", tone: "accent", value: "06 active" },
              { label: "Reserve pool", meta: "Depot swap readiness", tone: "warn", value: "06 standby" }
            ],
            title: "Fleet segments"
          },
          {
            description: "Hardware traits the CMS should expect from onboard controllers.",
            rows: [
              { label: "Passenger capacity model", meta: "Used by planning panels", value: "70 seats baseline" },
              { label: "Wheelchair profile", meta: "Impacts stop and display messaging", value: "1 designated space" },
              { label: "Bike rack support", meta: "Show on operator-facing previews", tone: "warn", value: "Selective" }
            ],
            title: "Operational traits"
          }
        ]
      };
    case "gps":
      return {
        eyebrow: "AVL Ingress",
        title: "GPS",
        summary: `Track AVL freshness, provider selection, and map-to-vehicle identity rules before location data flows into route and display decisions for ${tenantName}.`,
        metrics: [
          { detail: "Expected maximum delay for vehicle position data.", label: "Freshness SLA", tone: "good", value: "30 s" },
          { detail: "Source currently expected by the transport profile.", label: "Primary source", tone: "accent", value: "AVL stream" },
          { detail: "Fallback posture when realtime stalls.", label: "Fallback mode", tone: "warn", value: "Hold last fix" },
          { detail: `Locale-aware timestamps currently use ${locale}.`, label: "Time locale", tone: "neutral", value: locale }
        ],
        notes: [
          "Vehicle ID matching must stay explicit and testable across tenants.",
          "Keep GPS feed adapters thin so route strategy changes do not leak into transport providers.",
          "Expose both freshness and mapping confidence when operators investigate stale signs."
        ],
        panels: [
          {
            description: "Inputs the shell should surface before route decisions are trusted.",
            rows: [
              { label: "Vehicle identifier field", meta: "Maps inbound payloads to CMS records", value: "vehicleId" },
              { label: "Position cadence", meta: "Polling or delivery interval", tone: "good", value: "5 second poll" },
              { label: "Simulation support", meta: "Useful for lab and staging validation", tone: "accent", value: "Enabled in local" }
            ],
            title: "Source contract"
          },
          {
            description: "Health checks that matter to dispatch and signage accuracy.",
            rows: [
              { label: "Trip correlation", meta: "Joins GPS to published service", tone: "good", value: "Nominal" },
              { label: "Drift threshold", meta: "Flag when geometry mismatch grows", tone: "warn", value: "150 m alert" },
              { label: "Operator escalation", meta: "Suggested next action", value: "Check feed freshness before display override" }
            ],
            title: "Quality posture"
          }
        ]
      };
    case "routes":
      return {
        eyebrow: "Service Publishing",
        title: "Routes",
        summary: "Control route strategy, dispatch visibility, and destination fallback rules from a panel that feels closer to network release management than a consumer-facing admin app.",
        metrics: [
          { detail: "Strategy currently expected by the transport profile.", label: "Publish strategy", tone: "accent", value: "Trip headsign" },
          { detail: "Fallback when service data is incomplete.", label: "Fallback destination", tone: "warn", value: "Not In Service" },
          { detail: "Operational review cadence for dispatch changes.", label: "Release lane", tone: "good", value: "Staged" },
          { detail: "Teams with direct route control in the RBAC baseline.", label: "Write roles", tone: "neutral", value: "Dispatcher + Super Admin" }
        ],
        notes: [
          "Keep route selection logic transport-profile driven.",
          "Favor explicit publish stages before building bulk-edit flows.",
          "Make fallback messaging visible to both dispatch and display operators."
        ],
        panels: [
          {
            description: "Where route data currently comes from and how it should be interpreted.",
            rows: [
              { label: "Primary destination source", meta: "When trip data is healthy", tone: "good", value: "GTFS headsign" },
              { label: "Realtime preference", meta: "Override static service when available", tone: "accent", value: "Trip updates first" },
              { label: "Degraded mode", meta: "If trip correlation drops", tone: "warn", value: "Display fallback destination" }
            ],
            title: "Routing policy"
          },
          {
            description: "Operational hooks that should exist before route automation expands.",
            rows: [
              { label: "Dispatch review queue", meta: "Human validation before publish", value: "Pending implementation" },
              { label: "Line family grouping", meta: "Useful for corridor control", value: "Planned" },
              { label: "Release audit coverage", meta: "Tie publish actions to operator identity", tone: "good", value: "Active via auth audit" }
            ],
            title: "Operational controls"
          }
        ]
      };
    case "gtfs":
      return {
        eyebrow: "Transit Feed Control",
        title: "GTFS",
        summary: "Treat GTFS as an operational dependency with clear ingestion posture, validation expectations, and escalation signals rather than a hidden backend feed.",
        metrics: [
          { detail: "Static feed refresh rhythm expected by operations.", label: "Static cadence", tone: "accent", value: "Nightly" },
          { detail: "Realtime contract readiness for trip and vehicle signals.", label: "Realtime posture", tone: "good", value: "Expandable" },
          { detail: "Team primarily responsible for schedule integrity.", label: "Owner role", tone: "neutral", value: "Dispatch" },
          { detail: `Feature flags currently enabled in this tenant: ${featureFlagCount}.`, label: "Enabled flags", tone: "good", value: String(featureFlagCount).padStart(2, "0") }
        ],
        notes: [
          "Separate feed ingestion concerns from route publishing UI concerns.",
          "Reserve Java processing for GTFS-heavy computation once the contract stabilizes.",
          "Surface import latency and validation errors before operators need to infer them from display issues."
        ],
        panels: [
          {
            description: "Feeds and handoff stages the platform should expose clearly.",
            rows: [
              { label: "Static feed", meta: "Agency ZIP package", tone: "good", value: "Configured" },
              { label: "Trip updates", meta: "Realtime merge input", tone: "warn", value: "Profile-ready" },
              { label: "Vehicle positions", meta: "Supports route correlation", tone: "warn", value: "Profile-ready" }
            ],
            title: "Feed lanes"
          },
          {
            description: "Validation checkpoints for production-safe schedule publishing.",
            rows: [
              { label: "Schema validation", meta: "Reject malformed imports", tone: "good", value: "Required" },
              { label: "Service overlap review", meta: "Watch conflicting calendar windows", value: "Recommended" },
              { label: "Stop sequence drift", meta: "Important for interior signage", tone: "accent", value: "Monitor continuously" }
            ],
            title: "Validation posture"
          }
        ]
      };
    case "displays":
      return {
        eyebrow: "Signage Control",
        title: "Displays",
        summary: "Manage LED mappings, brightness policy, and destination composition in a dense, technical shell that matches the operational feel of field hardware consoles.",
        metrics: [
          { detail: "Front, side, rear, and interior mapping lanes.", label: "Mapped surfaces", tone: "good", value: "04" },
          { detail: "Current destination template shape.", label: "Template mode", tone: "accent", value: "Route + headsign" },
          { detail: "Brightness posture for daytime readability.", label: "Brightness target", tone: "good", value: "80%" },
          { detail: "Role baseline with direct publishing authority.", label: "Write roles", tone: "neutral", value: "Operator + Super Admin" }
        ],
        notes: [
          "Display mappings should stay profile-driven so new controller families do not fork the UI.",
          "Keep preview logic separate from publish logic.",
          "Expose degraded templates so route fallback behavior is obvious to operators."
        ],
        panels: [
          {
            description: "How the platform currently composes passenger-facing messages.",
            rows: [
              { label: "Front sign", meta: "Route short name plus headsign", tone: "good", value: "Configured" },
              { label: "Side sign", meta: "Destination with via segment", tone: "good", value: "Configured" },
              { label: "Interior sign", meta: "Next stop progression", tone: "accent", value: "Configured" }
            ],
            title: "Render lanes"
          },
          {
            description: "Controller-level controls that usually matter in the field first.",
            rows: [
              { label: "Provider family", meta: "Controller contract", value: "Hanover-class profile" },
              { label: "Gateway mode", meta: "Transport to onboard sign controller", value: "Ethernet" },
              { label: "Low-light override", meta: "Night route tuning", tone: "warn", value: "Policy pending" }
            ],
            title: "Controller posture"
          }
        ]
      };
    case "devices":
      return {
        eyebrow: "Edge Estate",
        title: "Devices",
        summary: "Track the field hardware estate, connectivity posture, and provisioning expectations for transport endpoints without mixing those concerns into business modules.",
        metrics: [
          { detail: "Expected onboard controller family in the selected profile.", label: "Edge platform", tone: "accent", value: "Industrial PC" },
          { detail: "Connectivity model for field devices.", label: "Connectivity", tone: "good", value: "GPS / LTE / Wi-Fi" },
          { detail: "Preferred support posture for remote access.", label: "Remote ops", tone: "good", value: "Managed tunnels" },
          { detail: "Baseline OS family currently assumed.", label: "Device OS", tone: "neutral", value: "Linux" }
        ],
        notes: [
          "Keep device telemetry separate from auth and route concerns.",
          "Expose controller capabilities as profiles before building vendor-specific UI branches.",
          "Treat connectivity and provisioning as first-class operational status."
        ],
        panels: [
          {
            description: "Field-hardware assumptions the current platform shell should reflect.",
            rows: [
              { label: "Provisioning path", meta: "Factory or field enrollment", value: "Scripted" },
              { label: "VPN posture", meta: "Required for remote diagnostics", tone: "good", value: "Preferred" },
              { label: "Offline tolerance", meta: "How long content should remain safe", tone: "warn", value: "Cache last published state" }
            ],
            title: "Provisioning"
          },
          {
            description: "Hardware support signals that matter in day-to-day fleet operations.",
            rows: [
              { label: "Power recovery", meta: "Restart behavior after ignition cycle", value: "Auto resume" },
              { label: "Cellular fallback", meta: "If depot Wi-Fi is unavailable", tone: "good", value: "Active" },
              { label: "Health beacon", meta: "Recommend heartbeat before remote commands", tone: "accent", value: "Planned" }
            ],
            title: "Field posture"
          }
        ]
      };
    case "config":
      return {
        eyebrow: "Deployment Layers",
        title: "Config",
        summary: "Configuration stays the main extension surface for transport deployments, so this shell emphasizes profile layering, feature flags, and override discipline.",
        metrics: [
          { detail: "Base, environment, profile, and env-layer strategy.", label: "Override layers", tone: "accent", value: "06" },
          { detail: `Feature flags enabled for ${tenantName}.`, label: "Feature flags on", tone: "good", value: String(featureFlagCount).padStart(2, "0") },
          { detail: "Secrets and runtime overrides expected outside source control.", label: "Secret source", tone: "warn", value: "Environment" },
          { detail: `Tenant locale currently resolved to ${locale}.`, label: "Resolved locale", tone: "neutral", value: locale }
        ],
        notes: [
          "Add tenant differences as config before adding code branches.",
          "Keep environment secrets outside committed JSON files.",
          "Pair new config fields with schema and sample profile updates in the same change."
        ],
        panels: [
          {
            description: "Ordered layers the loader resolves before services bind ports.",
            rows: [
              { label: "Base config", meta: "Shared CMS defaults", tone: "good", value: "Required" },
              { label: "Environment overrides", meta: "Local, staging, production", tone: "good", value: "Required" },
              { label: "Dynamic env overrides", meta: "Last-mile deployment control", tone: "accent", value: "Supported" }
            ],
            title: "Resolution order"
          },
          {
            description: "Operational governance rules already encoded into startup validation.",
            rows: [
              { label: "Placeholder secret guard", meta: "Fail outside local if unchanged", tone: "good", value: "Active" },
              { label: "Bootstrap user policy", meta: "Local only", tone: "good", value: "Active" },
              { label: "Secure cookie policy", meta: "Required in production", tone: "good", value: "Active" }
            ],
            title: "Runtime policy"
          }
        ]
      };
    case "system":
      return {
        eyebrow: "Platform Baseline",
        title: "System",
        summary: "Surface the overall service baseline, hardening posture, and operational readiness checks that make the admin console feel like field infrastructure rather than a marketing dashboard.",
        metrics: [
          { detail: "Session model protecting the admin surface.", label: "Auth boundary", tone: "good", value: "Cookie session" },
          { detail: "Primary state store for users, sessions, and CMS data.", label: "System of record", tone: "accent", value: "PostgreSQL" },
          { detail: "Current tenant currently bound into the console.", label: "Tenant", tone: "neutral", value: tenantName },
          { detail: "Bootstrap accounts only appear in local deployments.", label: "Bootstrap policy", tone: "warn", value: dashboard?.bootstrapUsersEnabled ? "Local active" : "Disabled" }
        ],
        notes: [
          "Keep operational health checks visible at the shell level.",
          "Prefer migration-controlled schema ownership once the first production deployment is near.",
          "Treat auth audit and config validation as part of system posture, not add-ons."
        ],
        panels: [
          {
            description: "Critical building blocks for a stable admin platform.",
            rows: [
              { label: "API runtime", meta: "Main transactional boundary", tone: "good", value: "Fastify" },
              { label: "Frontend shell", meta: "Operator console surface", tone: "good", value: "React + Vite" },
              { label: "Worker plane", meta: "Async integrations and sync tasks", tone: "accent", value: "Node services" }
            ],
            title: "Runtime stack"
          },
          {
            description: "Hardening controls that should remain visible in every deployment review.",
            rows: [
              { label: "Password hashing", meta: "Config-driven PBKDF2-SHA512", tone: "good", value: "Enabled" },
              { label: "Audit trail", meta: "Sign-in, sign-out, password change, failures", tone: "good", value: "Enabled" },
              { label: "Schema validation", meta: "Fail-fast config loading", tone: "good", value: "Enabled" }
            ],
            title: "Security posture"
          }
        ]
      };
    default:
      throw new Error(`Unsupported admin module definition: ${moduleKey}`);
  }
}






