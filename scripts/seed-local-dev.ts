import { Pool, type PoolClient } from "pg";

import { loadCmsConfig } from "@cmsfleet/config-runtime";

import { syncProfileCatalogs } from "../backend/api/src/modules/vehicles/profile-catalog.js";
import { loadLocalEnv, repoRoot } from "./lib/dev-env.js";

const SEED = {
  airportRouteId: "00000000-0000-0000-0000-000000000302",
  airportStopId: "00000000-0000-0000-0000-000000000404",
  airportTripId: "00000000-0000-0000-0000-000000000602",
  airportVariantId: "00000000-0000-0000-0000-000000000502",
  centralStopId: "00000000-0000-0000-0000-000000000401",
  datasetId: "00000000-0000-0000-0000-000000000201",
  importJobId: "00000000-0000-0000-0000-000000000101",
  marketStopId: "00000000-0000-0000-0000-000000000402",
  riversideStopId: "00000000-0000-0000-0000-000000000403",
  route24Id: "00000000-0000-0000-0000-000000000301",
  route24TripId: "00000000-0000-0000-0000-000000000601",
  route24VariantId: "00000000-0000-0000-0000-000000000501",
  vehicleIds: {
    airport: "00000000-0000-0000-0000-000000000703",
    bus100: "00000000-0000-0000-0000-000000000701",
    bus101: "00000000-0000-0000-0000-000000000702"
  }
} as const;

