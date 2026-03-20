import type { CmsConfig, ConfigRuntimeContext } from "@cmsfleet/config-runtime";

interface DocumentedRoute {
  description: string;
  method: "delete" | "get" | "patch" | "post";
  operationId: string;
  path: string;
  requestBody?: { description: string };
  successDescription: string;
  successStatus?: number;
  summary: string;
  tag: string;
}

const ROUTES: DocumentedRoute[] = [
  { description: "Service health and runtime selection.", method: "get", operationId: "getHealth", path: "/health", successDescription: "Service health snapshot.", summary: "Health check", tag: "System" },
  { description: "Process liveness probe.", method: "get", operationId: "getLiveness", path: "/health/live", successDescription: "Liveness status.", summary: "Liveness check", tag: "System" },
  { description: "Aggregated service readiness probe.", method: "get", operationId: "getReadiness", path: "/health/ready", successDescription: "Readiness status.", summary: "Readiness check", tag: "System" },
  { description: "Prometheus-compatible metrics output.", method: "get", operationId: "getMetrics", path: "/metrics", successDescription: "Metrics text exposition.", summary: "Get metrics", tag: "System" },
  { description: "Authentication metadata such as bootstrap hints in local development.", method: "get", operationId: "getAuthMetadata", path: "/api/auth/metadata", successDescription: "Authentication metadata.", summary: "Get auth metadata", tag: "Auth" },
  { description: "Resolve the currently authenticated session.", method: "get", operationId: "getAuthSession", path: "/api/auth/session", successDescription: "Current authenticated session.", summary: "Get session", tag: "Auth" },
  { description: "Start an authenticated admin session.", method: "post", operationId: "login", path: "/api/auth/login", requestBody: { description: "Login credentials." }, successDescription: "Authenticated session details.", summary: "Login", tag: "Auth" },
  { description: "Clear the current session cookie.", method: "post", operationId: "logout", path: "/api/auth/logout", successDescription: "Session cleared.", successStatus: 204, summary: "Logout", tag: "Auth" },
  { description: "Rotate the current user password.", method: "post", operationId: "changePassword", path: "/api/auth/password", requestBody: { description: "Current and next password." }, successDescription: "Password changed.", successStatus: 204, summary: "Change password", tag: "Auth" },
  { description: "Dashboard bootstrap data for the admin console.", method: "get", operationId: "getAdminDashboard", path: "/api/admin/dashboard", successDescription: "Dashboard context.", summary: "Get admin dashboard", tag: "Admin" },
  { description: "Authentication and security audit trail.", method: "get", operationId: "listAuditEvents", path: "/api/admin/audit-events", successDescription: "Audit event list.", summary: "List audit events", tag: "Auth" },
  { description: "Managed user registry.", method: "get", operationId: "listUsers", path: "/api/admin/users", successDescription: "User registry.", summary: "List users", tag: "Users" },
  { description: "Create a managed CMS account.", method: "post", operationId: "createUser", path: "/api/admin/users", requestBody: { description: "New user payload." }, successDescription: "Created user and temporary password.", successStatus: 201, summary: "Create user", tag: "Users" },
  { description: "Update account profile, role, or status.", method: "patch", operationId: "updateUser", path: "/api/admin/users/{userId}", requestBody: { description: "Updated user payload." }, successDescription: "Updated user.", summary: "Update user", tag: "Users" },
  { description: "Reset a managed user password and invalidate sessions.", method: "post", operationId: "resetUserPassword", path: "/api/admin/users/{userId}/reset-password", successDescription: "Temporary password and updated user state.", summary: "Reset user password", tag: "Users" },
  { description: "Security history for a single managed account.", method: "get", operationId: "getUserAuditEvents", path: "/api/admin/users/{userId}/audit-events", successDescription: "User audit history.", summary: "Get user audit history", tag: "Users" },
  { description: "Vehicle registry.", method: "get", operationId: "listVehicles", path: "/api/admin/vehicles", successDescription: "Managed vehicles.", summary: "List vehicles", tag: "Vehicles" },
  { description: "Vehicle assignment catalogs and options.", method: "get", operationId: "getVehicleOptions", path: "/api/admin/vehicles/options", successDescription: "Vehicle management options.", summary: "Get vehicle options", tag: "Vehicles" },
  { description: "Single vehicle detail.", method: "get", operationId: "getVehicle", path: "/api/admin/vehicles/{vehicleId}", successDescription: "Vehicle detail.", summary: "Get vehicle", tag: "Vehicles" },
  { description: "Create a vehicle record.", method: "post", operationId: "createVehicle", path: "/api/admin/vehicles", requestBody: { description: "Vehicle payload." }, successDescription: "Created vehicle.", successStatus: 201, summary: "Create vehicle", tag: "Vehicles" },
  { description: "Update a vehicle record.", method: "patch", operationId: "updateVehicle", path: "/api/admin/vehicles/{vehicleId}", requestBody: { description: "Vehicle payload." }, successDescription: "Updated vehicle.", summary: "Update vehicle", tag: "Vehicles" },
  { description: "Delete a vehicle record.", method: "delete", operationId: "deleteVehicle", path: "/api/admin/vehicles/{vehicleId}", successDescription: "Vehicle deleted.", successStatus: 204, summary: "Delete vehicle", tag: "Vehicles" },
  { description: "HTTP JSON GPS ingestion endpoint.", method: "post", operationId: "ingestGpsHttp", path: "/api/ingest/gps/http", requestBody: { description: "Device GPS payload." }, successDescription: "GPS ingest result.", summary: "Ingest GPS payload", tag: "GPS" },
  { description: "Fleet GPS operational state summary.", method: "get", operationId: "getGpsStatus", path: "/api/admin/gps/status", successDescription: "Vehicle GPS status summary.", summary: "Get GPS status", tag: "GPS" },
  { description: "Recent ingested GPS messages.", method: "get", operationId: "listGpsMessages", path: "/api/admin/gps/messages", successDescription: "Recent GPS messages.", summary: "List GPS messages", tag: "GPS" },
  { description: "GTFS dataset and import overview.", method: "get", operationId: "getGtfsOverview", path: "/api/admin/gtfs/overview", successDescription: "GTFS overview.", summary: "Get GTFS overview", tag: "GTFS" },
  { description: "GTFS import job history.", method: "get", operationId: "listGtfsLogs", path: "/api/admin/gtfs/logs", successDescription: "GTFS import logs.", summary: "List GTFS logs", tag: "GTFS" },
  { description: "Validation and import errors for a GTFS job.", method: "get", operationId: "getGtfsImportErrors", path: "/api/admin/gtfs/imports/{jobId}/errors", successDescription: "GTFS validation errors.", summary: "Get GTFS import errors", tag: "GTFS" },
  { description: "Import a GTFS package from a local file path.", method: "post", operationId: "importGtfsFromPath", path: "/api/admin/gtfs/imports/from-path", requestBody: { description: "Path import request." }, successDescription: "GTFS import result.", summary: "Import GTFS from path", tag: "GTFS" },
  { description: "Import a GTFS package from an uploaded ZIP payload.", method: "post", operationId: "importGtfsUpload", path: "/api/admin/gtfs/imports/upload", requestBody: { description: "Upload import request." }, successDescription: "GTFS import result.", summary: "Import GTFS upload", tag: "GTFS" },
  { description: "Activate a GTFS dataset.", method: "post", operationId: "activateGtfsDataset", path: "/api/admin/gtfs/datasets/{datasetId}/activate", successDescription: "Dataset activated.", successStatus: 204, summary: "Activate GTFS dataset", tag: "GTFS" },
  { description: "Rollback to a previous GTFS dataset.", method: "post", operationId: "rollbackGtfsDataset", path: "/api/admin/gtfs/datasets/{datasetId}/rollback", successDescription: "Dataset rolled back.", successStatus: 204, summary: "Rollback GTFS dataset", tag: "GTFS" },
  { description: "Current route resolution state for vehicles.", method: "get", operationId: "getRouteStatus", path: "/api/admin/routes/status", successDescription: "Route resolution status.", summary: "Get route status", tag: "Routes" },
  { description: "Display domain model, profiles, and capabilities.", method: "get", operationId: "getDisplayDomain", path: "/api/admin/displays/domain", successDescription: "Display domain model.", summary: "Get display domain", tag: "Displays" },
  { description: "Display adapter health and queue summary.", method: "get", operationId: "getDisplayAdapterStatus", path: "/api/admin/displays/adapter-status", successDescription: "Display adapter status.", summary: "Get display adapter status", tag: "Displays" },
  { description: "Display delivery history.", method: "get", operationId: "listDisplayDeliveries", path: "/api/admin/displays/deliveries", successDescription: "Display delivery history.", summary: "List display deliveries", tag: "Displays" },
  { description: "Generate structured display commands.", method: "post", operationId: "generateDisplayCommands", path: "/api/admin/displays/commands", requestBody: { description: "Display command context." }, successDescription: "Display command payload.", summary: "Generate display commands", tag: "Displays" },
  { description: "Generate and enqueue a display delivery.", method: "post", operationId: "publishDisplayCommand", path: "/api/admin/displays/publish", requestBody: { description: "Display publish request." }, successDescription: "Display publish result.", summary: "Publish display commands", tag: "Displays" },
  { description: "Render a display preview.", method: "post", operationId: "previewDisplayCommand", path: "/api/admin/displays/preview", requestBody: { description: "Display preview request." }, successDescription: "Display preview result.", summary: "Preview display commands", tag: "Displays" },
  { description: "Configuration management overview.", method: "get", operationId: "getConfigOverview", path: "/api/admin/config/overview", successDescription: "Configuration overview.", summary: "Get config overview", tag: "Config" },
  { description: "Load one editable configuration scope.", method: "get", operationId: "getConfigScope", path: "/api/admin/config/scopes/{scopeType}/{scopeKey}", successDescription: "Configuration scope.", summary: "Get config scope", tag: "Config" },
  { description: "Validate a staged configuration payload.", method: "post", operationId: "validateConfigScope", path: "/api/admin/config/scopes/{scopeType}/{scopeKey}/validate", requestBody: { description: "Configuration validation request." }, successDescription: "Validation result.", summary: "Validate config scope", tag: "Config" },
  { description: "Apply a configuration payload and create a version snapshot.", method: "post", operationId: "applyConfigScope", path: "/api/admin/config/scopes/{scopeType}/{scopeKey}/apply", requestBody: { description: "Configuration apply request." }, successDescription: "Apply result.", summary: "Apply config scope", tag: "Config" },
  { description: "Diff saved configuration versions.", method: "get", operationId: "diffConfigScope", path: "/api/admin/config/scopes/{scopeType}/{scopeKey}/diff", successDescription: "Version diff.", summary: "Diff config scope", tag: "Config" },
  { description: "Rollback a configuration scope to a previous version.", method: "post", operationId: "rollbackConfigScope", path: "/api/admin/config/scopes/{scopeType}/{scopeKey}/rollback", requestBody: { description: "Configuration rollback request." }, successDescription: "Rollback result.", summary: "Rollback config scope", tag: "Config" },
  { description: "Aggregated observability overview, component health, and recent failures.", method: "get", operationId: "getObservabilityOverview", path: "/api/admin/observability/overview", successDescription: "Observability overview.", summary: "Get observability overview", tag: "Diagnostics" },
  { description: "Searchable system and device events.", method: "get", operationId: "listSystemEvents", path: "/api/admin/system-events", successDescription: "System events.", summary: "List system events", tag: "Diagnostics" }
];

