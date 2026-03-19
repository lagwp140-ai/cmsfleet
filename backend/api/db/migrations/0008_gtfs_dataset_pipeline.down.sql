BEGIN;

DROP INDEX IF EXISTS transit.transit_trips_dataset_active_idx;
DROP INDEX IF EXISTS transit.transit_stops_dataset_name_idx;
DROP INDEX IF EXISTS transit.transit_routes_dataset_active_idx;

ALTER TABLE transit.trips
  DROP CONSTRAINT IF EXISTS trips_dataset_agency_external_trip_id_key;

ALTER TABLE transit.trips
  ADD CONSTRAINT trips_agency_id_external_trip_id_key UNIQUE (agency_id, external_trip_id);

ALTER TABLE transit.routes
  DROP CONSTRAINT IF EXISTS routes_dataset_agency_external_route_id_key;

ALTER TABLE transit.routes
  ADD CONSTRAINT routes_agency_id_external_route_id_key UNIQUE (agency_id, external_route_id);

ALTER TABLE transit.stops
  DROP CONSTRAINT IF EXISTS stops_dataset_agency_external_stop_id_key;

ALTER TABLE transit.stops
  ADD CONSTRAINT stops_agency_id_external_stop_id_key UNIQUE (agency_id, external_stop_id);

ALTER TABLE transit.trips
  DROP COLUMN IF EXISTS dataset_id;

ALTER TABLE transit.stops
  DROP COLUMN IF EXISTS dataset_id;

ALTER TABLE transit.routes
  DROP COLUMN IF EXISTS dataset_id;

ALTER TABLE operations.gtfs_import_jobs
  DROP CONSTRAINT IF EXISTS gtfs_import_jobs_dataset_id_fkey;

ALTER TABLE operations.gtfs_import_jobs
  DROP COLUMN IF EXISTS dataset_id,
  DROP COLUMN IF EXISTS warning_count,
  DROP COLUMN IF EXISTS validation_error_count,
  DROP COLUMN IF EXISTS input_payload,
  DROP COLUMN IF EXISTS activation_mode,
  DROP COLUMN IF EXISTS source_type;

DROP TABLE IF EXISTS operations.gtfs_staging_stop_times;
DROP TABLE IF EXISTS operations.gtfs_staging_trips;
DROP TABLE IF EXISTS operations.gtfs_staging_stops;
DROP TABLE IF EXISTS operations.gtfs_staging_routes;
DROP TABLE IF EXISTS operations.gtfs_import_errors;

DROP INDEX IF EXISTS operations.operations_gtfs_datasets_status_created_idx;
DROP INDEX IF EXISTS operations.operations_gtfs_datasets_active_uidx;
DROP TABLE IF EXISTS operations.gtfs_datasets;

COMMIT;
