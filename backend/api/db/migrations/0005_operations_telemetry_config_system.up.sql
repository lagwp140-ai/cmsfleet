BEGIN;

CREATE TABLE operations.gtfs_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_uri TEXT NOT NULL,
  import_type TEXT NOT NULL DEFAULT 'static' CHECK (import_type IN ('static', 'realtime_snapshot', 'delta')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  feed_version TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  rows_processed INTEGER NOT NULL DEFAULT 0 CHECK (rows_processed >= 0),
  routes_upserted INTEGER NOT NULL DEFAULT 0 CHECK (routes_upserted >= 0),
  trips_upserted INTEGER NOT NULL DEFAULT 0 CHECK (trips_upserted >= 0),
  stops_upserted INTEGER NOT NULL DEFAULT 0 CHECK (stops_upserted >= 0),
  stop_times_upserted INTEGER NOT NULL DEFAULT 0 CHECK (stop_times_upserted >= 0),
  error_message TEXT,
  summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (finished_at IS NULL OR started_at IS NOT NULL),
  CHECK (finished_at IS NULL OR finished_at >= started_at)
);

CREATE INDEX operations_gtfs_import_jobs_status_created_idx
  ON operations.gtfs_import_jobs (status, created_at DESC);

CREATE INDEX operations_gtfs_import_jobs_finished_idx
  ON operations.gtfs_import_jobs (finished_at DESC);

CREATE TABLE operations.display_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID REFERENCES fleet.vehicles(id) ON DELETE SET NULL,
  route_id UUID REFERENCES transit.routes(id) ON DELETE SET NULL,
  route_variant_id UUID REFERENCES transit.route_variants(id) ON DELETE SET NULL,
  trip_id UUID REFERENCES transit.trips(id) ON DELETE SET NULL,
  display_profile_id UUID NOT NULL REFERENCES fleet.display_profiles(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL CHECK (channel IN ('front', 'side', 'rear', 'interior')),
  message_type TEXT NOT NULL CHECK (message_type IN ('manual', 'template', 'service', 'alert')),
  message_text TEXT NOT NULL,
  rendered_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  priority SMALLINT NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'published', 'expired', 'cancelled')),
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    vehicle_id IS NOT NULL OR
    route_id IS NOT NULL OR
    route_variant_id IS NOT NULL OR
    trip_id IS NOT NULL
  ),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE INDEX operations_display_messages_vehicle_status_idx
  ON operations.display_messages (vehicle_id, status, effective_from DESC);

CREATE INDEX operations_display_messages_trip_channel_idx
  ON operations.display_messages (trip_id, channel, status);

CREATE INDEX operations_display_messages_profile_channel_idx
  ON operations.display_messages (display_profile_id, channel, status);

CREATE TABLE telemetry.gps_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  source_name TEXT NOT NULL,
  provider_message_id TEXT,
  vehicle_id UUID REFERENCES fleet.vehicles(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  position_time TIMESTAMPTZ,
  latitude NUMERIC(9, 6) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9, 6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  speed_kph NUMERIC(6, 2),
  heading_deg NUMERIC(5, 2),
  accuracy_m NUMERIC(7, 2),
  route_id UUID REFERENCES transit.routes(id) ON DELETE SET NULL,
  route_variant_id UUID REFERENCES transit.route_variants(id) ON DELETE SET NULL,
  trip_id UUID REFERENCES transit.trips(id) ON DELETE SET NULL,
  ingest_status TEXT NOT NULL DEFAULT 'accepted' CHECK (ingest_status IN ('accepted', 'duplicate', 'rejected', 'enriched')),
  raw_payload JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, received_at)
) PARTITION BY RANGE (received_at);

CREATE TABLE telemetry.gps_messages_default
  PARTITION OF telemetry.gps_messages DEFAULT;

CREATE INDEX telemetry_gps_messages_received_at_brin_idx
  ON telemetry.gps_messages USING BRIN (received_at);

CREATE INDEX telemetry_gps_messages_vehicle_time_idx
  ON telemetry.gps_messages (vehicle_id, position_time DESC);

CREATE INDEX telemetry_gps_messages_trip_time_idx
  ON telemetry.gps_messages (trip_id, position_time DESC);

CREATE INDEX telemetry_gps_messages_source_provider_idx
  ON telemetry.gps_messages (source_name, provider_message_id);

CREATE INDEX telemetry_gps_messages_payload_gin_idx
  ON telemetry.gps_messages USING GIN (raw_payload jsonb_path_ops);

CREATE TABLE telemetry.vehicle_positions (
  vehicle_id UUID PRIMARY KEY REFERENCES fleet.vehicles(id) ON DELETE CASCADE,
  last_gps_message_id BIGINT,
  last_gps_message_received_at TIMESTAMPTZ,
  route_id UUID REFERENCES transit.routes(id) ON DELETE SET NULL,
  route_variant_id UUID REFERENCES transit.route_variants(id) ON DELETE SET NULL,
  trip_id UUID REFERENCES transit.trips(id) ON DELETE SET NULL,
  stop_id UUID REFERENCES transit.stops(id) ON DELETE SET NULL,
  latitude NUMERIC(9, 6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9, 6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  speed_kph NUMERIC(6, 2),
  heading_deg NUMERIC(5, 2),
  occupancy_status TEXT,
  source_name TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX telemetry_vehicle_positions_route_recorded_idx
  ON telemetry.vehicle_positions (route_id, recorded_at DESC);

CREATE INDEX telemetry_vehicle_positions_trip_recorded_idx
  ON telemetry.vehicle_positions (trip_id, recorded_at DESC);

CREATE INDEX telemetry_vehicle_positions_recorded_idx
  ON telemetry.vehicle_positions (recorded_at DESC);

CREATE TABLE config.config_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'tenant', 'transport', 'vehicle', 'device', 'display')),
  scope_key TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  change_summary TEXT,
  config_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  UNIQUE (scope_type, scope_key, version_number)
);

CREATE UNIQUE INDEX config_versions_active_scope_uidx
  ON config.config_versions (scope_type, scope_key)
  WHERE is_active;

CREATE INDEX config_versions_hash_idx
  ON config.config_versions (config_hash);

CREATE INDEX config_versions_payload_gin_idx
  ON config.config_versions USING GIN (payload jsonb_path_ops);

CREATE TABLE system.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email CITEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  result TEXT NOT NULL CHECK (result IN ('success', 'failure', 'warning')),
  request_id TEXT,
  ip_address INET,
  user_agent TEXT,
  diff JSONB NOT NULL DEFAULT '{}'::JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX system_audit_logs_occurred_idx
  ON system.audit_logs (occurred_at DESC);

CREATE INDEX system_audit_logs_actor_occurred_idx
  ON system.audit_logs (actor_user_id, occurred_at DESC);

CREATE INDEX system_audit_logs_entity_idx
  ON system.audit_logs (entity_type, entity_id, occurred_at DESC);

CREATE INDEX system_audit_logs_request_id_idx
  ON system.audit_logs (request_id)
  WHERE request_id IS NOT NULL;

CREATE TABLE system.system_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('debug', 'info', 'warn', 'error', 'critical')),
  source TEXT NOT NULL,
  component TEXT,
  message TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  related_entity_type TEXT,
  related_entity_id TEXT,
  happened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX system_events_source_happened_idx
  ON system.system_events (source, happened_at DESC);

CREATE INDEX system_events_severity_happened_idx
  ON system.system_events (severity, happened_at DESC);

CREATE INDEX system_events_payload_gin_idx
  ON system.system_events USING GIN (event_payload jsonb_path_ops);

COMMIT;

