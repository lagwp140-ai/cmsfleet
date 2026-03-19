BEGIN;

ALTER TABLE fleet.vehicles
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS transport_profile_key TEXT NOT NULL DEFAULT 'urban-bus',
  ADD COLUMN IF NOT EXISTS route_override_mode TEXT NOT NULL DEFAULT 'auto' CHECK (route_override_mode IN ('auto', 'manual')),
  ADD COLUMN IF NOT EXISTS manual_route_id UUID REFERENCES transit.routes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manual_route_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_route_updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fleet_vehicles_enabled_status_idx
  ON fleet.vehicles (is_enabled, status, vehicle_code);

CREATE INDEX IF NOT EXISTS fleet_vehicles_transport_profile_idx
  ON fleet.vehicles (transport_profile_key, vehicle_code);

CREATE INDEX IF NOT EXISTS fleet_vehicles_manual_route_idx
  ON fleet.vehicles (manual_route_id, route_override_mode)
  WHERE manual_route_id IS NOT NULL;

COMMIT;
