BEGIN;

CREATE TABLE IF NOT EXISTS operations.gtfs_datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id UUID NOT NULL REFERENCES operations.gtfs_import_jobs(id) ON DELETE CASCADE,
  dataset_label TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK (source_type IN ('upload', 'local_path', 'remote_url', 'scheduled_sync')),
  source_uri TEXT,
  file_name TEXT,
  feed_hash TEXT,
  status TEXT NOT NULL DEFAULT 'staged' CHECK (status IN ('staged', 'validated', 'active', 'archived', 'failed')),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  activated_at TIMESTAMPTZ,
  activated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_dataset_id UUID REFERENCES operations.gtfs_datasets(id) ON DELETE SET NULL,
  summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  validation_summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (import_job_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS operations_gtfs_datasets_active_uidx
  ON operations.gtfs_datasets (is_active)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS operations_gtfs_datasets_status_created_idx
  ON operations.gtfs_datasets (status, created_at DESC);

CREATE TABLE IF NOT EXISTS operations.gtfs_import_errors (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_job_id UUID NOT NULL REFERENCES operations.gtfs_import_jobs(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('error', 'warn')),
  file_name TEXT NOT NULL,
  row_number INTEGER,
  field_name TEXT,
  entity_key TEXT,
  message TEXT NOT NULL,
  raw_row JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS operations_gtfs_import_errors_job_idx
  ON operations.gtfs_import_errors (import_job_id, severity, created_at DESC);

CREATE TABLE IF NOT EXISTS operations.gtfs_staging_routes (
  import_job_id UUID NOT NULL REFERENCES operations.gtfs_import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  agency_id TEXT NOT NULL,
  external_route_id TEXT NOT NULL,
  route_short_name TEXT NOT NULL,
  route_long_name TEXT,
  route_type SMALLINT NOT NULL,
  route_color TEXT,
  route_text_color TEXT,
  sort_order INTEGER,
  raw_row JSONB NOT NULL DEFAULT '{}'::JSONB,
  PRIMARY KEY (import_job_id, row_number)
);

CREATE TABLE IF NOT EXISTS operations.gtfs_staging_stops (
  import_job_id UUID NOT NULL REFERENCES operations.gtfs_import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  agency_id TEXT NOT NULL,
  external_stop_id TEXT NOT NULL,
  stop_code TEXT,
  stop_name TEXT NOT NULL,
  stop_desc TEXT,
  latitude NUMERIC(9, 6) NOT NULL,
  longitude NUMERIC(9, 6) NOT NULL,
  timezone TEXT,
  platform_code TEXT,
  parent_external_stop_id TEXT,
  wheelchair_boarding SMALLINT,
  raw_row JSONB NOT NULL DEFAULT '{}'::JSONB,
  PRIMARY KEY (import_job_id, row_number)
);

CREATE TABLE IF NOT EXISTS operations.gtfs_staging_trips (
  import_job_id UUID NOT NULL REFERENCES operations.gtfs_import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  agency_id TEXT NOT NULL,
  external_trip_id TEXT NOT NULL,
  route_external_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  trip_headsign TEXT,
  trip_short_name TEXT,
  direction_id SMALLINT,
  block_id TEXT,
  shape_id TEXT,
  wheelchair_accessible SMALLINT,
  bikes_allowed SMALLINT,
  variant_code TEXT NOT NULL,
  raw_row JSONB NOT NULL DEFAULT '{}'::JSONB,
  PRIMARY KEY (import_job_id, row_number)
);

CREATE TABLE IF NOT EXISTS operations.gtfs_staging_stop_times (
  import_job_id UUID NOT NULL REFERENCES operations.gtfs_import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  trip_external_id TEXT NOT NULL,
  external_stop_id TEXT NOT NULL,
  stop_sequence INTEGER NOT NULL,
  arrival_offset_seconds INTEGER NOT NULL,
  departure_offset_seconds INTEGER NOT NULL,
  pickup_type SMALLINT,
  drop_off_type SMALLINT,
  timepoint BOOLEAN NOT NULL DEFAULT FALSE,
  shape_dist_traveled NUMERIC(10, 2),
  stop_headsign TEXT,
  raw_row JSONB NOT NULL DEFAULT '{}'::JSONB,
  PRIMARY KEY (import_job_id, row_number)
);

ALTER TABLE operations.gtfs_import_jobs
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'local_path' CHECK (source_type IN ('upload', 'local_path', 'remote_url', 'scheduled_sync')),
  ADD COLUMN IF NOT EXISTS activation_mode TEXT NOT NULL DEFAULT 'manual' CHECK (activation_mode IN ('manual', 'activate_on_success', 'rollback')),
  ADD COLUMN IF NOT EXISTS input_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS validation_error_count INTEGER NOT NULL DEFAULT 0 CHECK (validation_error_count >= 0),
  ADD COLUMN IF NOT EXISTS warning_count INTEGER NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  ADD COLUMN IF NOT EXISTS dataset_id UUID;

ALTER TABLE operations.gtfs_import_jobs
  DROP CONSTRAINT IF EXISTS gtfs_import_jobs_dataset_id_fkey;

ALTER TABLE operations.gtfs_import_jobs
  ADD CONSTRAINT gtfs_import_jobs_dataset_id_fkey
  FOREIGN KEY (dataset_id) REFERENCES operations.gtfs_datasets(id) ON DELETE SET NULL;

ALTER TABLE transit.routes
  ADD COLUMN IF NOT EXISTS dataset_id UUID REFERENCES operations.gtfs_datasets(id) ON DELETE RESTRICT;

ALTER TABLE transit.stops
  ADD COLUMN IF NOT EXISTS dataset_id UUID REFERENCES operations.gtfs_datasets(id) ON DELETE RESTRICT;

ALTER TABLE transit.trips
  ADD COLUMN IF NOT EXISTS dataset_id UUID REFERENCES operations.gtfs_datasets(id) ON DELETE RESTRICT;

ALTER TABLE transit.routes
  DROP CONSTRAINT IF EXISTS routes_agency_id_external_route_id_key;

ALTER TABLE transit.routes
  DROP CONSTRAINT IF EXISTS routes_dataset_agency_external_route_id_key;

ALTER TABLE transit.routes
  ADD CONSTRAINT routes_dataset_agency_external_route_id_key UNIQUE (dataset_id, agency_id, external_route_id);

ALTER TABLE transit.stops
  DROP CONSTRAINT IF EXISTS stops_agency_id_external_stop_id_key;

ALTER TABLE transit.stops
  DROP CONSTRAINT IF EXISTS stops_dataset_agency_external_stop_id_key;

ALTER TABLE transit.stops
  ADD CONSTRAINT stops_dataset_agency_external_stop_id_key UNIQUE (dataset_id, agency_id, external_stop_id);

ALTER TABLE transit.trips
  DROP CONSTRAINT IF EXISTS trips_agency_id_external_trip_id_key;

ALTER TABLE transit.trips
  DROP CONSTRAINT IF EXISTS trips_dataset_agency_external_trip_id_key;

ALTER TABLE transit.trips
  ADD CONSTRAINT trips_dataset_agency_external_trip_id_key UNIQUE (dataset_id, agency_id, external_trip_id);

CREATE INDEX IF NOT EXISTS transit_routes_dataset_active_idx
  ON transit.routes (dataset_id, is_active, route_short_name);

CREATE INDEX IF NOT EXISTS transit_stops_dataset_name_idx
  ON transit.stops (dataset_id, stop_name);

CREATE INDEX IF NOT EXISTS transit_trips_dataset_active_idx
  ON transit.trips (dataset_id, is_active, service_id);

COMMIT;

