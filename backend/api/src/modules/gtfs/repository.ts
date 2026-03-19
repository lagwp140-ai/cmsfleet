import type { Pool, PoolClient } from "pg";

import type {
  GtfsDatasetRecord,
  GtfsImportActivationMode,
  GtfsImportErrorRecord,
  GtfsImportJobRecord,
  GtfsImportSourceType,
  GtfsOverview,
  GtfsValidationIssue,
  ParsedGtfsFeed
} from "./types.js";

export class GtfsRepository {
  constructor(private readonly pool: Pool) {}

  async connect(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async createImportJob(input: {
    activationMode: GtfsImportActivationMode;
    requestedByUserId: string | null;
    sourceType: GtfsImportSourceType;
    sourceUri: string;
    summary?: Record<string, unknown>;
  }): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `
        INSERT INTO operations.gtfs_import_jobs (
          requested_by_user_id,
          source_uri,
          source_type,
          activation_mode,
          status,
          summary,
          input_payload
        )
        VALUES ($1, $2, $3, $4, 'queued', $5, $5)
        RETURNING id::text AS id
      `,
      [input.requestedByUserId, input.sourceUri, input.sourceType, input.activationMode, input.summary ?? {}]
    );

    return result.rows[0]!.id;
  }

  async findDatasetById(datasetId: string): Promise<GtfsDatasetRecord | null> {
    const result = await this.pool.query<GtfsDatasetRecord>(
      `${DATASET_SELECT_SQL}
       WHERE d.id = $1`,
      [datasetId]
    );

    return result.rows[0] ?? null;
  }

  async getOverview(limit = 20): Promise<GtfsOverview> {
    const [activeDataset, datasets, jobs] = await Promise.all([
      this.getActiveDataset(),
      this.listDatasets(limit),
      this.listJobs(limit)
    ]);

    return {
      activeDataset,
      datasets,
      jobs
    };
  }

  async getActiveDataset(): Promise<GtfsDatasetRecord | null> {
    const result = await this.pool.query<GtfsDatasetRecord>(
      `${DATASET_SELECT_SQL}
       WHERE d.is_active = TRUE
       LIMIT 1`
    );

    return result.rows[0] ?? null;
  }

  async getActiveDatasetForClient(client: PoolClient): Promise<GtfsDatasetRecord | null> {
    const result = await client.query<GtfsDatasetRecord>(
      `${DATASET_SELECT_SQL}
       WHERE d.is_active = TRUE
       LIMIT 1`
    );

    return result.rows[0] ?? null;
  }

  async listDatasets(limit: number): Promise<GtfsDatasetRecord[]> {
    const result = await this.pool.query<GtfsDatasetRecord>(
      `${DATASET_SELECT_SQL}
       ORDER BY d.created_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  async listErrors(jobId: string, limit: number): Promise<GtfsImportErrorRecord[]> {
    const result = await this.pool.query<GtfsImportErrorRecord>(
      `
        SELECT
          id::text AS id,
          import_job_id::text AS "importJobId",
          severity,
          file_name AS "fileName",
          row_number AS "rowNumber",
          field_name AS "fieldName",
          entity_key AS "entityKey",
          message,
          raw_row AS "rawRow",
          created_at::text AS "createdAt"
        FROM operations.gtfs_import_errors
        WHERE import_job_id = $1
        ORDER BY created_at ASC, id ASC
        LIMIT $2
      `,
      [jobId, limit]
    );

    return result.rows;
  }

  async listJobs(limit: number): Promise<GtfsImportJobRecord[]> {
    const result = await this.pool.query<GtfsImportJobRecord>(
      `
        SELECT
          id::text AS id,
          requested_by_user_id::text AS "requestedByUserId",
          source_uri AS "sourceUri",
          source_type AS "sourceType",
          activation_mode AS "activationMode",
          status,
          feed_version AS "feedVersion",
          started_at::text AS "startedAt",
          finished_at::text AS "finishedAt",
          rows_processed AS "rowsProcessed",
          routes_upserted AS "routeCount",
          trips_upserted AS "tripCount",
          stops_upserted AS "stopCount",
          stop_times_upserted AS "stopTimeCount",
          error_message AS "errorMessage",
          summary,
          validation_error_count AS "validationErrorCount",
          warning_count AS "warningCount",
          dataset_id::text AS "datasetId",
          created_at::text AS "createdAt"
        FROM operations.gtfs_import_jobs
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [limit]
    );

    return result.rows;
  }

  async activateDataset(client: PoolClient, datasetId: string, activatedByUserId: string | null): Promise<void> {
    await client.query(
      `
        UPDATE operations.gtfs_datasets
        SET is_active = FALSE,
            status = CASE WHEN is_active = TRUE THEN 'archived' ELSE status END
        WHERE is_active = TRUE
          AND id <> $1
      `,
      [datasetId]
    );

    await client.query(
      `
        UPDATE operations.gtfs_datasets
        SET is_active = TRUE,
            status = 'active',
            activated_at = NOW(),
            activated_by_user_id = $2
        WHERE id = $1
      `,
      [datasetId, activatedByUserId]
    );

    await client.query(
      `
        UPDATE transit.routes
        SET is_active = (dataset_id = $1)
        WHERE dataset_id IS NOT NULL
      `,
      [datasetId]
    );

    await client.query(
      `
        UPDATE transit.trips
        SET is_active = (dataset_id = $1)
        WHERE dataset_id IS NOT NULL
      `,
      [datasetId]
    );

    await client.query(
      `
        UPDATE transit.route_variants variant
        SET is_active = routes.dataset_id = $1
        FROM transit.routes routes
        WHERE variant.route_id = routes.id
      `,
      [datasetId]
    );
  }

  async clearJobArtifacts(client: PoolClient, jobId: string): Promise<void> {
    await client.query(`DELETE FROM operations.gtfs_import_errors WHERE import_job_id = $1`, [jobId]);
    await client.query(`DELETE FROM operations.gtfs_staging_service_calendar_dates WHERE import_job_id = $1`, [jobId]);
    await client.query(`DELETE FROM operations.gtfs_staging_service_calendars WHERE import_job_id = $1`, [jobId]);
    await client.query(`DELETE FROM operations.gtfs_staging_stop_times WHERE import_job_id = $1`, [jobId]);
    await client.query(`DELETE FROM operations.gtfs_staging_trips WHERE import_job_id = $1`, [jobId]);
    await client.query(`DELETE FROM operations.gtfs_staging_stops WHERE import_job_id = $1`, [jobId]);
    await client.query(`DELETE FROM operations.gtfs_staging_routes WHERE import_job_id = $1`, [jobId]);
  }

  async createDataset(client: PoolClient, input: {
    datasetLabel: string;
    feedHash: string | null;
    fileName: string | null;
    importJobId: string;
    previousDatasetId: string | null;
    sourceType: GtfsImportSourceType;
    sourceUri: string | null;
    summary: Record<string, unknown>;
    validationSummary: Record<string, unknown>;
  }): Promise<string> {
    const result = await client.query<{ id: string }>(
      `
        INSERT INTO operations.gtfs_datasets (
          import_job_id,
          dataset_label,
          source_type,
          source_uri,
          file_name,
          feed_hash,
          status,
          previous_dataset_id,
          summary,
          validation_summary
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'validated', $7, $8, $9)
        RETURNING id::text AS id
      `,
      [
        input.importJobId,
        input.datasetLabel,
        input.sourceType,
        input.sourceUri,
        input.fileName,
        input.feedHash,
        input.previousDatasetId,
        input.summary,
        input.validationSummary
      ]
    );

    return result.rows[0]!.id;
  }

  async insertImportErrors(client: PoolClient, jobId: string, issues: GtfsValidationIssue[]): Promise<void> {
    for (const issue of issues) {
      await client.query(
        `
          INSERT INTO operations.gtfs_import_errors (
            import_job_id,
            severity,
            file_name,
            row_number,
            field_name,
            entity_key,
            message,
            raw_row
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [jobId, issue.severity, issue.fileName, issue.rowNumber, issue.fieldName, issue.entityKey, issue.message, issue.rawRow]
      );
    }
  }

  async loadDataset(client: PoolClient, datasetId: string, feed: ParsedGtfsFeed, activateDataset: boolean): Promise<{
    routeCount: number;
    stopCount: number;
    stopTimeCount: number;
    tripCount: number;
  }> {
    const routeMap = new Map<string, string>();
    const stopMap = new Map<string, string>();
    const variantMap = new Map<string, string>();
    const tripMap = new Map<string, string>();

    for (const route of feed.routes) {
      const result = await client.query<{ id: string }>(
        `
          INSERT INTO transit.routes (
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
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
          RETURNING id::text AS id
        `,
        [datasetId, route.agencyId, route.externalRouteId, route.routeShortName, route.routeLongName, route.routeType, route.routeColor, route.routeTextColor, route.sortOrder, activateDataset, route.rawRow]
      );

      routeMap.set(route.externalRouteId, result.rows[0]!.id);
    }

    for (const stop of feed.stops) {
      const result = await client.query<{ id: string }>(
        `
          INSERT INTO transit.stops (
            dataset_id,
            agency_id,
            external_stop_id,
            stop_code,
            stop_name,
            stop_desc,
            latitude,
            longitude,
            timezone,
            platform_code,
            wheelchair_boarding,
            metadata,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
          RETURNING id::text AS id
        `,
        [datasetId, stop.agencyId, stop.externalStopId, stop.stopCode, stop.stopName, stop.stopDesc, stop.latitude, stop.longitude, stop.timezone, stop.platformCode, stop.wheelchairBoarding, stop.rawRow]
      );

      stopMap.set(stop.externalStopId, result.rows[0]!.id);
    }

    for (const stop of feed.stops) {
      if (!stop.parentExternalStopId) {
        continue;
      }

      const stopId = stopMap.get(stop.externalStopId);
      const parentStopId = stopMap.get(stop.parentExternalStopId);

      if (!stopId || !parentStopId) {
        continue;
      }

      await client.query(`UPDATE transit.stops SET parent_stop_id = $2 WHERE id = $1`, [stopId, parentStopId]);
    }

    for (const serviceCalendar of feed.serviceCalendars) {
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
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
        [
          datasetId,
          serviceCalendar.serviceId,
          serviceCalendar.monday,
          serviceCalendar.tuesday,
          serviceCalendar.wednesday,
          serviceCalendar.thursday,
          serviceCalendar.friday,
          serviceCalendar.saturday,
          serviceCalendar.sunday,
          serviceCalendar.startDate,
          serviceCalendar.endDate,
          serviceCalendar.rawRow
        ]
      );
    }

    for (const serviceException of feed.serviceCalendarDates) {
      await client.query(
        `
          INSERT INTO transit.service_calendar_dates (
            dataset_id,
            service_id,
            service_date,
            exception_type,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [datasetId, serviceException.serviceId, serviceException.serviceDate, serviceException.exceptionType, serviceException.rawRow]
      );
    }

    for (const trip of feed.trips) {
      const routeId = routeMap.get(trip.routeExternalId);

      if (!routeId) {
        continue;
      }

      const variantKey = `${routeId}:${trip.variantCode}`;

      if (!variantMap.has(variantKey)) {
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO transit.route_variants (
              route_id,
              variant_code,
              direction_id,
              headsign,
              is_active,
              metadata,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
            RETURNING id::text AS id
          `,
          [routeId, trip.variantCode, trip.directionId, trip.tripHeadsign, activateDataset, trip.rawRow]
        );

        variantMap.set(variantKey, result.rows[0]!.id);
      }
    }

    for (const trip of feed.trips) {
      const routeId = routeMap.get(trip.routeExternalId);
      const variantId = variantMap.get(`${routeId}:${trip.variantCode}`);

      if (!routeId) {
        continue;
      }

      const result = await client.query<{ id: string }>(
        `
          INSERT INTO transit.trips (
            dataset_id,
            agency_id,
            external_trip_id,
            route_id,
            route_variant_id,
            service_id,
            trip_headsign,
            trip_short_name,
            direction_id,
            block_id,
            shape_id,
            wheelchair_accessible,
            bikes_allowed,
            is_active,
            metadata,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
          RETURNING id::text AS id
        `,
        [datasetId, trip.agencyId, trip.externalTripId, routeId, variantId ?? null, trip.serviceId, trip.tripHeadsign, trip.tripShortName, trip.directionId, trip.blockId, trip.shapeId, trip.wheelchairAccessible, trip.bikesAllowed, activateDataset, trip.rawRow]
      );

      tripMap.set(trip.externalTripId, result.rows[0]!.id);
    }

    for (const stopTime of feed.stopTimes) {
      const tripId = tripMap.get(stopTime.tripExternalId);
      const stopId = stopMap.get(stopTime.externalStopId);

      if (!tripId || !stopId) {
        continue;
      }

      await client.query(
        `
          INSERT INTO transit.stop_times (
            trip_id,
            stop_sequence,
            stop_id,
            arrival_offset_seconds,
            departure_offset_seconds,
            pickup_type,
            drop_off_type,
            timepoint,
            shape_dist_traveled,
            stop_headsign,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [tripId, stopTime.stopSequence, stopId, stopTime.arrivalOffsetSeconds, stopTime.departureOffsetSeconds, stopTime.pickupType, stopTime.dropOffType, stopTime.timepoint, stopTime.shapeDistTraveled, stopTime.stopHeadsign, stopTime.rawRow]
      );
    }

    return {
      routeCount: feed.routes.length,
      stopCount: feed.stops.length,
      stopTimeCount: feed.stopTimes.length,
      tripCount: feed.trips.length
    };
  }

  async stageFeed(client: PoolClient, jobId: string, feed: ParsedGtfsFeed): Promise<void> {
    for (const route of feed.routes) {
      await client.query(
        `
          INSERT INTO operations.gtfs_staging_routes (
            import_job_id,
            row_number,
            agency_id,
            external_route_id,
            route_short_name,
            route_long_name,
            route_type,
            route_color,
            route_text_color,
            sort_order,
            raw_row
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [jobId, route.rowNumber, route.agencyId, route.externalRouteId, route.routeShortName, route.routeLongName, route.routeType, route.routeColor, route.routeTextColor, route.sortOrder, route.rawRow]
      );
    }

    for (const stop of feed.stops) {
      await client.query(
        `
          INSERT INTO operations.gtfs_staging_stops (
            import_job_id,
            row_number,
            agency_id,
            external_stop_id,
            stop_code,
            stop_name,
            stop_desc,
            latitude,
            longitude,
            timezone,
            platform_code,
            parent_external_stop_id,
            wheelchair_boarding,
            raw_row
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `,
        [jobId, stop.rowNumber, stop.agencyId, stop.externalStopId, stop.stopCode, stop.stopName, stop.stopDesc, stop.latitude, stop.longitude, stop.timezone, stop.platformCode, stop.parentExternalStopId, stop.wheelchairBoarding, stop.rawRow]
      );
    }

    for (const serviceCalendar of feed.serviceCalendars) {
      await client.query(
        `
          INSERT INTO operations.gtfs_staging_service_calendars (
            import_job_id,
            row_number,
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
            raw_row
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `,
        [jobId, serviceCalendar.rowNumber, serviceCalendar.serviceId, serviceCalendar.monday, serviceCalendar.tuesday, serviceCalendar.wednesday, serviceCalendar.thursday, serviceCalendar.friday, serviceCalendar.saturday, serviceCalendar.sunday, serviceCalendar.startDate, serviceCalendar.endDate, serviceCalendar.rawRow]
      );
    }

    for (const serviceException of feed.serviceCalendarDates) {
      await client.query(
        `
          INSERT INTO operations.gtfs_staging_service_calendar_dates (
            import_job_id,
            row_number,
            service_id,
            service_date,
            exception_type,
            raw_row
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [jobId, serviceException.rowNumber, serviceException.serviceId, serviceException.serviceDate, serviceException.exceptionType, serviceException.rawRow]
      );
    }

    for (const trip of feed.trips) {
      await client.query(
        `
          INSERT INTO operations.gtfs_staging_trips (
            import_job_id,
            row_number,
            agency_id,
            external_trip_id,
            route_external_id,
            service_id,
            trip_headsign,
            trip_short_name,
            direction_id,
            block_id,
            shape_id,
            wheelchair_accessible,
            bikes_allowed,
            variant_code,
            raw_row
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `,
        [jobId, trip.rowNumber, trip.agencyId, trip.externalTripId, trip.routeExternalId, trip.serviceId, trip.tripHeadsign, trip.tripShortName, trip.directionId, trip.blockId, trip.shapeId, trip.wheelchairAccessible, trip.bikesAllowed, trip.variantCode, trip.rawRow]
      );
    }

    for (const stopTime of feed.stopTimes) {
      await client.query(
        `
          INSERT INTO operations.gtfs_staging_stop_times (
            import_job_id,
            row_number,
            trip_external_id,
            external_stop_id,
            stop_sequence,
            arrival_offset_seconds,
            departure_offset_seconds,
            pickup_type,
            drop_off_type,
            timepoint,
            shape_dist_traveled,
            stop_headsign,
            raw_row
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `,
        [jobId, stopTime.rowNumber, stopTime.tripExternalId, stopTime.externalStopId, stopTime.stopSequence, stopTime.arrivalOffsetSeconds, stopTime.departureOffsetSeconds, stopTime.pickupType, stopTime.dropOffType, stopTime.timepoint, stopTime.shapeDistTraveled, stopTime.stopHeadsign, stopTime.rawRow]
      );
    }
  }

  async updateDatasetLifecycle(client: PoolClient, datasetId: string, input: {
    activatedByUserId?: string | null;
    isActive?: boolean;
    status: string;
    summary?: Record<string, unknown>;
    validationSummary?: Record<string, unknown>;
  }): Promise<void> {
    await client.query(
      `
        UPDATE operations.gtfs_datasets
        SET status = $2,
            is_active = COALESCE($3, is_active),
            activated_at = CASE WHEN $3 = TRUE THEN NOW() ELSE activated_at END,
            activated_by_user_id = CASE WHEN $3 = TRUE THEN $4 ELSE activated_by_user_id END,
            summary = COALESCE($5, summary),
            validation_summary = COALESCE($6, validation_summary)
        WHERE id = $1
      `,
      [datasetId, input.status, input.isActive ?? null, input.activatedByUserId ?? null, input.summary ?? null, input.validationSummary ?? null]
    );
  }

  async updateJob(client: PoolClient, jobId: string, input: {
    datasetId?: string | null;
    errorMessage?: string | null;
    feedVersion?: string | null;
    finished?: boolean;
    routeCount?: number;
    rowsProcessed?: number;
    started?: boolean;
    status: GtfsImportJobRecord["status"];
    stopCount?: number;
    stopTimeCount?: number;
    summary?: Record<string, unknown>;
    tripCount?: number;
    validationErrorCount?: number;
    warningCount?: number;
  }): Promise<void> {
    await client.query(
      `
        UPDATE operations.gtfs_import_jobs
        SET status = $2,
            started_at = CASE WHEN $3 THEN COALESCE(started_at, NOW()) ELSE started_at END,
            finished_at = CASE WHEN $4 THEN NOW() ELSE finished_at END,
            routes_upserted = COALESCE($5, routes_upserted),
            trips_upserted = COALESCE($6, trips_upserted),
            stops_upserted = COALESCE($7, stops_upserted),
            stop_times_upserted = COALESCE($8, stop_times_upserted),
            rows_processed = COALESCE($9, rows_processed),
            error_message = $10,
            summary = COALESCE($11, summary),
            feed_version = COALESCE($12, feed_version),
            validation_error_count = COALESCE($13, validation_error_count),
            warning_count = COALESCE($14, warning_count),
            dataset_id = COALESCE($15, dataset_id)
        WHERE id = $1
      `,
      [
        jobId,
        input.status,
        input.started ?? false,
        input.finished ?? false,
        input.routeCount ?? null,
        input.tripCount ?? null,
        input.stopCount ?? null,
        input.stopTimeCount ?? null,
        input.rowsProcessed ?? null,
        input.errorMessage ?? null,
        input.summary ?? null,
        input.feedVersion ?? null,
        input.validationErrorCount ?? null,
        input.warningCount ?? null,
        input.datasetId ?? null
      ]
    );
  }
}

const DATASET_SELECT_SQL = `
  SELECT
    d.id::text AS id,
    d.import_job_id::text AS "importJobId",
    d.dataset_label AS "datasetLabel",
    d.source_type AS "sourceType",
    d.source_uri AS "sourceUri",
    d.file_name AS "fileName",
    d.feed_hash AS "feedHash",
    d.status,
    d.is_active AS "isActive",
    d.activated_at::text AS "activatedAt",
    d.activated_by_user_id::text AS "activatedByUserId",
    d.previous_dataset_id::text AS "previousDatasetId",
    d.summary,
    d.validation_summary AS "validationSummary",
    d.created_at::text AS "createdAt",
    COALESCE(route_counts.route_count, 0) AS "routeCount",
    COALESCE(trip_counts.trip_count, 0) AS "tripCount",
    COALESCE(stop_counts.stop_count, 0) AS "stopCount",
    COALESCE(stop_time_counts.stop_time_count, 0) AS "stopTimeCount"
  FROM operations.gtfs_datasets d
  LEFT JOIN (
    SELECT dataset_id, COUNT(*)::integer AS route_count
    FROM transit.routes
    WHERE dataset_id IS NOT NULL
    GROUP BY dataset_id
  ) route_counts ON route_counts.dataset_id = d.id
  LEFT JOIN (
    SELECT dataset_id, COUNT(*)::integer AS trip_count
    FROM transit.trips
    WHERE dataset_id IS NOT NULL
    GROUP BY dataset_id
  ) trip_counts ON trip_counts.dataset_id = d.id
  LEFT JOIN (
    SELECT dataset_id, COUNT(*)::integer AS stop_count
    FROM transit.stops
    WHERE dataset_id IS NOT NULL
    GROUP BY dataset_id
  ) stop_counts ON stop_counts.dataset_id = d.id
  LEFT JOIN (
    SELECT trips.dataset_id, COUNT(*)::integer AS stop_time_count
    FROM transit.stop_times stop_times
    INNER JOIN transit.trips trips ON trips.id = stop_times.trip_id
    WHERE trips.dataset_id IS NOT NULL
    GROUP BY trips.dataset_id
  ) stop_time_counts ON stop_time_counts.dataset_id = d.id
`;