export function createOpenApiDocument(config: CmsConfig, context: ConfigRuntimeContext): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of ROUTES) {
    const pathItem: Record<string, unknown> = paths[route.path] ?? {};
    pathItem[route.method] = buildOperation(route);
    paths[route.path] = pathItem;
  }

  return {
    openapi: "3.1.0",
    info: {
      description: `Standardized REST API for the ${config.branding.operatorName} bus CMS deployment. All JSON endpoints return a consistent success or error envelope.`,
      title: `${config.branding.operatorName} Bus CMS API`,
      version: "0.1.0"
    },
    servers: [
      {
        description: `${context.serviceName} relative server`,
        url: "/"
      }
    ],
    tags: [
      { name: "System" },
      { name: "Auth" },
      { name: "Admin" },
      { name: "Users" },
      { name: "Vehicles" },
      { name: "GPS" },
      { name: "GTFS" },
      { name: "Routes" },
      { name: "Displays" },
      { name: "Config" },
      { name: "Diagnostics" }
    ],
    components: {
      securitySchemes: {
        sessionCookie: {
          in: "cookie",
          name: config.auth.session.cookieName,
          type: "apiKey"
        }
      },
      schemas: {
        ApiSuccessEnvelope: {
          additionalProperties: false,
          properties: {
            data: {},
            meta: { $ref: "#/components/schemas/ApiResponseMeta" },
            success: { const: true, type: "boolean" }
          },
          required: ["success", "data", "meta"],
          type: "object"
        },
        ApiErrorEnvelope: {
          additionalProperties: false,
          properties: {
            error: {
              additionalProperties: false,
              properties: {
                code: { type: "string" },
                details: {},
                message: { type: "string" }
              },
              required: ["code", "message"],
              type: "object"
            },
            meta: { $ref: "#/components/schemas/ApiResponseMeta" },
            success: { const: false, type: "boolean" }
          },
          required: ["success", "error", "meta"],
          type: "object"
        },
        ApiResponseMeta: {
          additionalProperties: false,
          properties: {
            method: { type: "string" },
            path: { type: "string" },
            requestId: { type: "string" },
            statusCode: { type: "integer" },
            timestamp: { format: "date-time", type: "string" }
          },
          required: ["requestId", "timestamp", "method", "path", "statusCode"],
          type: "object"
        },
        GenericRequestBody: {
          additionalProperties: true,
          type: "object"
        }
      }
    },
    paths
  };
}

