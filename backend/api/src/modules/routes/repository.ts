import type { Pool, PoolClient } from "pg";

import type {
  NextStopCandidate,
  ResolutionVehicleContext,
  RouteResolutionUpsertInput,
  ScheduledTripCandidate
} from "./types.js";

interface ResolutionVehicleRow {
  externalVehicleId: string | null;
  isEnabled: boolean;
  label: string;
  lastSeenAt: string | null;
  latitude: number | null;
  longitude: number | null;
  manualRouteAgencyId: string | null;
  manualRouteExternalId: string | null;
  manualRouteId: string | null;
  manualRouteLongName: string | null;
  manualRouteShortName: string | null;
  manualRouteUpdatedAt: string | null;
  operationalStatus: ResolutionVehicleContext["operationalStatus"];
  positionTime: string | null;
  registrationPlate: string | null;
  routeOverrideMode: ResolutionVehicleContext["routeOverrideMode"];
  sourceName: string | null;
  transportProfileKey: string;
  vehicleCode: string;
  vehicleId: string;
}

export class RouteResolutionRepository {
  constructor(private readonly pool: Pool) {}

  async connect(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async listVehiclesForResolution(): Promise<ResolutionVehicleContext[]> {
    const result = await this.pool.query<ResolutionVehicleRow>(
      `
        SELECT
          v.id AS "vehicleId",
          v.vehicle_code AS "vehicleCode",
          v.label,
          v.external_vehicle_id AS "externalVehicleId",
          v.registration_plate AS "registrationPlate",
          v.status AS "operationalStatus",
          v.is_enabled AS "isEnabled",
          v.transport_profile_key AS "transportProfileKey",
          v.route_override_mode AS "routeOverrideMode",
          COALESCE(active_manual_route.id::text, manual_route.id::text) AS "manualRouteId",
          COALESCE(active_manual_route.route_short_name, manual_route.route_short_name) AS "manualRouteShortName",
          COALESCE(active_manual_route.route_long_name, manual_route.route_long_name) AS "manualRouteLongName",
          COALESCE(active_manual_route.external_route_id, manual_route.external_route_id) AS "manualRouteExternalId",
          COALESCE(active_manual_route.agency_id, manual_route.agency_id) AS "manualRouteAgencyId",
          v.manual_route_updated_at::text AS "manualRouteUpdatedAt",
          s.last_seen_at::text AS "lastSeenAt",
          s.position_time::text AS "positionTime",
          s.latitude::double precision AS latitude,
          s.longitude::double precision AS longitude,
          s.source_name AS "sourceName"
        FROM fleet.vehicles v
        LEFT JOIN transit.routes manual_route ON manual_route.id = v.manual_route_id
        LEFT JOIN transit.routes active_manual_route
          ON active_manual_route.agency_id = manual_route.agency_id
         AND active_manual_route.external_route_id = manual_route.external_route_id
         AND active_manual_route.is_active = TRUE
        LEFT JOIN telemetry.vehicle_operational_states s ON s.vehicle_id = v.id
        ORDER BY v.vehicle_code ASC, v.label ASC
      `
    );

    return result.rows;
  }

  async findScheduledTripCandidate(
    routeId: string,
    serviceDate: string,
    weekdayIndex: number,
    referenceSeconds: number,
    earlyToleranceSeconds: number,
    lateToleranceSeconds: number,
    lookaheadSeconds: number
  ): Promise<ScheduledTripCandidate | null> {
    const result = await this.pool.query<ScheduledTripCandidate>(
      `
        WITH trip_bounds AS (
          SELECT
            stop_times.trip_id,
            MIN(stop_times.arrival_offset_seconds) AS start_offset_seconds,
            MAX(stop_times.departure_offset_seconds) AS trip_end_offset_seconds
          FROM transit.stop_times stop_times
          GROUP BY stop_times.trip_id
        )
        SELECT
          trips.id::text AS "tripId",
          routes.id::text AS "routeId",
          routes.route_short_name AS "routeShortName",
          routes.route_long_name AS "routeLongName",
          trips.route_variant_id::text AS "routeVariantId",
          variants.headsign AS "routeVariantHeadsign",
          trips.trip_headsign AS "tripHeadsign",
          trips.trip_short_name AS "tripShortName",
          trips.direction_id AS "directionId",
          trip_bounds.start_offset_seconds AS "startOffsetSeconds",
          trip_bounds.trip_end_offset_seconds AS "tripEndOffsetSeconds",
          $2::text AS "serviceDate"
        FROM transit.trips trips
        INNER JOIN transit.routes routes ON routes.id = trips.route_id
        LEFT JOIN transit.route_variants variants ON variants.id = trips.route_variant_id
        INNER JOIN trip_bounds ON trip_bounds.trip_id = trips.id
        LEFT JOIN transit.service_calendar_dates service_exception
          ON service_exception.dataset_id = trips.dataset_id
         AND service_exception.service_id = trips.service_id
         AND service_exception.service_date = $2::date
        LEFT JOIN transit.service_calendars calendar
          ON calendar.dataset_id = trips.dataset_id
         AND calendar.service_id = trips.service_id
        WHERE trips.route_id = $1
          AND trips.is_active = TRUE
          AND (
            service_exception.exception_type = 1
            OR (
              COALESCE(service_exception.exception_type, 0) <> 2
              AND calendar.service_id IS NOT NULL
              AND $2::date BETWEEN calendar.start_date AND calendar.end_date
              AND CASE $3
                WHEN 0 THEN calendar.sunday
                WHEN 1 THEN calendar.monday
                WHEN 2 THEN calendar.tuesday
                WHEN 3 THEN calendar.wednesday
                WHEN 4 THEN calendar.thursday
                WHEN 5 THEN calendar.friday
                ELSE calendar.saturday
              END
            )
          )
          AND trip_bounds.trip_end_offset_seconds >= ($4 - $6)
          AND trip_bounds.start_offset_seconds <= ($4 + $7)
        ORDER BY
          CASE
            WHEN $4 BETWEEN (trip_bounds.start_offset_seconds - $5) AND (trip_bounds.trip_end_offset_seconds + $6) THEN 0
            WHEN trip_bounds.start_offset_seconds > $4 THEN 1
            ELSE 2
          END,
          CASE
            WHEN trip_bounds.start_offset_seconds > $4 THEN trip_bounds.start_offset_seconds - $4
            WHEN $4 > trip_bounds.trip_end_offset_seconds THEN $4 - trip_bounds.trip_end_offset_seconds
            ELSE ABS($4 - trip_bounds.start_offset_seconds)
          END,
          trip_bounds.start_offset_seconds ASC,
          trips.trip_headsign ASC NULLS LAST,
          trips.id ASC
        LIMIT 1
      `,
      [routeId, serviceDate, weekdayIndex, referenceSeconds, earlyToleranceSeconds, lateToleranceSeconds, lookaheadSeconds]
    );

    return result.rows[0] ?? null;
  }

  async findNextStopCandidate(tripId: string, referenceSeconds: number): Promise<NextStopCandidate | null> {
    const result = await this.pool.query<NextStopCandidate>(
      `
        SELECT
          stops.id::text AS "stopId",
          stops.stop_name AS "stopName",
          stops.stop_code AS "stopCode",
          stop_times.stop_sequence AS "stopSequence",
          stop_times.arrival_offset_seconds AS "arrivalOffsetSeconds",
          stop_times.departure_offset_seconds AS "departureOffsetSeconds"
        FROM transit.stop_times stop_times
        INNER JOIN transit.stops stops ON stops.id = stop_times.stop_id
        WHERE stop_times.trip_id = $1
          AND stop_times.departure_offset_seconds >= $2
        ORDER BY stop_times.stop_sequence ASC
        LIMIT 1
      `,
      [tripId, referenceSeconds]
    );

    return result.rows[0] ?? null;
  }

  async upsertRouteResolution(client: PoolClient, input: RouteResolutionUpsertInput): Promise<void> {
    await client.query(
      `
        INSERT INTO operations.vehicle_route_resolutions (
          vehicle_id,
          resolution_source,
          route_state,
          route_id,
          trip_id,
          route_variant_id,
          next_stop_id,
          direction_id,
          service_date,
          reference_time,
          reference_seconds,
          next_stop_sequence,
          trip_start_offset_seconds,
          trip_end_offset_seconds,
          resolution_metadata,
          evaluated_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
        ON CONFLICT (vehicle_id) DO UPDATE
        SET resolution_source = EXCLUDED.resolution_source,
            route_state = EXCLUDED.route_state,
            route_id = EXCLUDED.route_id,
            trip_id = EXCLUDED.trip_id,
            route_variant_id = EXCLUDED.route_variant_id,
            next_stop_id = EXCLUDED.next_stop_id,
            direction_id = EXCLUDED.direction_id,
            service_date = EXCLUDED.service_date,
            reference_time = EXCLUDED.reference_time,
            reference_seconds = EXCLUDED.reference_seconds,
            next_stop_sequence = EXCLUDED.next_stop_sequence,
            trip_start_offset_seconds = EXCLUDED.trip_start_offset_seconds,
            trip_end_offset_seconds = EXCLUDED.trip_end_offset_seconds,
            resolution_metadata = EXCLUDED.resolution_metadata,
            evaluated_at = EXCLUDED.evaluated_at,
            updated_at = NOW()
      `,
      [
        input.vehicleId,
        input.resolutionSource,
        input.routeState,
        input.routeId,
        input.tripId,
        input.routeVariantId,
        input.nextStopId,
        input.directionId,
        input.serviceDate,
        input.referenceTime,
        input.referenceSeconds,
        input.nextStopSequence,
        input.tripStartOffsetSeconds,
        input.tripEndOffsetSeconds,
        input.resolutionMetadata,
        input.evaluatedAt
      ]
    );
  }
}
