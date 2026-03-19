BEGIN;

DROP INDEX IF EXISTS operations.operations_vehicle_route_resolutions_route_trip_idx;
DROP INDEX IF EXISTS operations.operations_vehicle_route_resolutions_state_eval_idx;
DROP TABLE IF EXISTS operations.vehicle_route_resolutions;

DROP TABLE IF EXISTS operations.gtfs_staging_service_calendar_dates;
DROP TABLE IF EXISTS operations.gtfs_staging_service_calendars;

DROP INDEX IF EXISTS transit.transit_service_calendar_dates_lookup_idx;
DROP TABLE IF EXISTS transit.service_calendar_dates;

DROP INDEX IF EXISTS transit.transit_service_calendars_range_idx;
DROP TABLE IF EXISTS transit.service_calendars;

COMMIT;