loadLocalEnv();

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const loaded = loadCmsConfig({
    cwd: repoRoot,
    rawEnv: process.env
  });
  const pool = new Pool({
    connectionString: loaded.config.runtime.database.url
  });

  try {
  await syncProfileCatalogs(pool, loaded.context.configDirectory);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const linuxProfileId = await readProfileId(client, "fleet.device_profiles", "linux-signage-unit");
    const androidProfileId = await readProfileId(client, "fleet.device_profiles", "android-signage-terminal");
    const hanoverProfileId = await readProfileId(client, "fleet.display_profiles", "hanover-led-3line");
    const luminatorProfileId = await readProfileId(client, "fleet.display_profiles", "luminator-led-2line");

    await client.query(
      `
        UPDATE operations.gtfs_datasets
        SET is_active = FALSE,
            status = CASE WHEN status = 'active' THEN 'archived' ELSE status END
        WHERE is_active = TRUE
          AND id <> $1
      `,
      [SEED.datasetId]
    );

    await client.query(
      `
        INSERT INTO operations.gtfs_import_jobs (
          id,
          source_uri,
          import_type,
          status,
          source_type,
          activation_mode,
          feed_version,
          started_at,
          finished_at,
          rows_processed,
          routes_upserted,
          trips_upserted,
          stops_upserted,
          stop_times_upserted,
          summary,
          input_payload,
          validation_error_count,
          warning_count,
          created_at
        )
        VALUES (
          $1,
          'seed://local/dev/demo-city',
          'static',
          'succeeded',
          'local_path',
          'activate_on_success',
          'demo-local-2026.03',
          NOW(),
          NOW(),
          13,
          2,
          2,
          4,
          5,
          $2,
          $3,
          0,
          0,
          NOW()
        )
        ON CONFLICT (id) DO UPDATE
        SET source_uri = EXCLUDED.source_uri,
            status = EXCLUDED.status,
            source_type = EXCLUDED.source_type,
            activation_mode = EXCLUDED.activation_mode,
            feed_version = EXCLUDED.feed_version,
            started_at = EXCLUDED.started_at,
            finished_at = EXCLUDED.finished_at,
            rows_processed = EXCLUDED.rows_processed,
            routes_upserted = EXCLUDED.routes_upserted,
            trips_upserted = EXCLUDED.trips_upserted,
            stops_upserted = EXCLUDED.stops_upserted,
            stop_times_upserted = EXCLUDED.stop_times_upserted,
            summary = EXCLUDED.summary,
            input_payload = EXCLUDED.input_payload,
            validation_error_count = EXCLUDED.validation_error_count,
            warning_count = EXCLUDED.warning_count
      `,
      [
        SEED.importJobId,
        {
          datasetLabel: "demo-city-local-seed",
          transportProfiles: ["urban-bus", "airport-express"]
        },
        {
          seededBy: "scripts/seed-local-dev.ts"
        }
      ]
    );

    await client.query(
      `
        INSERT INTO operations.gtfs_datasets (
          id,
          import_job_id,
          dataset_label,
          source_type,
          source_uri,
          file_name,
          feed_hash,
          status,
          is_active,
          activated_at,
          previous_dataset_id,
          summary,
          validation_summary,
          created_at
        )
        VALUES (
          $1,
          $2,
          'demo-city-local-seed',
          'local_path',
          'seed://local/dev/demo-city',
          'seed-local-dev',
          'seed-local-dev-2026-03',
          'active',
          TRUE,
          NOW(),
          NULL,
          $3,
          '{"errors":0,"warnings":0}'::jsonb,
          NOW()
        )
        ON CONFLICT (id) DO UPDATE
        SET dataset_label = EXCLUDED.dataset_label,
            source_type = EXCLUDED.source_type,
            source_uri = EXCLUDED.source_uri,
            file_name = EXCLUDED.file_name,
            feed_hash = EXCLUDED.feed_hash,
            status = EXCLUDED.status,
            is_active = EXCLUDED.is_active,
            activated_at = EXCLUDED.activated_at,
            summary = EXCLUDED.summary,
            validation_summary = EXCLUDED.validation_summary
      `,
      [
        SEED.datasetId,
        SEED.importJobId,
        {
          routes: 2,
          serviceCalendars: 2,
          stops: 4,
          stopTimes: 5,
          trips: 2
        }
      ]
    );

    await client.query(
      `
        UPDATE operations.gtfs_import_jobs
        SET dataset_id = $2
        WHERE id = $1
      `,
      [SEED.importJobId, SEED.datasetId]
    );

    await client.query(
      `
        INSERT INTO transit.routes (
          id,
          dataset_id,
          agency_id,
          external_route_id,
          route_short_name,
          route_long_name,
          route_type,
          route_color,
          route_text_color,
          sort_order,
          is_active,
          metadata,
          created_at,
          updated_at
        )
        VALUES
          ($1, $2, 'demo-bus', 'R24', '24', 'Central Station - Riverside', 3, '0057B8', 'FFFFFF', 24, TRUE, '{"seeded":true}'::jsonb, NOW(), NOW()),
          ($3, $2, 'airport-shuttle', 'A1', 'A1', 'Central Station - Airport Terminal', 3, '0B6E4F', 'FFFFFF', 101, TRUE, '{"seeded":true}'::jsonb, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE
        SET dataset_id = EXCLUDED.dataset_id,
            agency_id = EXCLUDED.agency_id,
            external_route_id = EXCLUDED.external_route_id,
            route_short_name = EXCLUDED.route_short_name,
            route_long_name = EXCLUDED.route_long_name,
            route_type = EXCLUDED.route_type,
            route_color = EXCLUDED.route_color,
            route_text_color = EXCLUDED.route_text_color,
            sort_order = EXCLUDED.sort_order,
            is_active = EXCLUDED.is_active,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
      `,
      [SEED.route24Id, SEED.datasetId, SEED.airportRouteId]
    );

    await client.query(
      `
        INSERT INTO transit.stops (
          id,
          dataset_id,
          agency_id,
          external_stop_id,
          stop_code,
          stop_name,
          latitude,
          longitude,
          timezone,
          platform_code,
          metadata,
          created_at,
          updated_at
        )
        VALUES
          ($1, $5, 'demo-bus', 'STOP-CENTRAL', 'CENT', 'Central Station', 50.447123, 30.522450, 'Europe/Kiev', 'A', '{"seeded":true}'::jsonb, NOW(), NOW()),
          ($2, $5, 'demo-bus', 'STOP-MARKET', 'MRKT', 'Market Square', 50.450950, 30.523950, 'Europe/Kiev', 'B', '{"seeded":true}'::jsonb, NOW(), NOW()),
          ($3, $5, 'demo-bus', 'STOP-RIVER', 'RIVR', 'Riverside', 50.456220, 30.531100, 'Europe/Kiev', 'C', '{"seeded":true}'::jsonb, NOW(), NOW()),
          ($4, $5, 'airport-shuttle', 'STOP-AIRPORT', 'AIRP', 'Airport Terminal', 50.401210, 30.451980, 'Europe/Kiev', '1', '{"seeded":true}'::jsonb, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE
        SET dataset_id = EXCLUDED.dataset_id,
            agency_id = EXCLUDED.agency_id,
            external_stop_id = EXCLUDED.external_stop_id,
            stop_code = EXCLUDED.stop_code,
            stop_name = EXCLUDED.stop_name,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            timezone = EXCLUDED.timezone,
            platform_code = EXCLUDED.platform_code,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
      `,
      [SEED.centralStopId, SEED.marketStopId, SEED.riversideStopId, SEED.airportStopId, SEED.datasetId]
    );

    await client.query(
      `
        INSERT INTO transit.route_variants (
          id,
          route_id,
          variant_code,
          direction_id,
          headsign,
          origin_stop_id,
          destination_stop_id,
          is_active,
          metadata,
          created_at,
          updated_at
        )
        VALUES
          ($1, $3, '24-outbound', 0, 'Central Station', $4, $5, TRUE, '{"seeded":true}'::jsonb, NOW(), NOW()),
          ($2, $6, 'A1-airport', 0, 'Airport Terminal', $4, $7, TRUE, '{"seeded":true}'::jsonb, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE
        SET route_id = EXCLUDED.route_id,
            variant_code = EXCLUDED.variant_code,
            direction_id = EXCLUDED.direction_id,
            headsign = EXCLUDED.headsign,
            origin_stop_id = EXCLUDED.origin_stop_id,
            destination_stop_id = EXCLUDED.destination_stop_id,
            is_active = EXCLUDED.is_active,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
      `,
      [SEED.route24VariantId, SEED.airportVariantId, SEED.route24Id, SEED.centralStopId, SEED.riversideStopId, SEED.airportRouteId, SEED.airportStopId]
    );

    await client.query(
      `
        INSERT INTO transit.trips (
          id,
          dataset_id,
          agency_id,
          external_trip_id,
          route_id,
          route_variant_id,
          service_id,
          trip_headsign,
          trip_short_name,
          direction_id,
          is_active,
          metadata,
          created_at,
          updated_at
        )
        VALUES
          ($1, $3, 'demo-bus', 'TRIP-24-0800', $4, $6, 'WKD-24', 'Central Station', '24A', 0, TRUE, '{"seeded":true}'::jsonb, NOW(), NOW()),
          ($2, $3, 'airport-shuttle', 'TRIP-A1-0900', $5, $7, 'WKD-A1', 'Airport Terminal', 'A1X', 0, TRUE, '{"seeded":true}'::jsonb, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE
        SET dataset_id = EXCLUDED.dataset_id,
            agency_id = EXCLUDED.agency_id,
            external_trip_id = EXCLUDED.external_trip_id,
            route_id = EXCLUDED.route_id,
            route_variant_id = EXCLUDED.route_variant_id,
            service_id = EXCLUDED.service_id,
            trip_headsign = EXCLUDED.trip_headsign,
            trip_short_name = EXCLUDED.trip_short_name,
            direction_id = EXCLUDED.direction_id,
            is_active = EXCLUDED.is_active,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
      `,
      [SEED.route24TripId, SEED.airportTripId, SEED.datasetId, SEED.route24Id, SEED.airportRouteId, SEED.route24VariantId, SEED.airportVariantId]
    );

    await client.query(
      `
        INSERT INTO transit.stop_times (
          trip_id,
          stop_sequence,
          stop_id,
          arrival_offset_seconds,
          departure_offset_seconds,
          timepoint,
          metadata
        )
        VALUES
          ($1, 1, $3, 28800, 28830, TRUE, '{"seeded":true}'::jsonb),
          ($1, 2, $4, 29700, 29730, TRUE, '{"seeded":true}'::jsonb),
          ($1, 3, $5, 30600, 30630, TRUE, '{"seeded":true}'::jsonb),
          ($2, 1, $3, 32400, 32430, TRUE, '{"seeded":true}'::jsonb),
          ($2, 2, $6, 35100, 35130, TRUE, '{"seeded":true}'::jsonb)
        ON CONFLICT (trip_id, stop_sequence) DO UPDATE
        SET stop_id = EXCLUDED.stop_id,
            arrival_offset_seconds = EXCLUDED.arrival_offset_seconds,
            departure_offset_seconds = EXCLUDED.departure_offset_seconds,
            timepoint = EXCLUDED.timepoint,
            metadata = EXCLUDED.metadata
      `,
      [SEED.route24TripId, SEED.airportTripId, SEED.centralStopId, SEED.marketStopId, SEED.riversideStopId, SEED.airportStopId]
    );

    await client.query(
      `
        INSERT INTO transit.service_calendars (
          dataset_id,
          service_id,
          monday,
          tuesday,
          wednesday,
          thursday,
          friday,
          saturday,
          sunday,
          start_date,
          end_date,
          metadata,
          created_at
        )
        VALUES
          ($1, 'WKD-24', TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, FALSE, DATE '2026-01-01', DATE '2026-12-31', '{"seeded":true}'::jsonb, NOW()),
          ($1, 'WKD-A1', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, DATE '2026-01-01', DATE '2026-12-31', '{"seeded":true}'::jsonb, NOW())
        ON CONFLICT (dataset_id, service_id) DO UPDATE
        SET monday = EXCLUDED.monday,
            tuesday = EXCLUDED.tuesday,
            wednesday = EXCLUDED.wednesday,
            thursday = EXCLUDED.thursday,
            friday = EXCLUDED.friday,
            saturday = EXCLUDED.saturday,
            sunday = EXCLUDED.sunday,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            metadata = EXCLUDED.metadata
      `,
      [SEED.datasetId]
    );

    await client.query(
      `
        INSERT INTO fleet.vehicles (
          id,
          vehicle_code,
          external_vehicle_id,
          registration_plate,
          label,
          status,
          device_profile_id,
          display_profile_id,
          hardware_model,
          passenger_capacity,
          wheelchair_spaces,
          bike_rack,
          metadata,
          is_enabled,
          transport_profile_key,
          route_override_mode,
          manual_route_id,
          manual_route_updated_at,
          updated_at,
          created_at
        )
        VALUES
          ($1, 'BUS-100', 'BUS-100', 'AA1000KT', 'Demo Bus 100', 'active', $4, $6, 'RUTX50 Demo Kit', 70, 1, FALSE, '{"seeded":true}'::jsonb, TRUE, 'urban-bus', 'manual', $7, NOW(), NOW(), NOW()),
          ($2, 'BUS-101', 'BUS-101', 'AA1001KT', 'Demo Bus 101', 'active', $4, $6, 'RUTX50 Demo Kit', 70, 1, FALSE, '{"seeded":true}'::jsonb, TRUE, 'urban-bus', 'auto', NULL, NULL, NOW(), NOW()),
          ($3, 'BUS-A1', 'BUS-A1', 'AA2001KT', 'Airport Shuttle A1', 'active', $5, $8, 'Airport Express Kit', 52, 1, TRUE, '{"seeded":true}'::jsonb, TRUE, 'airport-express', 'manual', $9, NOW(), NOW(), NOW())
        ON CONFLICT (id) DO UPDATE
        SET vehicle_code = EXCLUDED.vehicle_code,
            external_vehicle_id = EXCLUDED.external_vehicle_id,
            registration_plate = EXCLUDED.registration_plate,
            label = EXCLUDED.label,
            status = EXCLUDED.status,
            device_profile_id = EXCLUDED.device_profile_id,
            display_profile_id = EXCLUDED.display_profile_id,
            hardware_model = EXCLUDED.hardware_model,
            passenger_capacity = EXCLUDED.passenger_capacity,
            wheelchair_spaces = EXCLUDED.wheelchair_spaces,
            bike_rack = EXCLUDED.bike_rack,
            metadata = EXCLUDED.metadata,
            is_enabled = EXCLUDED.is_enabled,
            transport_profile_key = EXCLUDED.transport_profile_key,
            route_override_mode = EXCLUDED.route_override_mode,
            manual_route_id = EXCLUDED.manual_route_id,
            manual_route_updated_at = EXCLUDED.manual_route_updated_at,
            updated_at = NOW()
      `,
      [SEED.vehicleIds.bus100, SEED.vehicleIds.bus101, SEED.vehicleIds.airport, linuxProfileId, androidProfileId, hanoverProfileId, SEED.route24Id, luminatorProfileId, SEED.airportRouteId]
    );

    await client.query(
      `
        INSERT INTO system.system_events (
          event_type,
          severity,
          source,
          component,
          message,
          event_payload,
          related_entity_type,
          related_entity_id
        )
        VALUES (
          'local_seed_completed',
          'info',
          'scripts/seed-local-dev',
          'local-development',
          'Local development seed data refreshed.',
          $1,
          'gtfs_dataset',
          $2
        )
      `,
      [
        {
          datasetId: SEED.datasetId,
          vehicles: ["BUS-100", "BUS-101", "BUS-A1"]
        },
        SEED.datasetId
      ]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  console.info("Seeded local development data.");
  console.info("Vehicles: BUS-100, BUS-101, BUS-A1");
  console.info("Routes: 24 Central Station - Riverside, A1 Central Station - Airport Terminal");
  console.info("Dataset: demo-city-local-seed");
  } finally {
    await pool.end();
  }
}

async function readProfileId(
  client: PoolClient,
  tableName: "fleet.device_profiles" | "fleet.display_profiles",
  profileKey: string
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM ${tableName}
      WHERE profile_key = $1
      LIMIT 1
    `,
    [profileKey]
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error(`Required profile was not found in ${tableName}: ${profileKey}`);
  }

  return row.id;
}

