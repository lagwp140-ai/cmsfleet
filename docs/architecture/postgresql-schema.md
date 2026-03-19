# PostgreSQL Domain Schema

## Design Goals

- Keep transactional CMS state normalized and separated by domain.
- Support append-heavy GPS ingestion without slowing down current-position lookups.
- Keep route, stop, and trip lookup efficient for operator and dispatch workflows.
- Leave room for future queue tables, replication pipelines, or PostGIS adoption without rewriting everything.

## Schema Split

### `auth`

- `users`: identity records
- `roles`: named RBAC roles
- `permissions`: atomic permission keys
- `user_roles`: normalized user-to-role assignment with a single primary role
- `role_permissions`: normalized role-to-permission mapping
- `password_credentials`: hashed password storage and change timestamps
- `sessions`: server-side session storage
- views: `user_primary_roles`, `user_effective_permissions`

### `fleet`

- `device_profiles`: onboard compute and connectivity capabilities
- `display_profiles`: LED/controller configuration contracts
- `vehicles`: fielded bus inventory and profile assignment

### `transit`

- `routes`: canonical route registry
- `stops`: stop/location reference data
- `route_variants`: direction and headsign variants per route
- `trips`: trip-level service records
- `stop_times`: ordered stop sequence for each trip
- `service_calendars`: weekly GTFS service patterns by dataset and service ID
- `service_calendar_dates`: GTFS add/remove service exceptions by date

### `operations`

- `gtfs_import_jobs`: feed ingestion workflow tracking
- `display_messages`: rendered and published sign content and overrides
- `vehicle_route_resolutions`: latest resolved route, trip, next stop, and route-state snapshot per vehicle

### `telemetry`

- `gps_messages`: raw append-only ingest lane, partitioned by `received_at`
- `vehicle_positions`: latest coordinate fix per vehicle for fast map and lookup reads
- `vehicle_operational_states`: derived last-seen, movement, speed, heading, and extension state per vehicle

### `config`

- `config_versions`: immutable JSON snapshots by scope and version

### `system`

- `audit_logs`: cross-domain operator audit trail
- `system_events`: runtime and platform event log

## Normalization Notes

- Roles and permissions are separated from users through join tables.
- Vehicles reference device and display profiles instead of embedding those definitions repeatedly.
- Trips and stop times are separated so the same stops can be reused across many trips.
- GTFS service calendars and calendar-date exceptions are versioned per dataset so schedule-assisted route resolution can evaluate the correct service day after each feed activation.
- Raw GPS events, latest coordinates, and derived operational state are stored separately so each workload can optimize for its own read and write path.
- Route resolution snapshots are stored separately from raw GTFS and telemetry tables so the admin UI can read one row per vehicle without recomputing schedule joins on every request.
- Config versions are immutable snapshots rather than mutable blobs.

## Performance Strategy

### GPS Ingestion

- `telemetry.gps_messages` is partitioned by `received_at`.
- BRIN indexing on `received_at` keeps append-heavy time queries efficient.
- B-tree indexes on `(vehicle_id, position_time desc)` and `(trip_id, position_time desc)` support live vehicle lookup.
- `telemetry.vehicle_positions` serves the hot path for `where is vehicle X now?` and `show all vehicles on route Y`.
- `telemetry.vehicle_operational_states` keeps dashboards and dispatch screens on one row per bus for connection health and motion status.

### Route and Stop Lookup

- Trigram GIN indexes on route short/long names and stop names support fuzzy operator search.
- Composite indexes on `transit.trips(route_id, service_id, direction_id)` and `transit.stop_times(stop_id, arrival_offset_seconds, trip_id)` support schedule lookup and stop-based next-trip queries.
- `route_variants` keeps direction and headsign branching out of the base route row.
- `transit.service_calendars` and `transit.service_calendar_dates` are indexed by dataset plus service day so the route resolver can evaluate the correct GTFS service window efficiently.
- `operations.vehicle_route_resolutions` keeps dispatch reads off the heavier `trips` plus `stop_times` join path.

### Operational History

- `system.audit_logs` and `system.system_events` are append-only and indexed by time-first access patterns.
- `config.config_versions` uses a partial unique index to enforce one active version per scope.

## Migration Philosophy

The repository includes ordered `.up.sql` and `.down.sql` files so the database can evolve deliberately. The next backend steps are to move more repository code, especially auth persistence, onto these canonical tables and to add optional telemetry enrichers and GPS-assisted trip matching on top of the new route-resolution layer.