export function renderApiDocsHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Bus CMS API Docs</title>
    <style>
      body { background: #eef3f7; color: #122333; font-family: "Segoe UI", sans-serif; margin: 0; }
      main { margin: 0 auto; max-width: 960px; padding: 40px 24px 64px; }
      .card { background: #fff; border: 1px solid #d3dee8; border-radius: 18px; box-shadow: 0 14px 34px rgba(18, 35, 51, 0.08); margin-top: 20px; padding: 24px; }
      h1, h2 { margin: 0 0 12px; }
      p, li { line-height: 1.65; }
      code, pre { background: #0f1b28; border-radius: 12px; color: #d8e5f0; font-family: Consolas, monospace; }
      code { padding: 2px 8px; }
      pre { overflow: auto; padding: 16px; }
      a { color: #0c78ba; text-decoration: none; }
      ul { padding-left: 20px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Bus CMS API</h1>
      <p>The backend now uses a unified JSON contract: successful responses return <code>{ success: true, data, meta }</code> and failures return <code>{ success: false, error, meta }</code>.</p>
      <div class="card">
        <h2>OpenAPI</h2>
        <p>Download or inspect the machine-readable contract at <a href="/api/openapi.json">/api/openapi.json</a>.</p>
      </div>
      <div class="card">
        <h2>Error strategy</h2>
        <ul>
          <li>400 for malformed payloads and invalid parameters</li>
          <li>401 for missing or expired authentication</li>
          <li>403 for permission failures</li>
          <li>404 for unknown resources or routes</li>
          <li>409 for state conflicts such as duplicates</li>
          <li>500 for unexpected server failures</li>
        </ul>
      </div>
      <div class="card">
        <h2>Envelope examples</h2>
        <pre>{
  "success": true,
  "data": { "example": true },
  "meta": {
    "requestId": "req-123",
    "timestamp": "2026-03-19T12:00:00.000Z",
    "method": "GET",
    "path": "/api/admin/dashboard",
    "statusCode": 200
  }
}</pre>
        <pre>{
  "success": false,
  "error": {
    "code": "validation_error",
    "message": "The request failed validation.",
    "details": ["/email: must be string"]
  },
  "meta": {
    "requestId": "req-124",
    "timestamp": "2026-03-19T12:00:01.000Z",
    "method": "POST",
    "path": "/api/auth/login",
    "statusCode": 400
  }
}</pre>
      </div>
    </main>
  </body>
</html>`;
}

function buildOperation(route: DocumentedRoute): Record<string, unknown> {
  const successStatus = String(route.successStatus ?? 200);
  const requiresSession = !route.path.startsWith("/api/ingest/") && route.path !== "/health" && route.path !== "/health/live" && route.path !== "/health/ready" && route.path !== "/metrics" && route.path !== "/api/auth/metadata" && route.path !== "/api/auth/login";

  return {
    operationId: route.operationId,
    summary: route.summary,
    description: route.description,
    tags: [route.tag],
    security: requiresSession ? [{ sessionCookie: [] }] : [],
    requestBody: route.requestBody
      ? {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/GenericRequestBody" }
            }
          },
          description: route.requestBody.description,
          required: true
        }
      : undefined,
    responses: {
      [successStatus]: buildSuccessResponse(route.successDescription, route.successStatus ?? 200),
      "400": buildErrorResponse("Bad request"),
      "401": buildErrorResponse("Unauthorized"),
      "403": buildErrorResponse("Forbidden"),
      "404": buildErrorResponse("Not found"),
      "409": buildErrorResponse("Conflict"),
      "500": buildErrorResponse("Internal error")
    }
  };
}

function buildErrorResponse(description: string): Record<string, unknown> {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          $ref: "#/components/schemas/ApiErrorEnvelope"
        }
      }
    }
  };
}

function buildSuccessResponse(description: string, statusCode: number): Record<string, unknown> {
  if (statusCode === 204) {
    return {
      description
    };
  }

  return {
    description,
    content: {
      "application/json": {
        schema: {
          $ref: "#/components/schemas/ApiSuccessEnvelope"
        }
      }
    }
  };
}



