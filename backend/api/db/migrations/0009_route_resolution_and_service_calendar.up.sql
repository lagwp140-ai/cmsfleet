BEGIN;

CREATE TABLE transit.service_calendars (
  dataset_id UUID NOT NULL REFERENCES operations.gtfs_datasets(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL,
  monday BOOLEAN NOT NULL DEFAULT FALSE,
  tuesday BOOLEAN NOT NULL DEFAULT FALSE,
  wednesday BOOLEAN NOT NULL DEFAULT FALSE,
  thursday BOOLEAN NOT NULL DEFAULT FALSE,
  friday BOOLEAN NOT NULL DEFAULT FALSE,
  saturday BOOLEAN NOT NULL DEFAULT FALSE,
  sunday BOOLEAN NOT NULL DEFAULT FALSE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (dataset_id, service_id),
  CHECK (end_date >= start_date)
);

CREATE INDEX transit_service_calendars_range_idx
  ON transit.service_calendars (dataset_id, start_date, end_date, service_id);

CREATE TABLE transit.service_calendar_dates (
  dataset_id UUID NOT NULL REFERENCES operations.gtfs_datasets(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL,
  service_date DATE NOT NULL,
  exception_type SMALLINT NOT NULL CHECK (exception_type IN (1, 2)),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (dataset_id, service_id, service_date)
);

CREATE INDEX transit_service_calendar_dates_lookup_idx
  ON transit.service_calendar_dates (dataset_id, service_date, service_id);

CREATE TABLE operations.gtfs_staging_service_calendars (
  import_job_id UUID NOT NULL REFERENCES operations.gtfs_import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  service_id TEXT NOT NULL,
  monday BOOLEAN NOT NULL,
  tuesday BOOLEAN NOT NULL,
  wednesday BOOLEAN NOT NULL,
  thursday BOOLEAN NOT NULL,
  friday BOOLEAN NOT NULL,
  saturday BOOLEAN NOT NULL,
  sunday BOOLEAN NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  raw_row JSONB NOT NULL DEFAULT '{}'::JSONB,
  PRIMARY KEY (import_job_id, row_number)
);

CREATE TABLE operations.gtfs_staging_service_calendar_dates (
  import_job_id UUID NOT NULL REFERENCES operations.gtfs_import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  service_id TEXT NOT NULL,
  service_date DATE NOT NULL,
  exception_type SMALLINT NOT NULL CHECK (exception_type IN (1, 2)),
  raw_row JSONB NOT NULL DEFAULT '{}'::JSONB,
  PRIMARY KEY (import_job_id, row_number)
);

CREATE TABLE operations.vehicle_route_resolutions (
  vehicle_id UUID PRIMARY KEY REFERENCES fleet.vehicles(id) ON DELETE CASCADE,
  resolution_source TEXT NOT NULL CHECK (resolution_source IN ('none', 'manual', 'schedule', 'gps_assisted')),
  route_state TEXT NOT NULL CHECK (route_state IN (
    'inactive_vehicle',
    'awaiting_manual_route',
    'manual_route_only',
    'scheduled_trip_upcoming',
    'scheduled_trip_active',
    'scheduled_trip_completed',
    'awaiting_auto_match'
  )),
  route_id UUID REFERENCES transit.routes(id) ON DELETE SET NULL,
  trip_id UUID REFERENCES transit.trips(id) ON DELETE SET NULL,
  route_variant_id UUID REFERENCES transit.route_variants(id) ON DELETE SET NULL,
  next_stop_id UUID REFERENCES transit.stops(id) ON DELETE SET NULL,
  direction_id SMALLINT CHECK (direction_id IS NULL OR direction_id IN (0, 1)),
  service_date DATE,
  reference_time TIMESTAMPTZ NOT NULL,
  reference_seconds INTEGER,
  next_stop_sequence INTEGER,
  trip_start_offset_seconds INTEGER,
  trip_end_offset_seconds INTEGER,
  resolution_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX operations_vehicle_route_resolutions_state_eval_idx
  ON operations.vehicle_route_resolutions (route_state, evaluated_at DESC);

CREATE INDEX operations_vehicle_route_resolutions_route_trip_idx
  ON operations.vehicle_route_resolutions (route_id, trip_id, service_date);

COMMIT;
