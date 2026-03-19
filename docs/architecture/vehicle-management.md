# Vehicle Management

## Scope

Vehicle management binds the reusable CMS core to deployment-specific fleet records without baking hardware or transport differences into application code. The implementation spans the API module in [`backend/api/src/modules/vehicles`](/c:/Projects/cmsfleet/backend/api/src/modules/vehicles/module.ts), the canonical fleet schema in [`backend/api/db/migrations/0004_fleet_and_transit.up.sql`](/c:/Projects/cmsfleet/backend/api/db/migrations/0004_fleet_and_transit.up.sql) plus [`backend/api/db/migrations/0006_vehicle_assignment_and_route_override.up.sql`](/c:/Projects/cmsfleet/backend/api/db/migrations/0006_vehicle_assignment_and_route_override.up.sql), and the admin screen in [`frontend/web/src/pages/VehiclesPage.tsx`](/c:/Projects/cmsfleet/frontend/web/src/pages/VehiclesPage.tsx).

## Decisions

- Store vehicles in PostgreSQL under `fleet.vehicles`.
- Keep transport behavior in config-driven transport profiles instead of database-specific workflow code.
- Sync device and display profile catalogs from `config/cms/device-profiles` and `config/cms/display-profiles` into `fleet.device_profiles` and `fleet.display_profiles` on API startup.
- Represent operator control over routing with `route_override_mode` and `manual_route_id` so the normal automatic route strategy can be bypassed cleanly when needed.
- Separate `is_enabled` from operational `status` so a vehicle can be administratively disabled without losing its lifecycle state.

## API Contract

The API exposes these protected endpoints:

- `GET /api/admin/vehicles`
- `GET /api/admin/vehicles/options`
- `GET /api/admin/vehicles/:vehicleId`
- `POST /api/admin/vehicles`
- `PATCH /api/admin/vehicles/:vehicleId`
- `DELETE /api/admin/vehicles/:vehicleId`

Read access requires `fleet:read`. Mutating calls require `fleet:manage`.

## Frontend Contract

The admin shell now uses a dedicated vehicle registry page with:

- create and edit flows for buses
- assignment of device, display, and transport profiles
- enable and disable actions
- operational status control
- manual route override selection
- read-only visibility for roles without `fleet:manage`

## Current Limits

The vehicle module already writes through the canonical `fleet` and `transit` schemas, but the auth runtime still uses temporary `cms_auth_*` tables. Because of that, `manual_route_updated_by_user_id` is intentionally left `NULL` for now and should be connected once the auth persistence layer migrates to the canonical `auth` schema.
