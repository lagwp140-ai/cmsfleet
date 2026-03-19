BEGIN;

DROP INDEX IF EXISTS fleet.fleet_vehicles_manual_route_idx;
DROP INDEX IF EXISTS fleet.fleet_vehicles_transport_profile_idx;
DROP INDEX IF EXISTS fleet.fleet_vehicles_enabled_status_idx;

ALTER TABLE fleet.vehicles
  DROP COLUMN IF EXISTS manual_route_updated_by_user_id,
  DROP COLUMN IF EXISTS manual_route_updated_at,
  DROP COLUMN IF EXISTS manual_route_id,
  DROP COLUMN IF EXISTS route_override_mode,
  DROP COLUMN IF EXISTS transport_profile_key,
  DROP COLUMN IF EXISTS is_enabled;

COMMIT;
