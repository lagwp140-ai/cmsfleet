# PostgreSQL Schema and Migrations

The canonical PostgreSQL schema for the CMS lives in [`backend/api/db/migrations`](/c:/Projects/cmsfleet/backend/api/db/migrations). The migration set is organized by domain so identity, fleet data, transit reference data, telemetry, and operational history can evolve without one monolithic SQL file.

## Migration Order

1. `0001_extensions_and_schemas`
2. `0002_auth_and_access`
3. `0003_rbac_seed`
4. `0004_fleet_and_transit`
5. `0005_operations_telemetry_config_system`
6. `0006_vehicle_assignment_and_route_override`
7. `0007_gps_operational_state`

## Domain Layout

- `auth`: users, roles, permissions, user-role assignments, password credentials, and sessions
- `fleet`: vehicles plus device, display, and transport profile assignment state
- `transit`: routes, route variants, trips, stops, and stop times
- `operations`: GTFS import jobs and display messages
- `telemetry`: append-heavy GPS messages, current vehicle positions, and derived vehicle operational state
- `config`: versioned JSON configuration snapshots
- `system`: audit logs and runtime/system events

## Applying Migrations

Use `psql` directly or run the helper script from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/apply-db-migrations.ps1
```

To apply down migrations instead:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/apply-db-migrations.ps1 -Direction down
```

The script reads `CMS_DATABASE_URL` by default and applies files in lexical order.

## Notes

- `telemetry.gps_messages` is partitioned by `received_at` and starts with a default partition so ingestion can begin immediately.
- `telemetry.vehicle_positions` remains the hot-path coordinate table for latest fix lookups.
- `0007_gps_operational_state` adds `telemetry.vehicle_operational_states` so connection health, movement state, speed, heading, and future telemetry enrichments are stored separately from raw events.
- Route and stop lookup rely on trigram indexes for operator search paths and composite indexes for schedule joins.
- `0006_vehicle_assignment_and_route_override` adds administrative enablement, transport profile keys, and manual route override support to `fleet.vehicles`.
- The current auth runtime still bootstraps its own temporary `cms_auth_*` tables; the migration set is the intended canonical schema for the next auth persistence refactor.
