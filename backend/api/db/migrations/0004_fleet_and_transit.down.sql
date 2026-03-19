BEGIN;

DROP TABLE IF EXISTS transit.stop_times;
DROP TABLE IF EXISTS transit.trips;
DROP TABLE IF EXISTS transit.route_variants;
DROP TABLE IF EXISTS transit.stops;
DROP TABLE IF EXISTS transit.routes;
DROP TABLE IF EXISTS fleet.vehicles;
DROP TABLE IF EXISTS fleet.display_profiles;
DROP TABLE IF EXISTS fleet.device_profiles;

COMMIT;
