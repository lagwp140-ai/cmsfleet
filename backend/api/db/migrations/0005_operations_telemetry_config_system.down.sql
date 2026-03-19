BEGIN;

DROP TABLE IF EXISTS system.system_events;
DROP TABLE IF EXISTS system.audit_logs;
DROP TABLE IF EXISTS config.config_versions;
DROP TABLE IF EXISTS telemetry.vehicle_positions;
DROP TABLE IF EXISTS telemetry.gps_messages_default;
DROP TABLE IF EXISTS telemetry.gps_messages;
DROP TABLE IF EXISTS operations.display_messages;
DROP TABLE IF EXISTS operations.gtfs_import_jobs;

COMMIT;
