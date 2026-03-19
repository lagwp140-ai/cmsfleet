BEGIN;

DROP INDEX IF EXISTS telemetry.telemetry_vehicle_operational_states_source_seen_idx;
DROP INDEX IF EXISTS telemetry.telemetry_vehicle_operational_states_movement_seen_idx;
DROP INDEX IF EXISTS telemetry.telemetry_vehicle_operational_states_last_seen_idx;

DROP TABLE IF EXISTS telemetry.vehicle_operational_states;

COMMIT;
