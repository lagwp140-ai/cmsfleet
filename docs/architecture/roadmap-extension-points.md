# Roadmap Extension Points

## Intent

Prepare future bus CMS modules without destabilizing the current MVP. The backend should keep existing auth, fleet, GTFS, GPS, route resolution, display, and diagnostics flows stable while exposing explicit hooks for roadmap work.

## Code-Level Extension Points

### GPS transport adapters

- The live ingestion contract remains `POST /api/ingest/gps/http` for the MVP.
- `backend/api/src/modules/gps/service.ts` now treats transport as an adapter concern.
- Supported contract identifiers are declared in `backend/api/src/modules/gps/types.ts` as `http_json`, `mqtt_json`, and `tcp_json`.
- MQTT or TCP listeners should terminate transport-specific concerns before handing a normalized payload to the shared GPS pipeline.

### GPS operational enrichers

- `backend/api/src/modules/gps/enrichers.ts` defines the post-ingest enrichment seam.
- The per-vehicle operational snapshot keeps reserved extension slots for:
  - geofence
  - route proximity
  - stop proximity
  - trip progress
  - ETA
- New enrichers should decorate `telemetry.vehicle_operational_states` instead of rewriting the ingest contract.

### Route auto matchers

- `backend/api/src/modules/routes/auto-matchers.ts` defines GPS-assisted route and trip matching as a plug-in seam.
- Manual route assignment and schedule-assisted resolution remain the stable MVP path.
- GPS-assisted matching should publish into the existing `operations.vehicle_route_resolutions` read model.

### Platform roadmap catalog

- `GET /api/admin/platform/extensions` exposes a machine-readable catalog of active foundations, reserved seams, and roadmap items.
- This endpoint is intentionally operational: it makes future module ownership and dependency boundaries explicit for implementation planning.

## Recommended Delivery Shape

### Next

- MQTT or TCP GPS ingestion adapters in `backend/api`
- GPS-assisted trip matching in `services/integration-worker`
- Stop proximity and ETA enrichers in `services/integration-worker`

### Later

- Map view, route simulation, and schedule preview in `frontend/web`
- Operator notifications and incident management on top of `system.system_events`
- Passenger information audio, firmware workflows, and remote diagnostics on top of shared operational contracts
- Multi-tenant rollout only after operational contracts and boundaries are stable

## Guardrails

- Do not break current admin, ingest, or display endpoints to make room for roadmap features.
- Prefer additive contracts over hidden TODO branches in MVP services.
- Keep long-running or failure-prone roadmap work in workers rather than synchronous API handlers.
- Treat multi-tenant support as a later isolation project, not an MVP prerequisite.
