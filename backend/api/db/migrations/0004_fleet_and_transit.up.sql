BEGIN;

CREATE TABLE fleet.device_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  platform TEXT NOT NULL,
  operating_system TEXT NOT NULL,
  connectivity JSONB NOT NULL DEFAULT '{}'::JSONB,
  capabilities JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX fleet_device_profiles_connectivity_gin_idx
  ON fleet.device_profiles USING GIN (connectivity jsonb_path_ops);

CREATE INDEX fleet_device_profiles_capabilities_gin_idx
  ON fleet.device_profiles USING GIN (capabilities jsonb_path_ops);

CREATE TABLE fleet.display_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  provider TEXT NOT NULL,
  controller TEXT NOT NULL,
  brightness_percent SMALLINT NOT NULL CHECK (brightness_percent BETWEEN 0 AND 100),
  destination_template TEXT NOT NULL,
  mappings JSONB NOT NULL DEFAULT '{}'::JSONB,
  capabilities JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX fleet_display_profiles_mappings_gin_idx
  ON fleet.display_profiles USING GIN (mappings jsonb_path_ops);

CREATE INDEX fleet_display_profiles_capabilities_gin_idx
  ON fleet.display_profiles USING GIN (capabilities jsonb_path_ops);

CREATE TABLE fleet.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_code TEXT NOT NULL UNIQUE,
  external_vehicle_id TEXT UNIQUE,
  registration_plate TEXT UNIQUE,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive', 'retired')),
  device_profile_id UUID REFERENCES fleet.device_profiles(id) ON DELETE SET NULL,
  display_profile_id UUID REFERENCES fleet.display_profiles(id) ON DELETE SET NULL,
  hardware_model TEXT,
  passenger_capacity INTEGER CHECK (passenger_capacity IS NULL OR passenger_capacity >= 0),
  wheelchair_spaces INTEGER NOT NULL DEFAULT 0 CHECK (wheelchair_spaces >= 0),
  bike_rack BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX fleet_vehicles_status_idx
  ON fleet.vehicles (status, vehicle_code);

CREATE INDEX fleet_vehicles_device_profile_idx
  ON fleet.vehicles (device_profile_id);

CREATE INDEX fleet_vehicles_display_profile_idx
  ON fleet.vehicles (display_profile_id);

CREATE TABLE transit.routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id TEXT NOT NULL,
  external_route_id TEXT NOT NULL,
  route_short_name TEXT NOT NULL,
  route_long_name TEXT,
  route_type SMALLINT NOT NULL CHECK (route_type >= 0),
  route_color TEXT,
  route_text_color TEXT,
  sort_order INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agency_id, external_route_id)
);

CREATE INDEX transit_routes_active_short_name_idx
  ON transit.routes (is_active, route_short_name);

CREATE INDEX transit_routes_short_name_trgm_idx
  ON transit.routes USING GIN (route_short_name gin_trgm_ops);

CREATE INDEX transit_routes_long_name_trgm_idx
  ON transit.routes USING GIN ((COALESCE(route_long_name, '')) gin_trgm_ops);

CREATE TABLE transit.stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id TEXT NOT NULL,
  external_stop_id TEXT NOT NULL,
  stop_code TEXT,
  stop_name TEXT NOT NULL,
  stop_desc TEXT,
  latitude NUMERIC(9, 6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9, 6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  timezone TEXT,
  platform_code TEXT,
  parent_stop_id UUID REFERENCES transit.stops(id) ON DELETE SET NULL,
  wheelchair_boarding SMALLINT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agency_id, external_stop_id)
);

CREATE INDEX transit_stops_name_trgm_idx
  ON transit.stops USING GIN (stop_name gin_trgm_ops);

CREATE INDEX transit_stops_parent_idx
  ON transit.stops (parent_stop_id);

CREATE INDEX transit_stops_lat_lon_idx
  ON transit.stops (latitude, longitude);

CREATE TABLE transit.route_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES transit.routes(id) ON DELETE CASCADE,
  variant_code TEXT NOT NULL,
  direction_id SMALLINT CHECK (direction_id IS NULL OR direction_id IN (0, 1)),
  headsign TEXT,
  origin_stop_id UUID REFERENCES transit.stops(id) ON DELETE SET NULL,
  destination_stop_id UUID REFERENCES transit.stops(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (route_id, variant_code)
);

CREATE INDEX transit_route_variants_route_direction_idx
  ON transit.route_variants (route_id, direction_id, is_active);

CREATE TABLE transit.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id TEXT NOT NULL,
  external_trip_id TEXT NOT NULL,
  route_id UUID NOT NULL REFERENCES transit.routes(id) ON DELETE CASCADE,
  route_variant_id UUID REFERENCES transit.route_variants(id) ON DELETE SET NULL,
  service_id TEXT NOT NULL,
  trip_headsign TEXT,
  trip_short_name TEXT,
  direction_id SMALLINT CHECK (direction_id IS NULL OR direction_id IN (0, 1)),
  block_id TEXT,
  shape_id TEXT,
  wheelchair_accessible SMALLINT,
  bikes_allowed SMALLINT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agency_id, external_trip_id)
);

CREATE INDEX transit_trips_route_service_idx
  ON transit.trips (route_id, service_id, direction_id);

CREATE INDEX transit_trips_route_variant_idx
  ON transit.trips (route_variant_id, service_id);

CREATE INDEX transit_trips_active_headsign_idx
  ON transit.trips (is_active, trip_headsign);

CREATE TABLE transit.stop_times (
  trip_id UUID NOT NULL REFERENCES transit.trips(id) ON DELETE CASCADE,
  stop_sequence INTEGER NOT NULL CHECK (stop_sequence > 0),
  stop_id UUID NOT NULL REFERENCES transit.stops(id) ON DELETE RESTRICT,
  arrival_offset_seconds INTEGER NOT NULL,
  departure_offset_seconds INTEGER NOT NULL,
  pickup_type SMALLINT,
  drop_off_type SMALLINT,
  timepoint BOOLEAN NOT NULL DEFAULT FALSE,
  shape_dist_traveled NUMERIC(10, 2),
  stop_headsign TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  PRIMARY KEY (trip_id, stop_sequence),
  CHECK (departure_offset_seconds >= arrival_offset_seconds)
);

CREATE INDEX transit_stop_times_stop_lookup_idx
  ON transit.stop_times (stop_id, arrival_offset_seconds, trip_id);

CREATE INDEX transit_stop_times_trip_lookup_idx
  ON transit.stop_times (trip_id, stop_sequence, stop_id);

COMMIT;
