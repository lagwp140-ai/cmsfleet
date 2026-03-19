# ADR-005 PostgreSQL Domain Schemas and GPS Ingestion Model

## Status

Accepted

## Context

The bus CMS needs a relational model that supports several distinct workloads at once:

- transactional admin data such as users, vehicles, and configuration versions
- transit reference data such as routes, stops, trips, and stop times
- append-heavy GPS ingestion and current-position queries
- long-lived audit and system event history

A single flat schema would make ownership and future migrations harder, while naive time-series storage would hurt current-position reads.

## Decision

We will organize PostgreSQL by domain-specific schemas:

- `auth`
- `fleet`
- `transit`
- `operations`
- `telemetry`
- `config`
- `system`

We will also:

- normalize RBAC with separate users, roles, permissions, and join tables
- keep raw GPS messages separate from current vehicle positions
- partition `telemetry.gps_messages` by `received_at`
- use trigram indexes for route/stop search and composite indexes for trip/stop lookup
- store immutable configuration snapshots in `config.config_versions`

## Consequences

Positive:

- Domain ownership is clearer for future repository modules.
- Current-position reads stay cheap while raw telemetry remains queryable.
- GTFS tables stay reusable across import strategies and route tooling.
- Audit, config, and system history can grow without polluting transactional tables.

Tradeoffs:

- Cross-schema joins become a normal part of repository design.
- Partition maintenance for GPS data will require a small operational process.
- Existing auth persistence must still be migrated from boot-time tables to the canonical `auth` schema.
