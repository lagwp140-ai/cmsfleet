# GPS Ingestion

## Scope

The GPS slice accepts real-time AVL messages from onboard hardware, validates and normalizes them, stores every raw event, updates the latest known position, and derives a separate operational-state snapshot per vehicle. The current adapter is HTTP JSON through [`backend/api/src/modules/gps/module.ts`](/c:/Projects/cmsfleet/backend/api/src/modules/gps/module.ts), with the processing boundary split across [`normalizer.ts`](/c:/Projects/cmsfleet/backend/api/src/modules/gps/normalizer.ts), [`state-deriver.ts`](/c:/Projects/cmsfleet/backend/api/src/modules/gps/state-deriver.ts), [`service.ts`](/c:/Projects/cmsfleet/backend/api/src/modules/gps/service.ts), and [`repository.ts`](/c:/Projects/cmsfleet/backend/api/src/modules/gps/repository.ts).

## Decisions

- Start with a dedicated HTTP JSON ingestion endpoint at `POST /api/ingest/gps/http`.
- Keep transport adapters thin and push validation, normalization, persistence, and state derivation into a shared service layer so TCP, serial, or MQTT adapters can reuse it later.
- Store every inbound message in `telemetry.gps_messages`, including rejected and duplicate payloads.
- Keep `telemetry.vehicle_positions` as the hot-path current-fix table for coordinate lookup.
- Store derived operational state in `telemetry.vehicle_operational_states` so admin and dispatch views can read one row per bus without scanning raw telemetry.
- Compute connection health from `last_seen_at` using config-driven `gps.freshnessThresholdSeconds` and `gps.offlineThresholdSeconds`.
- Compute movement state from payload speed or derived distance-over-time using `gps.movementThresholdKph`.
- Reserve extension slots for geofence, route proximity, stop proximity, and trip progress so later enrichment does not require reworking the ingest contract.
- Record ingestion anomalies into `system.system_events` so rejected and duplicate traffic is visible beyond transient application logs.

## Payload Contract

The MVP HTTP adapter expects JSON with at least:

- a vehicle identifier in the configured `gps.vehicleIdField`
- latitude and longitude fields (`latitude` / `longitude` or `lat` / `lon`)
- an optional timestamp (`timestamp`, `positionTime`, `fixTime`, or `recordedAt`)

Optional fields include `messageId`, `speedKph`, `headingDeg`, `accuracyM`, and `metadata`.

## Operational State Model

Each accepted message updates or preserves a per-vehicle snapshot with:

- `lastSeenAt`: when the CMS last heard from the onboard unit
- `positionTime`: timestamp of the currently applied position fix
- normalized latitude and longitude
- current speed and heading from payload values or fallbacks when possible
- movement state as `moving`, `stopped`, or `unknown`
- processing metadata for speed source, heading source, latency, and future enrichment hooks
- extension placeholders for geofence, route proximity, stop proximity, and trip progress

Out-of-order accepted messages and duplicate heartbeat traffic still advance `lastSeenAt`, but they do not replace a newer applied position snapshot.

## Connection Model

- `online`: last message age is at or below `freshnessThresholdSeconds`
- `stale`: age is above `freshnessThresholdSeconds` but at or below `offlineThresholdSeconds`
- `offline`: age is above `offlineThresholdSeconds`
- `unknown`: no accepted telemetry has been stored for the vehicle yet

## Admin Surfaces

The API exposes:

- `GET /api/admin/gps/status`
- `GET /api/admin/gps/messages`

The frontend surfaces this through [`frontend/web/src/pages/GpsPage.tsx`](/c:/Projects/cmsfleet/frontend/web/src/pages/GpsPage.tsx), showing connection health, movement state, speed, heading, last-seen telemetry, and recent ingest outcomes.

## Next Steps

- Add per-device authentication or network-level trust controls for the ingestion endpoint.
- Introduce TCP gateway and MQTT adapters that call the same normalization and persistence service.
- Implement optional enrichers for geofencing, stop proximity, route proximity, and trip progress.
- Emit durable transition events if operations need historical offline and recovery alerts instead of computed-on-read state only.


## Extension Hook

- `backend/api/src/modules/gps/enrichers.ts` provides a no-op-by-default post-ingest enrichment seam.
- Future stop proximity, route proximity, trip progress, and ETA logic should plug in there so the MVP HTTP ingestion path stays unchanged.
