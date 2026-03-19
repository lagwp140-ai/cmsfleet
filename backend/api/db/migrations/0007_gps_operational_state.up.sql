BEGIN;

CREATE TABLE telemetry.vehicle_operational_states (
  vehicle_id UUID PRIMARY KEY REFERENCES fleet.vehicles(id) ON DELETE CASCADE,
  last_received_message_id BIGINT,
  last_position_message_id BIGINT,
  last_seen_at TIMESTAMPTZ NOT NULL,
  position_time TIMESTAMPTZ NOT NULL,
  latitude NUMERIC(9, 6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9, 6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  speed_kph NUMERIC(6, 2),
  heading_deg NUMERIC(5, 2),
  movement_state TEXT NOT NULL CHECK (movement_state IN ('moving', 'stopped', 'unknown')),
  source_name TEXT NOT NULL,
  processing_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  extensions JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX telemetry_vehicle_operational_states_last_seen_idx
  ON telemetry.vehicle_operational_states (last_seen_at DESC);

CREATE INDEX telemetry_vehicle_operational_states_movement_seen_idx
  ON telemetry.vehicle_operational_states (movement_state, last_seen_at DESC);

CREATE INDEX telemetry_vehicle_operational_states_source_seen_idx
  ON telemetry.vehicle_operational_states (source_name, last_seen_at DESC);

INSERT INTO telemetry.vehicle_operational_states (
  vehicle_id,
  last_received_message_id,
  last_position_message_id,
  last_seen_at,
  position_time,
  latitude,
  longitude,
  speed_kph,
  heading_deg,
  movement_state,
  source_name,
  processing_metadata,
  extensions
)
SELECT
  p.vehicle_id,
  p.last_gps_message_id,
  p.last_gps_message_id,
  COALESCE(p.last_gps_message_received_at, p.recorded_at),
  p.recorded_at,
  p.latitude,
  p.longitude,
  p.speed_kph,
  p.heading_deg,
  CASE
    WHEN p.speed_kph IS NULL THEN 'unknown'
    WHEN p.speed_kph >= 5 THEN 'moving'
    ELSE 'stopped'
  END,
  p.source_name,
  jsonb_build_object(
    'backfilledFrom', 'telemetry.vehicle_positions',
    'headingSource', CASE WHEN p.heading_deg IS NULL THEN 'unknown' ELSE 'backfill' END,
    'positionApplied', true,
    'receivedLatencySeconds', CASE
      WHEN p.last_gps_message_received_at IS NULL THEN NULL
      ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (p.last_gps_message_received_at - p.recorded_at))))
    END,
    'routeProximityStatus', 'not_configured',
    'speedSource', CASE WHEN p.speed_kph IS NULL THEN 'unknown' ELSE 'backfill' END,
    'stopProximityStatus', 'not_configured',
    'tripProgressStatus', 'not_configured'
  ),
  jsonb_build_object(
    'geofence', NULL,
    'routeProximity', NULL,
    'stopProximity', NULL,
    'tripProgress', NULL
  )
FROM telemetry.vehicle_positions p
ON CONFLICT (vehicle_id) DO NOTHING;

COMMIT;
