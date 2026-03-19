import type { Pool } from "pg";

import type { VehicleDisplayLiveContext } from "./types.js";

interface VehicleDisplayLiveRow {
  isEnabled: boolean;
  label: string;
  nextStopName: string | null;
  operationalStatus: string;
  resolutionSource: string | null;
  routeLongName: string | null;
  routeShortName: string | null;
  routeState: string | null;
  tripHeadsign: string | null;
  tripShortName: string | null;
  vehicleCode: string;
  vehicleId: string;
}

export class DisplayRepository {
  constructor(private readonly pool: Pool) {}

  async findVehicleLiveContext(vehicleIdentifier: string): Promise<VehicleDisplayLiveContext | null> {
    const result = await this.pool.query<VehicleDisplayLiveRow>(
      `
        SELECT
          v.id::text AS "vehicleId",
          v.vehicle_code AS "vehicleCode",
          v.label,
          v.is_enabled AS "isEnabled",
          v.status AS "operationalStatus",
          resolution.route_state AS "routeState",
          resolution.resolution_source AS "resolutionSource",
          route.route_short_name AS "routeShortName",
          route.route_long_name AS "routeLongName",
          trip.trip_headsign AS "tripHeadsign",
          trip.trip_short_name AS "tripShortName",
          next_stop.stop_name AS "nextStopName"
        FROM fleet.vehicles v
        LEFT JOIN operations.vehicle_route_resolutions resolution ON resolution.vehicle_id = v.id
        LEFT JOIN transit.routes route ON route.id = COALESCE(resolution.route_id, v.manual_route_id)
        LEFT JOIN transit.trips trip ON trip.id = resolution.trip_id
        LEFT JOIN transit.stops next_stop ON next_stop.id = resolution.next_stop_id
        WHERE v.id::text = $1
           OR v.vehicle_code = $1
        ORDER BY CASE WHEN v.id::text = $1 THEN 0 ELSE 1 END
        LIMIT 1
      `,
      [vehicleIdentifier]
    );

    return result.rows[0] ?? null;
  }
}
